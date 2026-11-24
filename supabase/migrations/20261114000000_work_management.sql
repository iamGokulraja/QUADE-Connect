-- QUADE Connect: task management and attendance.
-- Safe to run more than once. It only ADDS tables, columns, functions, triggers and policies.
-- New policies and functions are prefixed "qc_" so nothing existing is dropped or replaced.

-- ============================================================
-- 0. PREPARE: the helper functions below read these task columns, so they must exist first
-- ============================================================
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  created_at timestamptz not null default now()
);
alter table public.tasks add column if not exists project_id uuid references public.projects(id) on delete cascade;
alter table public.tasks add column if not exists team_id uuid references public.teams(id) on delete set null;
alter table public.tasks add column if not exists assigned_to uuid references public.profiles(id) on delete set null;
alter table public.tasks add column if not exists created_by uuid references public.profiles(id) on delete set null default auth.uid();

-- ============================================================
-- 1. HELPER FUNCTIONS (security definer: they bypass RLS, so policies never recurse)
-- ============================================================
create or replace function public.qc_role() returns text
language sql stable security definer set search_path = public as $$
  select role::text from public.profiles where id = auth.uid() and is_active
$$;

create or replace function public.qc_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.qc_role() = 'admin', false)
$$;

create or replace function public.qc_is_hr_or_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.qc_role() in ('admin', 'hr'), false)
$$;

