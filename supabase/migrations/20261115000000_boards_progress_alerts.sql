-- QUADE Connect: project boards, personal boards, timers, attachments, deadline alerts, admin roll-up.
-- Run AFTER 20261114000000_work_management.sql (and the reporting hierarchy one). Safe to run more than once.

-- ============================================================
-- 1. BOARDS AND GROUPS
-- ============================================================
create table if not exists public.task_boards (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  description text,
  board_type text not null check (board_type in ('project','personal')),
  owner_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  project_id uuid references public.projects(id) on delete cascade,
  team_id uuid references public.teams(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((board_type = 'project' and project_id is not null and team_id is not null)
      or (board_type = 'personal' and project_id is null and team_id is null))
);
create index if not exists qc_boards_owner_idx on public.task_boards(owner_id);
create index if not exists qc_boards_project_idx on public.task_boards(project_id, team_id);

create table if not exists public.task_groups (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.task_boards(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists qc_groups_board_idx on public.task_groups(board_id, position);

alter table public.tasks add column if not exists board_id uuid references public.task_boards(id) on delete cascade;
alter table public.tasks add column if not exists group_id uuid references public.task_groups(id) on delete set null;
alter table public.tasks add column if not exists start_date date;
create index if not exists qc_tasks_board_idx on public.tasks(board_id);

alter table public.task_worklogs add column if not exists started_at timestamptz;
alter table public.task_worklogs add column if not exists ended_at timestamptz;

-- ============================================================
-- 2. HELPERS
-- A "personal" task has no project (project_id is null) and lives on a personal board.
-- Only its owner (created_by) may change it. Team Lead / Project Manager get read-only access.
-- Admin gets no access to personal boards at all.
-- ============================================================
create or replace function public.qc_pm_sees_employee(e uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select e is not null and exists (
    select 1 from public.team_members m
    join public.project_team_assignments a on a.team_id = m.team_id
    join public.projects p on p.id = a.project_id
    where m.employee_id = e and p.project_manager_id = auth.uid())
$$;

create or replace function public.qc_can_view_board(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.task_boards x where x.id = b and (
    (x.board_type = 'project' and (
        public.qc_is_admin() or public.qc_leads_team(x.team_id) or public.qc_manages_project(x.project_id)
        or exists (select 1 from public.team_members m where m.team_id = x.team_id and m.employee_id = auth.uid())))
    or (x.board_type = 'personal' and (
        x.owner_id = auth.uid() or public.qc_leads_employee(x.owner_id) or public.qc_pm_sees_employee(x.owner_id)))))
$$;

create or replace function public.qc_can_manage_board(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.task_boards x where x.id = b and (
    (x.board_type = 'project' and (public.qc_is_admin() or public.qc_leads_team(x.team_id)))
    or (x.board_type = 'personal' and x.owner_id = auth.uid())))
$$;

create or replace function public.qc_is_personal_task(task uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tasks where id = task and project_id is null)
$$;

create or replace function public.qc_can_view_task(task uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.qc_role() is not null and exists (
    select 1 from public.tasks t where t.id = task and (
      (t.project_id is not null and (
          public.qc_is_admin() or t.assigned_to = auth.uid() or t.created_by = auth.uid()
          or public.qc_leads_team(t.team_id) or public.qc_manages_project(t.project_id)))
      or (t.project_id is null and (
          t.created_by = auth.uid() or public.qc_leads_employee(t.created_by) or public.qc_pm_sees_employee(t.created_by)))))
$$;

create or replace function public.qc_can_work_task(task uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.qc_role() is not null and exists (
    select 1 from public.tasks t where t.id = task and (
      (t.project_id is not null and (public.qc_is_admin() or t.assigned_to = auth.uid() or public.qc_leads_team(t.team_id)))
      or (t.project_id is null and t.created_by = auth.uid())))
$$;

-- ============================================================
-- 3. TASK GUARD (status/progress rules, personal tasks, boards)
-- ============================================================
create or replace function public.qc_tasks_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  parent record;
  b record;
begin
  new.updated_at := now();
  if new.status = 'completed' then new.progress := 100;
  elsif new.status = 'pending' and not (tg_op = 'UPDATE' and exists (select 1 from public.tasks where parent_task_id = new.id)) then
    new.progress := 0;
  end if;

  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, auth.uid());
    if new.parent_task_id is not null then            -- sub-task inherits project, team and board
      select project_id, team_id, board_id, group_id into parent from public.tasks where id = new.parent_task_id;
      new.project_id := parent.project_id;
      new.team_id := parent.team_id;
      new.board_id := parent.board_id;
      new.group_id := parent.group_id;
    end if;
    if new.project_id is null then                    -- personal task: owner only
      new.team_id := null;
      if auth.uid() is not null then
        new.created_by := auth.uid();
        new.assigned_to := auth.uid();
      end if;
    elsif new.assigned_to is not null and new.team_id is not null and not exists (
         select 1 from public.team_members where team_id = new.team_id and employee_id = new.assigned_to) then
      raise exception 'Tasks can only be assigned to employees of the team.';
    end if;
    if new.board_id is not null then
      select * into b from public.task_boards where id = new.board_id;
      if b.id is null then raise exception 'Board not found.'; end if;
      if b.board_type = 'personal' and (new.project_id is not null or b.owner_id is distinct from new.created_by) then
        raise exception 'Personal board tasks belong to the board owner.';
      end if;
      if b.board_type = 'project' and (b.project_id is distinct from new.project_id or b.team_id is distinct from new.team_id) then
        raise exception 'This board belongs to a different project or team.';
      end if;
    end if;
    return new;
  end if;

  -- UPDATE
  if old.project_id is null then                      -- personal task: owner may edit, identity is fixed
    new.project_id := null; new.team_id := null; new.created_by := old.created_by; new.assigned_to := old.created_by;
    return new;
  end if;
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
     or new.start_date is distinct from old.start_date or new.board_id is distinct from old.board_id
     or new.group_id is distinct from old.group_id
     or new.estimated_hours is distinct from old.estimated_hours or new.created_by is distinct from old.created_by then
    raise exception 'You can only update status and progress on your own tasks.';
  end if;
  return new;
end $$;

-- Audit trail never records personal tasks (Admin must not see them)
create or replace function public.qc_tasks_audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.project_id is null then return null; end if;
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

-- Parent progress follows its sub-tasks (average), so a parent and its sub-tasks are never double counted:
-- reports only count top-level tasks.
create or replace function public.qc_parent_progress() returns trigger
language plpgsql security definer set search_path = public as $$
declare pid uuid := coalesce(new.parent_task_id, old.parent_task_id);
begin
  if pid is not null then
    update public.tasks p set
      progress = (select round(avg(progress))::int from public.tasks where parent_task_id = pid),
      status = case
        when not exists (select 1 from public.tasks where parent_task_id = pid and status <> 'completed') then 'completed'
        when p.status in ('pending','completed') and exists (select 1 from public.tasks where parent_task_id = pid and (progress > 0 or status <> 'pending')) then 'in_progress'
        else p.status end
    where p.id = pid and exists (select 1 from public.tasks where parent_task_id = pid);
  end if;
  return null;
end $$;
drop trigger if exists qc_parent_progress_trg on public.tasks;
create trigger qc_parent_progress_trg after insert or update of progress, status or delete on public.tasks
  for each row execute function public.qc_parent_progress();

-- ============================================================
-- 4. ROW LEVEL SECURITY: boards, groups, tasks
-- ============================================================
alter table public.task_boards enable row level security;
alter table public.task_groups enable row level security;

drop policy if exists qc_boards_select on public.task_boards;
create policy qc_boards_select on public.task_boards for select to authenticated
  using (owner_id = auth.uid() or public.qc_can_view_board(id));
drop policy if exists qc_boards_insert on public.task_boards;
create policy qc_boards_insert on public.task_boards for insert to authenticated with check (
  owner_id = auth.uid() and (
    (board_type = 'project' and (public.qc_is_admin() or (public.qc_leads_team(team_id) and public.qc_team_on_project(team_id, project_id))))
    or (board_type = 'personal' and public.qc_role() in ('employee','team_lead'))));
drop policy if exists qc_boards_update on public.task_boards;
create policy qc_boards_update on public.task_boards for update to authenticated
  using (public.qc_can_manage_board(id)) with check (public.qc_can_manage_board(id));
drop policy if exists qc_boards_delete on public.task_boards;
create policy qc_boards_delete on public.task_boards for delete to authenticated using (public.qc_can_manage_board(id));

drop policy if exists qc_groups_select on public.task_groups;
create policy qc_groups_select on public.task_groups for select to authenticated using (public.qc_can_view_board(board_id));
drop policy if exists qc_groups_insert on public.task_groups;
create policy qc_groups_insert on public.task_groups for insert to authenticated with check (public.qc_can_manage_board(board_id));
drop policy if exists qc_groups_update on public.task_groups;
create policy qc_groups_update on public.task_groups for update to authenticated
  using (public.qc_can_manage_board(board_id)) with check (public.qc_can_manage_board(board_id));
drop policy if exists qc_groups_delete on public.task_groups;
create policy qc_groups_delete on public.task_groups for delete to authenticated using (public.qc_can_manage_board(board_id));

create or replace function public.qc_touch_board() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
drop trigger if exists qc_touch_board_trg on public.task_boards;
create trigger qc_touch_board_trg before update on public.task_boards for each row execute function public.qc_touch_board();

-- tasks
drop policy if exists qc_tasks_select on public.tasks;
create policy qc_tasks_select on public.tasks for select to authenticated using (
  (project_id is not null and (
      public.qc_is_admin() or assigned_to = auth.uid() or created_by = auth.uid()
      or public.qc_leads_team(team_id) or public.qc_manages_project(project_id)))
  or (project_id is null and (
      created_by = auth.uid() or public.qc_leads_employee(created_by) or public.qc_pm_sees_employee(created_by))));

drop policy if exists qc_tasks_insert on public.tasks;
create policy qc_tasks_insert on public.tasks for insert to authenticated with check (
  (project_id is not null and (
      public.qc_is_admin()
      or (public.qc_leads_team(team_id) and public.qc_team_on_project(team_id, project_id))
      or (parent_task_id is not null and assigned_to = auth.uid() and public.qc_owns_task(parent_task_id))))
  or (project_id is null and public.qc_role() in ('employee','team_lead') and (
      (parent_task_id is null and board_id is not null and public.qc_can_manage_board(board_id))
      or (parent_task_id is not null and public.qc_can_work_task(parent_task_id)))));

drop policy if exists qc_tasks_update on public.tasks;
create policy qc_tasks_update on public.tasks for update to authenticated
  using ((project_id is not null and (public.qc_is_admin() or public.qc_leads_team(team_id) or assigned_to = auth.uid()))
         or (project_id is null and created_by = auth.uid()))
  with check ((project_id is not null and (public.qc_is_admin() or public.qc_leads_team(team_id) or assigned_to = auth.uid()))
         or (project_id is null and created_by = auth.uid()));

drop policy if exists qc_tasks_delete on public.tasks;
create policy qc_tasks_delete on public.tasks for delete to authenticated
  using ((project_id is not null and (public.qc_is_admin() or public.qc_leads_team(team_id)))
         or (project_id is null and created_by = auth.uid()));

-- comments: project tasks keep the old rule; personal tasks only for the owner (Team Lead / PM are read-only)
drop policy if exists qc_comments_insert on public.task_comments;
create policy qc_comments_insert on public.task_comments for insert to authenticated with check (
  author_id = auth.uid() and (public.qc_can_work_task(task_id)
    or (not public.qc_is_personal_task(task_id) and public.qc_can_view_task(task_id))));
drop policy if exists qc_comments_delete on public.task_comments;
create policy qc_comments_delete on public.task_comments for delete to authenticated
  using (author_id = auth.uid());

-- ============================================================
-- 5. ATTACHMENTS (private bucket 'task-files')
-- ============================================================
create table if not exists public.task_attachments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  uploader_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  file_path text not null,
  file_name text not null,
  file_size integer,
  created_at timestamptz not null default now()
);
create index if not exists qc_attach_task_idx on public.task_attachments(task_id);
alter table public.task_attachments enable row level security;

drop policy if exists qc_attach_select on public.task_attachments;
create policy qc_attach_select on public.task_attachments for select to authenticated using (public.qc_can_view_task(task_id));
drop policy if exists qc_attach_insert on public.task_attachments;
create policy qc_attach_insert on public.task_attachments for insert to authenticated
  with check (uploader_id = auth.uid() and public.qc_can_work_task(task_id));
drop policy if exists qc_attach_delete on public.task_attachments;
create policy qc_attach_delete on public.task_attachments for delete to authenticated
  using (uploader_id = auth.uid() or public.qc_can_work_task(task_id));

insert into storage.buckets (id, name, public, file_size_limit)
values ('task-files', 'task-files', false, 10485760)
on conflict (id) do update set public = false, file_size_limit = 10485760;

create or replace function public.qc_storage_task(name text) returns uuid
language sql immutable as $$
  select case when (string_to_array(name, '/'))[1] ~ '^[0-9a-fA-F-]{36}$' then ((string_to_array(name, '/'))[1])::uuid end $$;

drop policy if exists qc_taskfiles_select on storage.objects;
create policy qc_taskfiles_select on storage.objects for select to authenticated
  using (bucket_id = 'task-files' and public.qc_storage_task(name) is not null and public.qc_can_view_task(public.qc_storage_task(name)));
drop policy if exists qc_taskfiles_insert on storage.objects;
create policy qc_taskfiles_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'task-files' and public.qc_storage_task(name) is not null and public.qc_can_work_task(public.qc_storage_task(name)));
drop policy if exists qc_taskfiles_delete on storage.objects;
create policy qc_taskfiles_delete on storage.objects for delete to authenticated
  using (bucket_id = 'task-files' and public.qc_storage_task(name) is not null and public.qc_can_work_task(public.qc_storage_task(name)));

-- ============================================================
-- 6. TIMER (one active timer per person)
-- ============================================================
create or replace function public.qc_org_tz() returns text
language sql immutable as $$ select 'Asia/Kolkata'::text $$;   -- change here if the organisation timezone changes

create table if not exists public.task_timers (
  user_id uuid primary key references public.profiles(id) on delete cascade default auth.uid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  started_at timestamptz not null default now(),
  accumulated_seconds integer not null default 0,
  paused_at timestamptz,
  first_started_at timestamptz not null default now()
);
alter table public.task_timers enable row level security;
drop policy if exists qc_timers_select on public.task_timers;
create policy qc_timers_select on public.task_timers for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.task_timers from authenticated;   -- changes only through the functions below

create or replace function public.timer_start(p_task uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t record;
begin
  select * into t from public.tasks where id = p_task;
  if t.id is null or t.assigned_to is distinct from auth.uid() or not public.qc_can_work_task(p_task) then
    raise exception 'You can only time tasks assigned to you.';
  end if;
  if t.status = 'completed' then raise exception 'This task is already completed.'; end if;
  if exists (select 1 from public.task_timers where user_id = auth.uid()) then
    raise exception 'You already have a running timer. Stop it first.';
  end if;
  insert into public.task_timers(user_id, task_id) values (auth.uid(), p_task);
  if t.status = 'pending' then update public.tasks set status = 'in_progress' where id = p_task; end if;
end $$;

create or replace function public.timer_pause() returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.task_timers
     set accumulated_seconds = accumulated_seconds + greatest(extract(epoch from (now() - started_at))::int, 0), paused_at = now()
   where user_id = auth.uid() and paused_at is null;
end $$;

create or replace function public.timer_resume() returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.task_timers set started_at = now(), paused_at = null where user_id = auth.uid() and paused_at is not null;
end $$;

create or replace function public.timer_stop(p_note text default null) returns numeric
language plpgsql security definer set search_path = public as $$
declare tm record; secs integer; hrs numeric;
begin
  select * into tm from public.task_timers where user_id = auth.uid();
  if tm.user_id is null then raise exception 'No running timer.'; end if;
  secs := tm.accumulated_seconds + case when tm.paused_at is null then greatest(extract(epoch from (now() - tm.started_at))::int, 0) else 0 end;
  hrs := least(greatest(round(secs / 3600.0, 2), 0.01), 24);
  insert into public.task_worklogs(task_id, user_id, hours, note, log_date, started_at, ended_at)
  values (tm.task_id, auth.uid(), hrs, nullif(trim(p_note), ''), (now() at time zone public.qc_org_tz())::date, tm.first_started_at, now());
  delete from public.task_timers where user_id = auth.uid();
  return hrs;
end $$;

grant execute on function public.timer_start(uuid), public.timer_pause(), public.timer_resume(), public.timer_stop(text) to authenticated;

-- ============================================================
-- 7. NOTIFICATIONS AND DEADLINE ALERTS
-- ============================================================
create table if not exists public.work_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  message text not null,
  project_id uuid references public.projects(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  due_date date,
  is_urgent boolean not null default true,
  is_read boolean not null default false,
  dedupe_key text not null unique,
  created_at timestamptz not null default now()
);
create index if not exists qc_worknotif_idx on public.work_notifications(recipient_id, is_read, created_at desc);
alter table public.work_notifications enable row level security;
drop policy if exists qc_worknotif_select on public.work_notifications;
create policy qc_worknotif_select on public.work_notifications for select to authenticated using (recipient_id = auth.uid());
drop policy if exists qc_worknotif_update on public.work_notifications;
create policy qc_worknotif_update on public.work_notifications for update to authenticated
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());
revoke insert, update, delete on public.work_notifications from authenticated;
grant update (is_read) on public.work_notifications to authenticated;

-- Creates every "due tomorrow" and "overdue" alert that does not exist yet. Re-running never duplicates.
create or replace function public.qc_generate_deadline_alerts() returns integer
language plpgsql security definer set search_path = public as $$
declare
  today date := (now() at time zone public.qc_org_tz())::date;
  tomorrow date := (now() at time zone public.qc_org_tz())::date + 1;
  n integer := 0; c integer;
begin
  -- Project due tomorrow -> project manager + team leads of the assigned teams
  insert into public.work_notifications(recipient_id, type, title, message, project_id, due_date, dedupe_key)
  select r.rid, 'project_due', 'Project due tomorrow',
         p.name || ' is due tomorrow. Please check the overall project progress.', p.id, p.due_date,
         'proj-due:' || p.id || ':' || r.rid || ':' || p.due_date
  from public.projects p
  cross join lateral (
    select p.project_manager_id as rid
    union
    select t.team_lead_id from public.project_team_assignments a join public.teams t on t.id = a.team_id where a.project_id = p.id
  ) r
  where p.due_date = tomorrow and coalesce(p.status, '') not in ('completed','cancelled') and r.rid is not null
  on conflict (dedupe_key) do nothing;
  get diagnostics c = row_count; n := n + c;

  -- Task due tomorrow -> the employee
  insert into public.work_notifications(recipient_id, type, title, message, project_id, task_id, due_date, dedupe_key)
  select t.assigned_to, 'task_due', 'Task due tomorrow',
         'Your task ' || t.title || ' is due tomorrow. Please update its status.', t.project_id, t.id, t.due_date,
         'task-due:' || t.id || ':' || t.assigned_to || ':' || t.due_date
  from public.tasks t
  where t.due_date = tomorrow and t.status <> 'completed' and t.assigned_to is not null
  on conflict (dedupe_key) do nothing;
  get diagnostics c = row_count; n := n + c;

  -- ... their team lead (project tasks only; personal tasks stay private)
  insert into public.work_notifications(recipient_id, type, title, message, project_id, task_id, due_date, dedupe_key)
  select tm.team_lead_id, 'task_due_team', 'Team task due tomorrow',
         coalesce(e.full_name, 'An employee') || ' has a task due tomorrow in ' || pr.name || '.', t.project_id, t.id, t.due_date,
         'task-due-tl:' || t.id || ':' || tm.team_lead_id || ':' || t.due_date
  from public.tasks t
  join public.teams tm on tm.id = t.team_id
  join public.projects pr on pr.id = t.project_id
  left join public.profiles e on e.id = t.assigned_to
  where t.project_id is not null and t.due_date = tomorrow and t.status <> 'completed'
    and t.assigned_to is not null and tm.team_lead_id is not null and tm.team_lead_id <> t.assigned_to
  on conflict (dedupe_key) do nothing;
  get diagnostics c = row_count; n := n + c;

  -- ... and the project manager (one summary per project)
  insert into public.work_notifications(recipient_id, type, title, message, project_id, due_date, dedupe_key)
  select pr.project_manager_id, 'project_tasks_due', 'Tasks due tomorrow',
         pr.name || ' has ' || count(*) || ' task(s) due tomorrow.', pr.id, tomorrow,
         'pm-due:' || pr.id || ':' || pr.project_manager_id || ':' || tomorrow
  from public.tasks t join public.projects pr on pr.id = t.project_id
  where t.due_date = tomorrow and t.status <> 'completed' and t.parent_task_id is null and pr.project_manager_id is not null
  group by pr.id, pr.name, pr.project_manager_id
  on conflict (dedupe_key) do nothing;
  get diagnostics c = row_count; n := n + c;

  -- Overdue tasks -> the employee (once per task)
  insert into public.work_notifications(recipient_id, type, title, message, project_id, task_id, due_date, dedupe_key)
  select t.assigned_to, 'task_overdue', 'Task overdue',
         'Your task ' || t.title || ' is overdue (was due ' || to_char(t.due_date, 'DD Mon YYYY') || ').', t.project_id, t.id, t.due_date,
         'task-over:' || t.id || ':' || t.assigned_to || ':' || t.due_date
  from public.tasks t
  where t.due_date < today and t.status <> 'completed' and t.assigned_to is not null
  on conflict (dedupe_key) do nothing;
  get diagnostics c = row_count; n := n + c;

  -- ... team lead (once per task)
  insert into public.work_notifications(recipient_id, type, title, message, project_id, task_id, due_date, dedupe_key)
  select tm.team_lead_id, 'task_overdue_team', 'Team task overdue',
         coalesce(e.full_name, 'An employee') || '''s task ' || t.title || ' is overdue in ' || pr.name || '.', t.project_id, t.id, t.due_date,
         'task-over-tl:' || t.id || ':' || tm.team_lead_id || ':' || t.due_date
  from public.tasks t
  join public.teams tm on tm.id = t.team_id
  join public.projects pr on pr.id = t.project_id
  left join public.profiles e on e.id = t.assigned_to
  where t.project_id is not null and t.due_date < today and t.status <> 'completed'
    and tm.team_lead_id is not null and tm.team_lead_id is distinct from t.assigned_to
  on conflict (dedupe_key) do nothing;
  get diagnostics c = row_count; n := n + c;

  -- ... project manager (one summary per project per day)
  insert into public.work_notifications(recipient_id, type, title, message, project_id, due_date, dedupe_key)
  select pr.project_manager_id, 'project_tasks_overdue', 'Overdue tasks',
         pr.name || ' has ' || count(*) || ' overdue task(s).', pr.id, today,
         'pm-over:' || pr.id || ':' || pr.project_manager_id || ':' || today
  from public.tasks t join public.projects pr on pr.id = t.project_id
  where t.due_date < today and t.status <> 'completed' and t.parent_task_id is null and pr.project_manager_id is not null
  group by pr.id, pr.name, pr.project_manager_id
  on conflict (dedupe_key) do nothing;
  get diagnostics c = row_count; n := n + c;

  return n;
end $$;
revoke all on function public.qc_generate_deadline_alerts() from public, anon, authenticated;

-- Admin can run it by hand (Admin > SQL: select qc_run_deadline_alerts();)
create or replace function public.qc_run_deadline_alerts() returns integer
language plpgsql security definer set search_path = public as $$
begin
  if not public.qc_is_admin() then raise exception 'Admin only.'; end if;
  return public.qc_generate_deadline_alerts();
end $$;
grant execute on function public.qc_run_deadline_alerts() to authenticated;

-- Server-side schedule (Supabase pg_cron): every hour, duplicates are impossible. Skipped quietly if pg_cron is unavailable.
do $$ begin
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname = 'qc_deadline_alerts';
  perform cron.schedule('qc_deadline_alerts', '5 * * * *', 'select public.qc_generate_deadline_alerts()');
exception when others then
  raise notice 'pg_cron not enabled: enable it in Database > Extensions, then re-run this file to schedule the alerts. (%)', sqlerrm;
end $$;

-- ============================================================
-- 8. ADMIN ROLL-UP (organisation-level numbers only, no personal boards, no individual employees)
-- ============================================================
create or replace function public.qc_admin_progress() returns json
language plpgsql stable security definer set search_path = public as $$
declare today date := (now() at time zone public.qc_org_tz())::date; r json;
begin
  if not public.qc_is_admin() then raise exception 'Admin only.'; end if;
  with top as (select * from public.tasks where project_id is not null and parent_task_id is null),
  proj as (
    select p.*, (select count(*) from top t where t.project_id = p.id) as tasks,
           (select count(*) from top t where t.project_id = p.id and t.status = 'completed') as done,
           (select coalesce(round(avg(t.progress)), 0) from top t where t.project_id = p.id) as pct
    from public.projects p)
  select json_build_object(
    'projects', json_build_object(
      'total', (select count(*) from proj),
      'active', (select count(*) from proj where status not in ('completed','cancelled')),
      'completed', (select count(*) from proj where status = 'completed'),
      'in_progress', (select count(*) from proj where status = 'in_progress'),
      'delayed', (select count(*) from proj where due_date < today and status not in ('completed','cancelled')),
      'avg_progress', (select coalesce(round(avg(pct)), 0) from proj)),
    'tasks', json_build_object(
      'total', (select count(*) from top),
      'completed', (select count(*) from top where status = 'completed'),
      'overdue', (select count(*) from top where due_date < today and status <> 'completed'),
      'avg_progress', (select coalesce(round(avg(progress)), 0) from top),
      'estimated_hours', (select coalesce(sum(estimated_hours), 0) from top),
      'actual_hours', (select coalesce(sum(actual_hours), 0) from public.tasks where project_id is not null)),
    'by_manager', (select coalesce(json_agg(x order by x.name), '[]'::json) from (
        select pr.project_manager_id as id, m.full_name as name, count(*) as projects,
               sum(pr.tasks) as tasks, sum(pr.done) as completed,
               coalesce(round(avg(pr.pct)), 0) as progress
        from proj pr left join public.profiles m on m.id = pr.project_manager_id
        group by pr.project_manager_id, m.full_name) x)
  ) into r;
  return r;
end $$;
grant execute on function public.qc_admin_progress() to authenticated;
