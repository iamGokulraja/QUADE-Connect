-- ============================================================
-- QUADE Connect — Update 12: independent QC (Quality Control) role
-- Safe to run more than once. Run in the Supabase SQL editor.
-- ============================================================

-- 1. Allow 'qc' in profiles.role (works for a CHECK constraint or an enum type) ------------
do $$
declare c record; t text; has_enum boolean := false;
begin
  select format_type(a.atttypid, a.atttypmod), (select typtype = 'e' from pg_type where oid = a.atttypid)
    into t, has_enum
  from pg_attribute a where a.attrelid = 'public.profiles'::regclass and a.attname = 'role' and not a.attisdropped;
  if has_enum then
    execute format('alter type %s add value if not exists %L', t, 'qc');
  else
    for c in select conname from pg_constraint
             where conrelid = 'public.profiles'::regclass and contype = 'c'
               and pg_get_constraintdef(oid) ilike '%role%' loop
      execute format('alter table public.profiles drop constraint %I', c.conname);
    end loop;
    alter table public.profiles add constraint profiles_role_check
      check (role in ('admin','hr','project_manager','team_lead','employee','client','qc'));
  end if;
end $$;

-- 2. Helpers --------------------------------------------------------------------------------
create or replace function public.qc_is_quality() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.qc_role() = 'qc', false) $$;

create or replace function public.qc_can_view_grades() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.qc_role() in ('qc','hr','admin'), false) $$;

-- QC counts as an internal user (Spotlight, Documents, ...). Clients still do NOT.
create or replace function public.qc_is_internal() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.qc_role() in ('admin','hr','project_manager','team_lead','employee','qc'), false) $$;

-- 3. Read-only organisation-wide visibility for QC (additive policies, nothing is removed) ---
do $$
declare t text;
begin
  foreach t in array array['projects','teams','team_members','project_team_assignments','project_manager_team_leads','tasks','task_boards','board_owners','task_assignees','task_groups']
  loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists qc_quality_read on public.%I', t);
      execute format('create policy qc_quality_read on public.%I for select to authenticated using (public.qc_is_quality())', t);
    end if;
  end loop;
end $$;

drop policy if exists qc_quality_read on public.profiles;
create policy qc_quality_read on public.profiles for select to authenticated
  using (public.qc_is_quality() and role::text <> 'client');

do $$ begin
  if to_regclass('public.task_attachments') is not null then
    drop policy if exists qc_quality_read on public.task_attachments;
    create policy qc_quality_read on public.task_attachments for select to authenticated using (public.qc_is_quality());
  end if;
end $$;
-- QC can open (preview / download) the files uploaded to tasks
drop policy if exists qc_quality_taskfiles_select on storage.objects;
create policy qc_quality_taskfiles_select on storage.objects for select to authenticated
  using (bucket_id = 'task-files' and public.qc_is_quality());

-- Attendance / leave / hierarchy stay private: QC has no policy there on purpose.

-- 4. Project QC review status ----------------------------------------------------------------
create table if not exists public.qc_project_reviews (
  project_id uuid primary key references public.projects(id) on delete cascade,
  status text not null default 'awaiting' check (status in ('awaiting','under_review','approved','rework')),
  remarks text,
  updated_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now()
);
alter table public.qc_project_reviews enable row level security;
drop policy if exists qc_reviews_select on public.qc_project_reviews;
create policy qc_reviews_select on public.qc_project_reviews for select to authenticated using (public.qc_can_view_grades());
drop policy if exists qc_reviews_insert on public.qc_project_reviews;
create policy qc_reviews_insert on public.qc_project_reviews for insert to authenticated with check (public.qc_is_quality());
drop policy if exists qc_reviews_update on public.qc_project_reviews;
create policy qc_reviews_update on public.qc_project_reviews for update to authenticated
  using (public.qc_is_quality()) with check (public.qc_is_quality());

-- 5. QC activity log ---------------------------------------------------------------------------
create table if not exists public.qc_activity (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  target_user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  detail text,
  created_at timestamptz not null default now()
);
create index if not exists qc_activity_created_idx on public.qc_activity(created_at desc);
alter table public.qc_activity enable row level security;
drop policy if exists qc_activity_select on public.qc_activity;
create policy qc_activity_select on public.qc_activity for select to authenticated using (public.qc_can_view_grades());
-- no insert/update/delete policies: rows are written only by the triggers below

