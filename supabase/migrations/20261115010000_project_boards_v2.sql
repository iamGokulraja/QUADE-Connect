-- QUADE Connect: every board belongs to a project, and every task on it counts toward that project's progress.
-- Team Leads create team boards; employees create their own boards inside a project their team works on.
-- Run AFTER 20261115000000_boards_progress_alerts.sql. Safe to run more than once.

-- ============================================================
-- 1. HELPERS
-- "Member-owned" board = a board created by a team member (not the Team Lead) inside a project.
-- Only that employee edits it. Team Lead and Project Manager can view it and comment; Admin sees totals.
-- ============================================================
create or replace function public.qc_board_member_owned(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select b is not null and exists (
    select 1 from public.task_boards x
    join public.teams t on t.id = x.team_id
    where x.id = b and x.board_type = 'project'
      and x.owner_id is distinct from t.team_lead_id
      and exists (select 1 from public.team_members m where m.team_id = x.team_id and m.employee_id = x.owner_id))
$$;

create or replace function public.qc_can_view_board(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.task_boards x where x.id = b and (
    x.owner_id = auth.uid()
    or (x.board_type = 'project' and (
        public.qc_is_admin() or public.qc_leads_team(x.team_id) or public.qc_manages_project(x.project_id)
        or (not public.qc_board_member_owned(x.id)
            and exists (select 1 from public.team_members m where m.team_id = x.team_id and m.employee_id = auth.uid()))))
    or (x.board_type = 'personal' and (public.qc_leads_employee(x.owner_id) or public.qc_pm_sees_employee(x.owner_id)))))
$$;

create or replace function public.qc_can_manage_board(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.task_boards x where x.id = b and (
    x.owner_id = auth.uid()
    or (x.board_type = 'project' and not public.qc_board_member_owned(x.id)
        and (public.qc_is_admin() or public.qc_leads_team(x.team_id)))))
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
      (t.project_id is not null and (
          t.assigned_to = auth.uid()
          or ((public.qc_is_admin() or public.qc_leads_team(t.team_id)) and not public.qc_board_member_owned(t.board_id))))
      or (t.project_id is null and t.created_by = auth.uid())))
$$;

-- ============================================================
-- 2. TASK GUARD
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
    if new.parent_task_id is not null then            -- sub-task inherits project, team, board and group
      select project_id, team_id, board_id, group_id into parent from public.tasks where id = new.parent_task_id;
      new.project_id := parent.project_id;
      new.team_id := parent.team_id;
      new.board_id := parent.board_id;
      new.group_id := parent.group_id;
    end if;
    if new.project_id is null then                    -- legacy personal task
      new.team_id := null;
      if auth.uid() is not null then new.created_by := auth.uid(); new.assigned_to := auth.uid(); end if;
    end if;
    if new.board_id is not null then
      select * into b from public.task_boards where id = new.board_id;
      if b.id is null then raise exception 'Board not found.'; end if;
      if b.board_type = 'project' and (b.project_id is distinct from new.project_id or b.team_id is distinct from new.team_id) then
        raise exception 'This board belongs to a different project or team.';
      end if;
      if b.board_type = 'personal' and (new.project_id is not null or b.owner_id is distinct from new.created_by) then
        raise exception 'Personal board tasks belong to the board owner.';
      end if;
      -- tasks on an employee's own board are always that employee's
      if b.board_type = 'project' and public.qc_board_member_owned(b.id) and auth.uid() is not null then
        new.created_by := auth.uid();
        new.assigned_to := auth.uid();
      end if;
    end if;
    if new.project_id is not null and new.assigned_to is not null and new.team_id is not null and not exists (
         select 1 from public.team_members where team_id = new.team_id and employee_id = new.assigned_to)
       and not exists (select 1 from public.teams where id = new.team_id and team_lead_id = new.assigned_to) then
      raise exception 'Tasks can only be assigned to employees of the team.';
    end if;
    return new;
  end if;

  -- UPDATE
  if old.project_id is null then                      -- legacy personal task
    new.project_id := null; new.team_id := null; new.created_by := old.created_by; new.assigned_to := old.created_by;
    return new;
  end if;
  -- the employee who owns the board may edit everything on their own tasks, but not move them
  if auth.uid() is not null and old.board_id is not null and old.created_by = auth.uid()
     and public.qc_board_member_owned(old.board_id) then
    new.project_id := old.project_id; new.team_id := old.team_id; new.board_id := old.board_id;
    new.created_by := old.created_by; new.assigned_to := old.created_by;
    return new;
  end if;
  if auth.uid() is null or public.qc_is_admin() or public.qc_leads_team(old.team_id) then
    if new.assigned_to is distinct from old.assigned_to and new.assigned_to is not null and new.team_id is not null and not exists (
         select 1 from public.team_members where team_id = new.team_id and employee_id = new.assigned_to) then
      raise exception 'Tasks can only be assigned to employees of the team.';
    end if;
    return new;
  end if;

  -- everyone else (an employee on a task given by the Team Lead) may only change status, progress and logged hours
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

