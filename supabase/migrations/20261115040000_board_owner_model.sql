-- QUADE Connect: one board = one owner.
--  * Whoever creates a board picks its OWNER: an employee creates a board for themselves; a Team Lead creates a board
--    for themselves or for one employee of the team.
--  * Every task on a board belongs to the board owner (the task "Owner" column is always the board owner).
--  * A board and its tasks are visible only to the owner, the creator, the Team Lead of the team, the Project Manager of
--    the project and Admin. Other employees never see them.
--  * The creator manages the board (rename, columns, groups, delete) and may add tasks; the owner works on the tasks.
-- Run AFTER 20261115030000_board_sharing_chat_client_projects.sql. Safe to run more than once.

alter table public.task_boards add column if not exists created_by uuid references public.profiles(id) on delete set null;
update public.task_boards set created_by = owner_id where created_by is null;
create index if not exists qc_boards_creator_idx on public.task_boards(created_by);

-- ---------- board defaults / validation ----------
create or replace function public.qc_boards_defaults() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by, new.owner_id);
    new.owner_id := coalesce(new.owner_id, new.created_by);
    new.created_by_role := (select role from public.profiles where id = new.created_by);
  else
    new.created_by := old.created_by;
    new.created_by_role := old.created_by_role;
    if new.owner_id is distinct from old.owner_id and new.board_type = 'project' and not exists (
         select 1 from public.team_members m where m.team_id = new.team_id and m.employee_id = new.owner_id
         union all select 1 from public.teams t where t.id = new.team_id and t.team_lead_id = new.owner_id) then
      raise exception 'The board owner must be a member of the team.';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists qc_boards_defaults_trg on public.task_boards;
create trigger qc_boards_defaults_trg before insert or update on public.task_boards
  for each row execute function public.qc_boards_defaults();

-- ---------- visibility / permissions ----------
create or replace function public.qc_can_view_board(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.task_boards x where x.id = b and (
    x.owner_id = auth.uid() or x.created_by = auth.uid()
    or (x.board_type = 'project' and (public.qc_is_admin() or public.qc_leads_team(x.team_id) or public.qc_manages_project(x.project_id)))
    or (x.board_type = 'personal' and (public.qc_leads_employee(x.owner_id) or public.qc_pm_sees_employee(x.owner_id)))))
$$;

-- the creator manages the board structure
create or replace function public.qc_can_manage_board(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.task_boards x where x.id = b and coalesce(x.created_by, x.owner_id) = auth.uid())
$$;

-- the creator and the owner may add tasks
create or replace function public.qc_can_add_task(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.task_boards x where x.id = b and (x.owner_id = auth.uid() or coalesce(x.created_by, x.owner_id) = auth.uid()))
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
          or (t.board_id is not null and public.qc_can_manage_board(t.board_id))))
      or (t.project_id is null and t.created_by = auth.uid())))
$$;

-- ---------- task rules ----------
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
    if auth.uid() is not null then new.created_by := auth.uid(); else new.created_by := coalesce(new.created_by, new.assigned_to); end if;
    if new.parent_task_id is not null then
      select project_id, team_id, board_id, group_id into parent from public.tasks where id = new.parent_task_id;
      new.project_id := parent.project_id;
      new.team_id := parent.team_id;
      new.board_id := parent.board_id;
      new.group_id := parent.group_id;
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
      new.assigned_to := b.owner_id;            -- one board = one owner
    elsif new.project_id is null then
      new.team_id := null;
      if auth.uid() is not null then new.assigned_to := auth.uid(); end if;
    end if;
    return new;
  end if;

  -- UPDATE
  if old.project_id is null then
    new.project_id := null; new.team_id := null; new.created_by := old.created_by; new.assigned_to := old.created_by;
    return new;
  end if;
  if old.board_id is not null then
    new.project_id := old.project_id; new.team_id := old.team_id; new.board_id := old.board_id; new.created_by := old.created_by;
    select owner_id into new.assigned_to from public.task_boards where id = old.board_id;   -- follows the board owner
    if auth.uid() is null or public.qc_can_manage_board(old.board_id) or old.created_by = auth.uid() then
      return new;
    end if;
    -- the board owner working on a task somebody else created: status, hours, group and custom fields only
    if new.parent_task_id is distinct from old.parent_task_id or new.title is distinct from old.title
       or new.description is distinct from old.description or new.priority is distinct from old.priority
       or new.due_date is distinct from old.due_date or new.start_date is distinct from old.start_date
       or new.estimated_hours is distinct from old.estimated_hours then
      raise exception 'You can only update the status of tasks created by someone else.';
    end if;
    return new;
  end if;
  -- old project tasks without a board
  if auth.uid() is null or public.qc_is_admin() or public.qc_leads_team(old.team_id) then return new; end if;
  if new.project_id is distinct from old.project_id or new.team_id is distinct from old.team_id
     or new.title is distinct from old.title or new.assigned_to is distinct from old.assigned_to
     or new.priority is distinct from old.priority or new.due_date is distinct from old.due_date then
    raise exception 'You can only update status and progress on your own tasks.';
  end if;
  return new;