-- 6. Grades (current grade per person per project) + full history ---------------------------------
create table if not exists public.qc_grades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,   -- null = overall grade
  grade text not null check (grade in ('A+','A','B','C')),
  remarks text,
  graded_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists qc_grades_user_project_uq
  on public.qc_grades (user_id, coalesce(project_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists qc_grades_project_idx on public.qc_grades(project_id);

create table if not exists public.qc_grade_history (
  id uuid primary key default gen_random_uuid(),
  grade_id uuid references public.qc_grades(id) on delete set null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  old_grade text,
  new_grade text not null,
  old_remarks text,
  new_remarks text,
  changed_by uuid references public.profiles(id) on delete set null,
  changed_at timestamptz not null default now()
);
create index if not exists qc_grade_history_user_idx on public.qc_grade_history(user_id, changed_at desc);

alter table public.qc_grades enable row level security;
alter table public.qc_grade_history enable row level security;
drop policy if exists qc_grades_select on public.qc_grades;
create policy qc_grades_select on public.qc_grades for select to authenticated using (public.qc_can_view_grades());
drop policy if exists qc_grades_insert on public.qc_grades;
create policy qc_grades_insert on public.qc_grades for insert to authenticated with check (public.qc_is_quality());
drop policy if exists qc_grades_update on public.qc_grades;
create policy qc_grades_update on public.qc_grades for update to authenticated
  using (public.qc_is_quality()) with check (public.qc_is_quality());
drop policy if exists qc_grade_history_select on public.qc_grade_history;
create policy qc_grade_history_select on public.qc_grade_history for select to authenticated using (public.qc_can_view_grades());

-- Validation + audit
create or replace function public.qc_grades_before() returns trigger
language plpgsql security definer set search_path = public as $$
declare r text;
begin
  select role::text into r from public.profiles where id = new.user_id;
  if r is null or r not in ('employee','team_lead') then
    raise exception 'QC grades can only be given to Employees and Team Leads.';
  end if;
  new.graded_by := auth.uid();
  new.updated_at := now();
  if tg_op = 'UPDATE' then new.user_id := old.user_id; new.project_id := old.project_id; end if;
  return new;
end $$;
drop trigger if exists qc_grades_before_trg on public.qc_grades;
create trigger qc_grades_before_trg before insert or update on public.qc_grades
  for each row execute function public.qc_grades_before();

create or replace function public.qc_grades_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare who text; proj text;
begin
  if tg_op = 'UPDATE' and old.grade is not distinct from new.grade and old.remarks is not distinct from new.remarks then return null; end if;
  insert into public.qc_grade_history(grade_id, user_id, project_id, old_grade, new_grade, old_remarks, new_remarks, changed_by)
  values (new.id, new.user_id, new.project_id,
          case when tg_op = 'UPDATE' then old.grade end, new.grade,
          case when tg_op = 'UPDATE' then old.remarks end, new.remarks, auth.uid());
  select coalesce(full_name, email) into who from public.profiles where id = new.user_id;
  select name into proj from public.projects where id = new.project_id;
  insert into public.qc_activity(actor_id, project_id, target_user_id, action, detail)
  values (auth.uid(), new.project_id, new.user_id, case when tg_op = 'INSERT' then 'grade_assigned' else 'grade_updated' end,
          coalesce(who, 'User') || ' graded ' || new.grade || coalesce(' on ' || proj, ' (overall)'));
  return null;
end $$;
drop trigger if exists qc_grades_after_trg on public.qc_grades;
create trigger qc_grades_after_trg after insert or update on public.qc_grades
  for each row execute function public.qc_grades_after();

create or replace function public.qc_reviews_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare proj text;
begin
  new.updated_at := now(); new.updated_by := auth.uid();
  return new;
end $$;
drop trigger if exists qc_reviews_before_trg on public.qc_project_reviews;
create trigger qc_reviews_before_trg before insert or update on public.qc_project_reviews
  for each row execute function public.qc_reviews_after();

create or replace function public.qc_reviews_log() returns trigger
language plpgsql security definer set search_path = public as $$
declare proj text;
begin
  if tg_op = 'UPDATE' and old.status = new.status and old.remarks is not distinct from new.remarks then return null; end if;
  select name into proj from public.projects where id = new.project_id;
  insert into public.qc_activity(actor_id, project_id, action, detail)
  values (auth.uid(), new.project_id, 'review_' || new.status, coalesce(proj, 'Project') || ' marked ' || replace(new.status, '_', ' '));
  return null;
end $$;
drop trigger if exists qc_reviews_log_trg on public.qc_project_reviews;
create trigger qc_reviews_log_trg after insert or update on public.qc_project_reviews
  for each row execute function public.qc_reviews_log();

-- 7. Spotlight post notifications now include QC ------------------------------------------------
create or replace function public.qc_sp_notify_post() returns trigger
language plpgsql security definer set search_path = public as $$
declare who text;
begin
  select coalesce(full_name, email) into who from public.profiles where id = new.user_id;
  insert into public.spotlight_notifications(recipient_id, actor_id, post_id, type, message)
  select p.id, new.user_id, new.id, 'post', coalesce(who, 'Someone') || ' shared a new post in Spotlight'
  from public.profiles p
  where p.id <> new.user_id and p.is_active and p.role::text in ('admin','hr','project_manager','team_lead','employee','qc');
  return null;
end $$;

-- 8. Notify QC when a project is completed (ready for verification) ---------------------------
create or replace function public.qc_notify_project_ready() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status::text = 'completed' and old.status::text is distinct from 'completed' and to_regclass('public.work_notifications') is not null then
    insert into public.work_notifications(recipient_id, type, title, message, project_id, dedupe_key)
    select p.id, 'qc_ready', 'Project awaiting QC', 'The project "' || new.name || '" is completed and awaits QC verification.', new.id, 'qc-ready:' || new.id || ':' || p.id
    from public.profiles p where p.role::text = 'qc' and p.is_active
    on conflict do nothing;
  end if;
  return null;
exception when others then return null;   -- never block a project update because of a notification
end $$;
drop trigger if exists qc_notify_project_ready_trg on public.projects;
create trigger qc_notify_project_ready_trg after update of status on public.projects
  for each row execute function public.qc_notify_project_ready();

-- 9. Table privileges (RLS above decides who can actually do what) ------------------------------
grant select on public.qc_project_reviews, public.qc_activity, public.qc_grades, public.qc_grade_history to authenticated;
grant insert, update on public.qc_project_reviews, public.qc_grades to authenticated;