-- ============================================================
-- 3. ROW LEVEL SECURITY
-- ============================================================
drop policy if exists qc_boards_select on public.task_boards;
create policy qc_boards_select on public.task_boards for select to authenticated
  using (owner_id = auth.uid() or public.qc_can_view_board(id));

drop policy if exists qc_boards_insert on public.task_boards;
create policy qc_boards_insert on public.task_boards for insert to authenticated with check (
  owner_id = auth.uid() and board_type = 'project' and public.qc_team_on_project(team_id, project_id) and (
    public.qc_is_admin()
    or public.qc_leads_team(team_id)
    or exists (select 1 from public.team_members m where m.team_id = task_boards.team_id and m.employee_id = auth.uid())));

drop policy if exists qc_tasks_insert on public.tasks;
create policy qc_tasks_insert on public.tasks for insert to authenticated with check (
  (project_id is not null and (
      ((public.qc_is_admin() or (public.qc_leads_team(team_id) and public.qc_team_on_project(team_id, project_id)))
         and not public.qc_board_member_owned(board_id))
      or (parent_task_id is not null and assigned_to = auth.uid() and public.qc_owns_task(parent_task_id))
      or (board_id is not null and created_by = auth.uid() and assigned_to = auth.uid()
          and public.qc_board_member_owned(board_id) and public.qc_can_manage_board(board_id))))
  or (project_id is null and public.qc_role() in ('employee','team_lead') and (
      (parent_task_id is null and board_id is not null and public.qc_can_manage_board(board_id))
      or (parent_task_id is not null and public.qc_can_work_task(parent_task_id)))));

drop policy if exists qc_tasks_update on public.tasks;
create policy qc_tasks_update on public.tasks for update to authenticated
  using ((project_id is not null and (
            assigned_to = auth.uid()
            or ((public.qc_is_admin() or public.qc_leads_team(team_id)) and not public.qc_board_member_owned(board_id))))
         or (project_id is null and created_by = auth.uid()))
  with check ((project_id is not null and (
            assigned_to = auth.uid()
            or ((public.qc_is_admin() or public.qc_leads_team(team_id)) and not public.qc_board_member_owned(board_id))))
         or (project_id is null and created_by = auth.uid()));

drop policy if exists qc_tasks_delete on public.tasks;
create policy qc_tasks_delete on public.tasks for delete to authenticated
  using ((project_id is not null and (
            (created_by = auth.uid() and public.qc_board_member_owned(board_id))
            or ((public.qc_is_admin() or public.qc_leads_team(team_id)) and not public.qc_board_member_owned(board_id))))
         or (project_id is null and created_by = auth.uid()));

-- ============================================================
-- 4. MOVE EXISTING PERSONAL BOARDS INTO THEIR PROJECT (only when it is unambiguous:
--    the employee is on exactly one team that works on exactly one project)
-- ============================================================
do $$
declare r record; moved integer := 0;
begin
  alter table public.tasks disable trigger qc_tasks_guard_trg;
  for r in
    select board_id, team_id::uuid as team_id, project_id::uuid as project_id from (
      select b.id as board_id, min(m.team_id::text) as team_id, min(a.project_id::text) as project_id, count(*) as n
      from public.task_boards b
      join public.team_members m on m.employee_id = b.owner_id
      join public.project_team_assignments a on a.team_id = m.team_id
      where b.board_type = 'personal'
      group by b.id) s
    where n = 1
  loop
    update public.task_boards set board_type = 'project', project_id = r.project_id, team_id = r.team_id where id = r.board_id;
    update public.tasks set project_id = r.project_id, team_id = r.team_id where board_id = r.board_id;
    moved := moved + 1;
  end loop;
  alter table public.tasks enable trigger qc_tasks_guard_trg;
  raise notice 'Personal boards moved into their project: %', moved;
end $$;