create or replace function public.qc_leads_team(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select t is not null and public.qc_role() is not null and exists (
    select 1 from public.teams where id = t and team_lead_id = auth.uid())
$$;

create or replace function public.qc_manages_project(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p is not null and public.qc_role() is not null and exists (
    select 1 from public.projects where id = p and project_manager_id = auth.uid())
$$;

create or replace function public.qc_team_on_project(t uuid, p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.project_team_assignments where team_id = t and project_id = p)
$$;

-- Is the target employee a member of a team I lead?
create or replace function public.qc_leads_employee(e uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.qc_role() is not null and exists (
    select 1 from public.team_members m join public.teams t on t.id = m.team_id
    where m.employee_id = e and t.team_lead_id = auth.uid())
$$;

-- Is this task assigned to me?
create or replace function public.qc_owns_task(task uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tasks where id = task and assigned_to = auth.uid())
$$;

create or replace function public.qc_can_view_task(task uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.qc_role() is not null and exists (
    select 1 from public.tasks t where t.id = task and (
      public.qc_is_admin() or t.assigned_to = auth.uid() or t.created_by = auth.uid()
      or public.qc_leads_team(t.team_id) or public.qc_manages_project(t.project_id)))
$$;

create or replace function public.qc_can_work_task(task uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.qc_role() is not null and exists (
    select 1 from public.tasks t where t.id = task and (
      public.qc_is_admin() or t.assigned_to = auth.uid() or public.qc_leads_team(t.team_id)))
$$;

-- Which profiles may I see? Everyone I work with: my team, my team lead, the people on my
-- projects, and the project manager of the projects my team works on. HR/Admin see everyone.
create or replace function public.qc_can_see_profile(target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    target = auth.uid()
    or public.qc_role() in ('admin', 'hr')
    or exists (
      select 1 from public.teams t
      where (t.team_lead_id = auth.uid()
             or exists (select 1 from public.team_members m where m.team_id = t.id and m.employee_id = auth.uid()))
        and (t.team_lead_id = target
             or exists (select 1 from public.team_members m2 where m2.team_id = t.id and m2.employee_id = target)))
    or exists (
      select 1 from public.projects p
      join public.project_team_assignments a on a.project_id = p.id
      join public.teams t on t.id = a.team_id
      where p.project_manager_id = auth.uid()
        and (t.team_lead_id = target
             or exists (select 1 from public.team_members m where m.team_id = t.id and m.employee_id = target)))
    or exists (
      select 1 from public.projects p
      join public.project_team_assignments a on a.project_id = p.id
      join public.teams t on t.id = a.team_id
      where p.project_manager_id = target
        and (t.team_lead_id = auth.uid()
             or exists (select 1 from public.team_members m where m.team_id = t.id and m.employee_id = auth.uid())))
  )
$$;

-- ============================================================
-- 2. TASKS (extends the existing table; creates it if missing)
-- ============================================================
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  created_at timestamptz not null default now()
);

alter table public.tasks add column if not exists project_id uuid references public.projects(id) on delete cascade;
alter table public.tasks add column if not exists team_id uuid references public.teams(id) on delete set null;
alter table public.tasks add column if not exists parent_task_id uuid references public.tasks(id) on delete cascade;
alter table public.tasks add column if not exists title text;
alter table public.tasks add column if not exists description text;
alter table public.tasks add column if not exists assigned_to uuid references public.profiles(id) on delete set null;
alter table public.tasks add column if not exists created_by uuid references public.profiles(id) on delete set null default auth.uid();
alter table public.tasks add column if not exists priority text not null default 'medium';
alter table public.tasks add column if not exists status text not null default 'pending';
alter table public.tasks add column if not exists progress integer not null default 0;
alter table public.tasks add column if not exists due_date date;
alter table public.tasks add column if not exists estimated_hours numeric(7,2);
alter table public.tasks add column if not exists actual_hours numeric(9,2) not null default 0;
alter table public.tasks add column if not exists created_at timestamptz not null default now();
alter table public.tasks add column if not exists updated_at timestamptz not null default now();

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'qc_tasks_status_chk') then
    alter table public.tasks add constraint qc_tasks_status_chk
      check (status in ('pending','in_progress','review','on_hold','completed')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'qc_tasks_priority_chk') then
    alter table public.tasks add constraint qc_tasks_priority_chk
      check (priority in ('low','medium','high','urgent')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'qc_tasks_progress_chk') then
    alter table public.tasks add constraint qc_tasks_progress_chk
      check (progress between 0 and 100) not valid;
  end if;
end $$;

create index if not exists qc_tasks_project_idx on public.tasks(project_id);
create index if not exists qc_tasks_team_idx on public.tasks(team_id);
create index if not exists qc_tasks_assignee_idx on public.tasks(assigned_to);
create index if not exists qc_tasks_parent_idx on public.tasks(parent_task_id);

-- Guard: keeps data consistent and limits what an assigned employee may change.
create or replace function public.qc_tasks_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  parent record;
begin
  new.updated_at := now();
  if new.status = 'completed' then new.progress := 100; end if;

  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, auth.uid());
    if new.parent_task_id is not null then            -- sub-task inherits project and team
      select project_id, team_id into parent from public.tasks where id = new.parent_task_id;
      new.project_id := parent.project_id;
      new.team_id := parent.team_id;
    end if;
    if new.assigned_to is not null and new.team_id is not null and not exists (
         select 1 from public.team_members where team_id = new.team_id and employee_id = new.assigned_to) then
      raise exception 'Tasks can only be assigned to employees of the team.';
    end if;
    return new;
  end if;

  -- UPDATE: SQL editor / service role, admins and the team lead may change anything
  if auth.uid() is null or public.qc_is_admin() or public.qc_leads_team(old.team_id) then
    if new.assigned_to is distinct from old.assigned_to and new.assigned_to is not null and new.team_id is not null and not exists (
         select 1 from public.team_members where team_id = new.team_id and employee_id = new.assigned_to) then
      raise exception 'Tasks can only be assigned to employees of the team.';
    end if;
    return new;
  end if;

  -- everyone else (the assigned employee) may only change status, progress and logged hours
  if new.project_id is distinct from old.project_id or new.team_id is distinct from old.team_id
     or new.parent_task_id is distinct from old.parent_task_id or new.title is distinct from old.title
     or new.description is distinct from old.description or new.assigned_to is distinct from old.assigned_to
     or new.priority is distinct from old.priority or new.due_date is distinct from old.due_date
     or new.estimated_hours is distinct from old.estimated_hours or new.created_by is distinct from old.created_by then
    raise exception 'You can only update status and progress on your own tasks.';
  end if;
  return new;
end $$;

drop trigger if exists qc_tasks_guard_trg on public.tasks;
create trigger qc_tasks_guard_trg before insert or update on public.tasks
  for each row execute function public.qc_tasks_guard();

-- Audit history (best effort: never blocks the task change)
create or replace function public.qc_tasks_audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    if tg_op = 'INSERT' then
      insert into public.activity_logs(action, description) values ('task_created', 'Task created: ' || new.title);
    elsif new.status is distinct from old.status then
      insert into public.activity_logs(action, description)
      values ('task_status_changed', 'Task "' || new.title || '" moved from ' || old.status || ' to ' || new.status);
    end if;
  exception when others then null;
  end;
  return null;
end $$;

drop trigger if exists qc_tasks_audit_trg on public.tasks;
create trigger qc_tasks_audit_trg after insert or update on public.tasks
  for each row execute function public.qc_tasks_audit();

alter table public.tasks enable row level security;

drop policy if exists qc_tasks_select on public.tasks;
create policy qc_tasks_select on public.tasks for select to authenticated using (
  public.qc_is_admin() or assigned_to = auth.uid() or created_by = auth.uid()
  or public.qc_leads_team(team_id) or public.qc_manages_project(project_id));

drop policy if exists qc_tasks_insert on public.tasks;
create policy qc_tasks_insert on public.tasks for insert to authenticated with check (
  public.qc_is_admin()
  or (public.qc_leads_team(team_id) and public.qc_team_on_project(team_id, project_id))
  or (parent_task_id is not null and assigned_to = auth.uid() and public.qc_owns_task(parent_task_id)));

drop policy if exists qc_tasks_update on public.tasks;
create policy qc_tasks_update on public.tasks for update to authenticated
  using (public.qc_is_admin() or public.qc_leads_team(team_id) or assigned_to = auth.uid())
  with check (public.qc_is_admin() or public.qc_leads_team(team_id) or assigned_to = auth.uid());

drop policy if exists qc_tasks_delete on public.tasks;
create policy qc_tasks_delete on public.tasks for delete to authenticated
  using (public.qc_is_admin() or public.qc_leads_team(team_id));

-- ============================================================
-- 3. COMMENTS and WORK LOGS
-- ============================================================
create table if not exists public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  body text not null check (length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists qc_comments_task_idx on public.task_comments(task_id);
alter table public.task_comments enable row level security;

drop policy if exists qc_comments_select on public.task_comments;
create policy qc_comments_select on public.task_comments for select to authenticated
  using (public.qc_can_view_task(task_id));
drop policy if exists qc_comments_insert on public.task_comments;
create policy qc_comments_insert on public.task_comments for insert to authenticated
  with check (author_id = auth.uid() and public.qc_can_view_task(task_id));
drop policy if exists qc_comments_delete on public.task_comments;
create policy qc_comments_delete on public.task_comments for delete to authenticated
  using (author_id = auth.uid() or public.qc_is_admin());

create table if not exists public.task_worklogs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  hours numeric(5,2) not null check (hours > 0 and hours <= 24),
  note text,
  log_date date not null default current_date,
  created_at timestamptz not null default now()
);
create index if not exists qc_worklogs_task_idx on public.task_worklogs(task_id);
alter table public.task_worklogs enable row level security;

drop policy if exists qc_worklogs_select on public.task_worklogs;
create policy qc_worklogs_select on public.task_worklogs for select to authenticated
  using (public.qc_can_view_task(task_id));
drop policy if exists qc_worklogs_insert on public.task_worklogs;
create policy qc_worklogs_insert on public.task_worklogs for insert to authenticated
  with check (user_id = auth.uid() and public.qc_can_work_task(task_id));
drop policy if exists qc_worklogs_delete on public.task_worklogs;
create policy qc_worklogs_delete on public.task_worklogs for delete to authenticated
  using (user_id = auth.uid() or public.qc_is_admin());

-- Keep tasks.actual_hours equal to the sum of its work logs
create or replace function public.qc_worklog_sync() returns trigger
language plpgsql security definer set search_path = public as $$
declare t uuid := coalesce(new.task_id, old.task_id);
begin
  update public.tasks set actual_hours = (select coalesce(sum(hours), 0) from public.task_worklogs where task_id = t)
  where id = t;
  return null;
end $$;

drop trigger if exists qc_worklog_sync_trg on public.task_worklogs;
create trigger qc_worklog_sync_trg after insert or delete on public.task_worklogs
  for each row execute function public.qc_worklog_sync();

-- ============================================================
-- 4. ATTENDANCE
-- ============================================================
create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);
alter table public.attendance add column if not exists employee_id uuid references public.profiles(id) on delete cascade;
alter table public.attendance add column if not exists attendance_date date not null default current_date;
alter table public.attendance add column if not exists check_in timestamptz;
alter table public.attendance add column if not exists check_out timestamptz;
alter table public.attendance add column if not exists status text not null default 'present';
alter table public.attendance add column if not exists work_hours numeric(5,2);
alter table public.attendance add column if not exists notes text;

create unique index if not exists qc_attendance_one_per_day on public.attendance(employee_id, attendance_date);

-- Staff may check in once and check out once; they cannot rewrite history.
create or replace function public.qc_attendance_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.qc_is_hr_or_admin() then return new; end if;
  if new.employee_id is distinct from old.employee_id or new.attendance_date is distinct from old.attendance_date
     or new.check_in is distinct from old.check_in or new.status is distinct from old.status then
    raise exception 'Attendance history cannot be edited.';
  end if;
  if old.check_out is not null and new.check_out is distinct from old.check_out then
    raise exception 'You have already checked out for this day.';
  end if;
  return new;
end $$;

drop trigger if exists qc_attendance_guard_trg on public.attendance;
create trigger qc_attendance_guard_trg before update on public.attendance
  for each row execute function public.qc_attendance_guard();

alter table public.attendance enable row level security;

drop policy if exists qc_attendance_select on public.attendance;
create policy qc_attendance_select on public.attendance for select to authenticated using (
  employee_id = auth.uid() or public.qc_is_hr_or_admin() or public.qc_leads_employee(employee_id));
drop policy if exists qc_attendance_insert on public.attendance;
create policy qc_attendance_insert on public.attendance for insert to authenticated with check (
  public.qc_is_hr_or_admin()
  or (employee_id = auth.uid() and public.qc_role() is not null and abs(attendance_date - current_date) <= 1));
drop policy if exists qc_attendance_update on public.attendance;
create policy qc_attendance_update on public.attendance for update to authenticated
  using (employee_id = auth.uid() or public.qc_is_hr_or_admin())
  with check (employee_id = auth.uid() or public.qc_is_hr_or_admin());

-- ============================================================
-- 5. PROFILE VISIBILITY (so names show on boards) - additive, never replaces existing policies
-- ============================================================
drop policy if exists qc_profiles_related_select on public.profiles;
create policy qc_profiles_related_select on public.profiles for select to authenticated
  using (public.qc_can_see_profile(id));