end $$;

-- when the board owner changes, every task on the board moves to the new owner
create or replace function public.qc_board_owner_changed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.tasks set assigned_to = new.owner_id where board_id = new.id and assigned_to is distinct from new.owner_id;
  return new;
end $$;
drop trigger if exists qc_board_owner_changed_trg on public.task_boards;
create trigger qc_board_owner_changed_trg after update of owner_id on public.task_boards
  for each row when (old.owner_id is distinct from new.owner_id) execute function public.qc_board_owner_changed();

-- ---------- policies ----------
drop policy if exists qc_boards_select on public.task_boards;
create policy qc_boards_select on public.task_boards for select to authenticated
  using (owner_id = auth.uid() or created_by = auth.uid() or public.qc_can_view_board(id));

drop policy if exists qc_boards_insert on public.task_boards;
create policy qc_boards_insert on public.task_boards for insert to authenticated with check (
  board_type = 'project' and public.qc_team_on_project(team_id, project_id) and (
    (owner_id = auth.uid() and (public.qc_leads_team(team_id)
        or exists (select 1 from public.team_members m where m.team_id = task_boards.team_id and m.employee_id = auth.uid())))
    or (public.qc_leads_team(team_id)
        and exists (select 1 from public.team_members m where m.team_id = task_boards.team_id and m.employee_id = task_boards.owner_id))));

drop policy if exists qc_boards_update on public.task_boards;
create policy qc_boards_update on public.task_boards for update to authenticated
  using (public.qc_can_manage_board(id)) with check (public.qc_can_manage_board(id));

drop policy if exists qc_tasks_select on public.tasks;
create policy qc_tasks_select on public.tasks for select to authenticated using (
  (project_id is not null and (
      public.qc_is_admin() or assigned_to = auth.uid() or created_by = auth.uid()
      or public.qc_leads_team(team_id) or public.qc_manages_project(project_id)))
  or (project_id is null and (
      created_by = auth.uid() or public.qc_leads_employee(created_by) or public.qc_pm_sees_employee(created_by))));

drop policy if exists qc_tasks_insert on public.tasks;
create policy qc_tasks_insert on public.tasks for insert to authenticated with check (
  (project_id is not null and board_id is not null and public.qc_can_add_task(board_id))
  or (project_id is null and public.qc_role() in ('employee','team_lead') and (
      (parent_task_id is null and board_id is not null and public.qc_can_manage_board(board_id))
      or (parent_task_id is not null and public.qc_can_work_task(parent_task_id)))));

drop policy if exists qc_tasks_update on public.tasks;
create policy qc_tasks_update on public.tasks for update to authenticated
  using ((project_id is not null and (
            assigned_to = auth.uid()
            or (board_id is not null and public.qc_can_manage_board(board_id))
            or (board_id is null and (public.qc_is_admin() or public.qc_leads_team(team_id)))))
         or (project_id is null and created_by = auth.uid()))
  with check ((project_id is not null and (
            assigned_to = auth.uid()
            or (board_id is not null and public.qc_can_manage_board(board_id))
            or (board_id is null and (public.qc_is_admin() or public.qc_leads_team(team_id)))))
         or (project_id is null and created_by = auth.uid()));

drop policy if exists qc_tasks_delete on public.tasks;
create policy qc_tasks_delete on public.tasks for delete to authenticated
  using ((project_id is not null and (
            created_by = auth.uid()
            or (board_id is not null and public.qc_can_manage_board(board_id))
            or (board_id is null and (public.qc_is_admin() or public.qc_leads_team(team_id)))))
         or (project_id is null and created_by = auth.uid()));

-- ---------- board chat: owner, creator, Team Lead and Project Manager are notified ----------
create or replace function public.qc_notify_board_message() returns trigger
language plpgsql security definer set search_path = public as $$
declare b record; sender text;
begin
  select * into b from public.task_boards where id = new.board_id;
  select coalesce(full_name, email, 'Someone') into sender from public.profiles where id = new.sender_id;
  insert into public.work_notifications(recipient_id, type, title, message, project_id, board_id, is_urgent, dedupe_key)
  select r.rid, 'board_message', 'New message on ' || b.name,
         sender || ': ' || left(new.body, 140), b.project_id, b.id, false,
         'bmsg:' || new.id || ':' || r.rid
  from (
    select b.owner_id as rid
    union select b.created_by
    union select t.team_lead_id from public.teams t where t.id = b.team_id
    union select p.project_manager_id from public.projects p where p.id = b.project_id
  ) r
  where r.rid is not null and r.rid <> new.sender_id;
  return new;
end $$;

-- ---------- remove the earlier "board members" idea ----------
drop trigger if exists qc_task_assignee_check_trg on public.tasks;
drop function if exists public.qc_task_assignee_check();
drop table if exists public.board_members cascade;
drop function if exists public.qc_is_board_member(uuid);
drop function if exists public.qc_board_member_owned(uuid);
