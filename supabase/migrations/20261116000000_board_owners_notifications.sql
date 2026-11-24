-- QUADE Connect: multiple board owners, multiple task owners, PM boards, and notifications for everything.
--  * A board can have several OWNERS (employees / Team Lead of the team). They all see the board and its discussion.
--  * A task can have several OWNERS, and every task owner must be an owner of the board.
--  * Employees can only create boards for themselves and can never assign people. Team Leads and Project Managers choose the owners.
--  * Project Managers can create boards inside their projects. Everything a person is added to (project, team, board, task) sends a notification.
-- Run AFTER 20261115040000_board_owner_model.sql. Safe to run more than once.

-- ============================================================
-- 1. TABLES
-- ============================================================
create table if not exists public.board_owners (
  board_id uuid not null references public.task_boards(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  added_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (board_id, user_id)
);
create index if not exists qc_board_owners_user_idx on public.board_owners(user_id);

create table if not exists public.task_assignees (
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (task_id, user_id)
);
create index if not exists qc_task_assignees_user_idx on public.task_assignees(user_id);

-- existing data: the current owner / assignee becomes the first entry
insert into public.board_owners(board_id, user_id, added_by)
  select id, owner_id, created_by from public.task_boards where owner_id is not null on conflict do nothing;
-- (a task that belonged to someone who is not an owner of its board goes to the board's owner)
update public.tasks t set assigned_to = b.owner_id from public.task_boards b
  where t.board_id = b.id and b.owner_id is not null and t.assigned_to is distinct from b.owner_id
    and not exists (select 1 from public.board_owners o where o.board_id = b.id and o.user_id = t.assigned_to);
insert into public.task_assignees(task_id, user_id)
  select id, assigned_to from public.tasks where assigned_to is not null on conflict do nothing;

-- the board's first owner is always in board_owners
create or replace function public.qc_board_first_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.owner_id is not null then
    insert into public.board_owners(board_id, user_id, added_by) values (new.id, new.owner_id, auth.uid()) on conflict do nothing;
  end if;
  return new;
end $$;
drop trigger if exists qc_board_first_owner_trg on public.task_boards;
create trigger qc_board_first_owner_trg after insert on public.task_boards
  for each row execute function public.qc_board_first_owner();

-- the old single-owner cascade is replaced by set_board_owners()
drop trigger if exists qc_board_owner_changed_trg on public.task_boards;
drop function if exists public.qc_board_owner_changed();

-- owners must belong to the board's team
create or replace function public.qc_board_owner_check() returns trigger
language plpgsql security definer set search_path = public as $$
declare b record;
begin
  select * into b from public.task_boards where id = new.board_id;
  if b.board_type = 'project' and not exists (
       select 1 from public.team_members m where m.team_id = b.team_id and m.employee_id = new.user_id
       union all select 1 from public.teams t where t.id = b.team_id and t.team_lead_id = new.user_id) then
    raise exception 'A board owner must be the Team Lead or an employee of the team.';
  end if;
  return new;
end $$;
drop trigger if exists qc_board_owner_check_trg on public.board_owners;
create trigger qc_board_owner_check_trg before insert on public.board_owners
  for each row execute function public.qc_board_owner_check();

-- task owners must be board owners
create or replace function public.qc_task_assignee_check() returns trigger
language plpgsql security definer set search_path = public as $$
declare bid uuid;
begin
  select board_id into bid from public.tasks where id = new.task_id;
  if bid is not null and not exists (select 1 from public.board_owners where board_id = bid and user_id = new.user_id) then
    raise exception 'Task owners must be owners of the board.';
  end if;
  return new;
end $$;
drop trigger if exists qc_task_assignee_check_trg on public.task_assignees;
create trigger qc_task_assignee_check_trg before insert on public.task_assignees
  for each row execute function public.qc_task_assignee_check();

-- keep tasks.assigned_to (the first owner) inside task_assignees
create or replace function public.qc_task_sync_assignee() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.assigned_to is not null then
    insert into public.task_assignees(task_id, user_id) values (new.id, new.assigned_to) on conflict do nothing;
  end if;
  return null;
end $$;
drop trigger if exists qc_task_sync_assignee_trg on public.tasks;
create trigger qc_task_sync_assignee_trg after insert or update of assigned_to on public.tasks
  for each row execute function public.qc_task_sync_assignee();

-- removing an owner from a task keeps a primary owner
create or replace function public.qc_task_assignee_removed() returns trigger
language plpgsql security definer set search_path = public as $$
declare cur uuid; nxt uuid; exists_task boolean;
begin
  select assigned_to, true into cur, exists_task from public.tasks where id = old.task_id;
  if exists_task and cur = old.user_id then
    select user_id into nxt from public.task_assignees where task_id = old.task_id order by created_at limit 1;
    if nxt is null then raise exception 'A task needs at least one owner.'; end if;
    update public.tasks set assigned_to = nxt where id = old.task_id;
  end if;
  return null;
end $$;
drop trigger if exists qc_task_assignee_removed_trg on public.task_assignees;
create trigger qc_task_assignee_removed_trg after delete on public.task_assignees
  for each row execute function public.qc_task_assignee_removed();

-- ============================================================
-- 2. VISIBILITY / PERMISSIONS
-- ============================================================
create or replace function public.qc_is_board_owner(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.board_owners where board_id = b and user_id = auth.uid())
$$;

create or replace function public.qc_can_view_board(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.task_boards x where x.id = b and (
    x.owner_id = auth.uid() or x.created_by = auth.uid()
    or exists (select 1 from public.board_owners o where o.board_id = x.id and o.user_id = auth.uid())
    or (x.board_type = 'project' and (public.qc_is_admin() or public.qc_leads_team(x.team_id) or public.qc_manages_project(x.project_id)))
    or (x.board_type = 'personal' and (public.qc_leads_employee(x.owner_id) or public.qc_pm_sees_employee(x.owner_id)))))
$$;

create or replace function public.qc_can_manage_board(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.task_boards x where x.id = b and coalesce(x.created_by, x.owner_id) = auth.uid())
$$;

create or replace function public.qc_can_add_task(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.qc_can_manage_board(b) or public.qc_is_board_owner(b)
$$;

create or replace function public.qc_is_task_owner(task uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.task_assignees where task_id = task and user_id = auth.uid())
      or exists (select 1 from public.tasks where id = task and assigned_to = auth.uid())
$$;

create or replace function public.qc_can_view_task(task uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.qc_role() is not null and exists (
    select 1 from public.tasks t where t.id = task and (
      (t.project_id is not null and (
          public.qc_is_admin() or t.created_by = auth.uid() or public.qc_is_task_owner(t.id)
          or public.qc_leads_team(t.team_id) or public.qc_manages_project(t.project_id)
          or (t.board_id is not null and public.qc_can_view_board(t.board_id))))
      or (t.project_id is null and (
          t.created_by = auth.uid() or public.qc_leads_employee(t.created_by) or public.qc_pm_sees_employee(t.created_by)))))
$$;

create or replace function public.qc_can_work_task(task uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.qc_role() is not null and exists (
    select 1 from public.tasks t where t.id = task and (
      (t.project_id is not null and (
          public.qc_is_task_owner(t.id)
          or (t.board_id is not null and public.qc_can_manage_board(t.board_id))))
      or (t.project_id is null and t.created_by = auth.uid())))
$$;

-- ============================================================
-- 3. TASK RULES
-- ============================================================
create or replace function public.qc_tasks_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  parent record;
  b record;
  is_mgr boolean;
begin
  new.updated_at := now();
  if new.status = 'completed' then new.progress := 100;
  elsif new.status = 'pending' and not (tg_op = 'UPDATE' and exists (select 1 from public.tasks where parent_task_id = new.id)) then
    new.progress := 0;
  end if;

  if tg_op = 'INSERT' then
    if auth.uid() is not null then new.created_by := auth.uid(); else new.created_by := coalesce(new.created_by, new.assigned_to); end if;
    if new.parent_task_id is not null then
      select project_id, team_id, board_id, group_id, assigned_to into parent from public.tasks where id = new.parent_task_id;
      new.project_id := parent.project_id;
      new.team_id := parent.team_id;
      new.board_id := parent.board_id;
      new.group_id := parent.group_id;
      if new.assigned_to is null then new.assigned_to := parent.assigned_to; end if;
    end if;
    if new.board_id is not null then
      select * into b from public.task_boards where id = new.board_id;
      if b.id is null then raise exception 'Board not found.'; end if;
      if b.board_type = 'project' and (b.project_id is distinct from new.project_id or b.team_id is distinct from new.team_id) then
        raise exception 'This board belongs to a different project or team.';
      end if;
      if b.board_type = 'personal' then
        if new.project_id is not null or b.owner_id is distinct from new.created_by then
          raise exception 'Personal board tasks belong to the board owner.';
        end if;
        new.assigned_to := b.owner_id;
        return new;
      end if;
      is_mgr := auth.uid() is null or coalesce(b.created_by, b.owner_id) = auth.uid();
      if is_mgr then
        -- the creator picks the owner, who must be an owner of the board
        if new.assigned_to is not null and not exists (select 1 from public.board_owners where board_id = b.id and user_id = new.assigned_to) then
          if auth.uid() is not null then raise exception 'Task owners must be owners of the board.'; end if;
          new.assigned_to := null;
        end if;
        if new.assigned_to is null then
          new.assigned_to := case when exists (select 1 from public.board_owners where board_id = b.id and user_id = coalesce(auth.uid(), b.created_by))
                                  then coalesce(auth.uid(), b.created_by) else b.owner_id end;
        end if;
      else
        new.assigned_to := auth.uid();          -- an owner who is not the board's creator only adds tasks for themselves
      end if;
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
    is_mgr := auth.uid() is null or public.qc_can_manage_board(old.board_id);
    if is_mgr then
      if new.assigned_to is distinct from old.assigned_to
         and not exists (select 1 from public.board_owners where board_id = old.board_id and user_id = new.assigned_to) then
        raise exception 'Task owners must be owners of the board.';
      end if;
      return new;
    end if;
    new.assigned_to := old.assigned_to;         -- only the board creator changes task owners
    if old.created_by = auth.uid() then return new; end if;
    if new.parent_task_id is distinct from old.parent_task_id or new.title is distinct from old.title
       or new.description is distinct from old.description or new.priority is distinct from old.priority
       or new.due_date is distinct from old.due_date or new.start_date is distinct from old.start_date
       or new.estimated_hours is distinct from old.estimated_hours then
      raise exception 'You can only update the status of tasks created by someone else.';
    end if;
    return new;
  end if;
  if auth.uid() is null or public.qc_is_admin() or public.qc_leads_team(old.team_id) then return new; end if;
  if new.project_id is distinct from old.project_id or new.team_id is distinct from old.team_id
     or new.title is distinct from old.title or new.assigned_to is distinct from old.assigned_to
     or new.priority is distinct from old.priority or new.due_date is distinct from old.due_date then
    raise exception 'You can only update status and progress on your own tasks.';
  end if;
  return new;
end $$;

-- ============================================================
-- 4. POLICIES
-- ============================================================
drop policy if exists qc_tasks_select on public.tasks;
create policy qc_tasks_select on public.tasks for select to authenticated using (
  (project_id is not null and (
      public.qc_is_admin() or assigned_to = auth.uid() or created_by = auth.uid()
      or public.qc_leads_team(team_id) or public.qc_manages_project(project_id)
      or (board_id is not null and public.qc_can_view_board(board_id))
      or public.qc_is_task_owner(id)))
  or (project_id is null and (
      created_by = auth.uid() or public.qc_leads_employee(created_by) or public.qc_pm_sees_employee(created_by))));

drop policy if exists qc_tasks_update on public.tasks;
create policy qc_tasks_update on public.tasks for update to authenticated
  using ((project_id is not null and (
            public.qc_is_task_owner(id)
            or (board_id is not null and public.qc_can_manage_board(board_id))
            or (board_id is null and (public.qc_is_admin() or public.qc_leads_team(team_id)))))
         or (project_id is null and created_by = auth.uid()))
  with check ((project_id is not null and (
            public.qc_is_task_owner(id)
            or (board_id is not null and public.qc_can_manage_board(board_id))
            or (board_id is null and (public.qc_is_admin() or public.qc_leads_team(team_id)))))
         or (project_id is null and created_by = auth.uid()));

alter table public.board_owners enable row level security;
drop policy if exists qc_board_owners_select on public.board_owners;
create policy qc_board_owners_select on public.board_owners for select to authenticated
  using (user_id = auth.uid() or public.qc_can_view_board(board_id));
revoke insert, update, delete on public.board_owners from authenticated;     -- changed only through set_board_owners()

alter table public.task_assignees enable row level security;
drop policy if exists qc_task_assignees_select on public.task_assignees;
create policy qc_task_assignees_select on public.task_assignees for select to authenticated using (public.qc_can_view_task(task_id));
drop policy if exists qc_task_assignees_insert on public.task_assignees;
create policy qc_task_assignees_insert on public.task_assignees for insert to authenticated
  with check (exists (select 1 from public.tasks t where t.id = task_id and t.board_id is not null and public.qc_can_manage_board(t.board_id)));
drop policy if exists qc_task_assignees_delete on public.task_assignees;
create policy qc_task_assignees_delete on public.task_assignees for delete to authenticated
  using (exists (select 1 from public.tasks t where t.id = task_id and t.board_id is not null and public.qc_can_manage_board(t.board_id)));
revoke update on public.task_assignees from authenticated;

-- ============================================================
-- 5. CREATE BOARD / CHANGE OWNERS (functions)
-- ============================================================
create or replace function public.create_board(p_project uuid, p_team uuid, p_name text, p_description text, p_owners uuid[])
returns public.task_boards
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  r text := public.qc_role();
  owners uuid[];
  o uuid;
  b public.task_boards;
begin
  if me is null or r is null then raise exception 'Please sign in.'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Board name is required.'; end if;
  if not public.qc_team_on_project(p_team, p_project) then raise exception 'This team is not assigned to the project.'; end if;

  select coalesce(array_agg(distinct x), '{}') into owners from unnest(coalesce(p_owners, '{}')) x where x is not null;

  if r = 'employee' then
    if not exists (select 1 from public.team_members where team_id = p_team and employee_id = me) then raise exception 'You are not a member of this team.'; end if;
    if owners <> array[me] and cardinality(owners) > 0 then raise exception 'Employees can only create boards for themselves.'; end if;
    owners := array[me];
  elsif r = 'team_lead' then
    if not public.qc_leads_team(p_team) then raise exception 'You do not lead this team.'; end if;
  elsif r = 'project_manager' then
    if not public.qc_manages_project(p_project) then raise exception 'This is not your project.'; end if;
  else
    raise exception 'Only Project Managers, Team Leads and employees can create boards.';
  end if;

  if cardinality(owners) = 0 then raise exception 'Choose at least one board owner.'; end if;
  foreach o in array owners loop
    if not exists (select 1 from public.team_members where team_id = p_team and employee_id = o)
       and not exists (select 1 from public.teams where id = p_team and team_lead_id = o) then
      raise exception 'Board owners must be the Team Lead or employees of the team.';
    end if;
  end loop;
  -- put the creator first when they are an owner
  if me = any(owners) then owners := array[me] || array_remove(owners, me); end if;

  insert into public.task_boards(name, description, board_type, project_id, team_id, owner_id)
  values (trim(p_name), nullif(trim(coalesce(p_description, '')), ''), 'project', p_project, p_team, owners[1])
  returning * into b;
  foreach o in array owners loop
    insert into public.board_owners(board_id, user_id, added_by) values (b.id, o, me) on conflict do nothing;
  end loop;
  return b;
end $$;

create or replace function public.set_board_owners(p_board uuid, p_owners uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare
  b record;
  owners uuid[];
  o uuid;
  creator uuid;
begin
  select * into b from public.task_boards where id = p_board;
  if b.id is null then raise exception 'Board not found.'; end if;
  if not public.qc_can_manage_board(p_board) then raise exception 'Only the person who created the board can change its owners.'; end if;
  creator := coalesce(b.created_by, b.owner_id);
  select coalesce(array_agg(distinct x), '{}') into owners from unnest(coalesce(p_owners, '{}')) x where x is not null;
  if cardinality(owners) = 0 then raise exception 'A board needs at least one owner.'; end if;
  if (select role from public.profiles where id = creator) = 'employee' and owners <> array[creator] then
    raise exception 'Employees cannot assign other people to their board.';
  end if;
  foreach o in array owners loop
    insert into public.board_owners(board_id, user_id, added_by) values (p_board, o, auth.uid()) on conflict do nothing;
  end loop;
  update public.task_boards set owner_id = case when b.owner_id = any(owners) then b.owner_id else owners[1] end where id = p_board;
  -- tasks owned by people who left move to a remaining owner
  update public.tasks t set assigned_to = coalesce(
      (select a.user_id from public.task_assignees a where a.task_id = t.id and a.user_id = any(owners) order by a.created_at limit 1), owners[1])
    where t.board_id = p_board and t.assigned_to is not null and t.assigned_to <> all(owners);
  delete from public.task_assignees a using public.tasks t
    where a.task_id = t.id and t.board_id = p_board and a.user_id <> all(owners);
  delete from public.board_owners where board_id = p_board and user_id <> all(owners);
end $$;

grant execute on function public.create_board(uuid, uuid, text, text, uuid[]) to authenticated;
grant execute on function public.set_board_owners(uuid, uuid[]) to authenticated;

-- ============================================================
-- 6. NOTIFICATIONS
-- ============================================================
alter table public.work_notifications add column if not exists board_id uuid references public.task_boards(id) on delete cascade;

create or replace function public.qc_push(rid uuid, kind text, ttl text, msg text, proj uuid, brd uuid, tsk uuid, urgent boolean, dkey text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if rid is null or rid is not distinct from auth.uid() then return; end if;
  insert into public.work_notifications(recipient_id, type, title, message, project_id, board_id, task_id, is_urgent, dedupe_key)
  values (rid, kind, ttl, msg, proj, brd, tsk, urgent, dkey) on conflict (dedupe_key) do nothing;
end $$;
revoke all on function public.qc_push(uuid, text, text, text, uuid, uuid, uuid, boolean, text) from public, anon, authenticated;

create or replace function public.qc_actor_name() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select coalesce(full_name, email) from public.profiles where id = auth.uid()), 'Someone')
$$;

-- made owner of a board
create or replace function public.qc_notify_board_owner() returns trigger
language plpgsql security definer set search_path = public as $$
declare b record; pn text;
begin
  select * into b from public.task_boards where id = new.board_id;
  select name into pn from public.projects where id = b.project_id;
  perform public.qc_push(new.user_id, 'board_owner', 'You are a board owner',
    public.qc_actor_name() || ' made you an owner of the board "' || b.name || '"' || coalesce(' in ' || pn, '') || '.',
    b.project_id, b.id, null, false, 'board-owner:' || new.board_id || ':' || new.user_id);
  return null;
end $$;
drop trigger if exists qc_notify_board_owner_trg on public.board_owners;
create trigger qc_notify_board_owner_trg after insert on public.board_owners
  for each row execute function public.qc_notify_board_owner();

-- a task was given to you
create or replace function public.qc_notify_task_owner() returns trigger
language plpgsql security definer set search_path = public as $$
declare t record; bn text;
begin
  select * into t from public.tasks where id = new.task_id;
  if t.project_id is null then return null; end if;
  select name into bn from public.task_boards where id = t.board_id;
  perform public.qc_push(new.user_id, 'task_assigned', 'New task assigned',
    public.qc_actor_name() || ' assigned you the task "' || t.title || '"' || coalesce(' on ' || bn, '') || '.',
    t.project_id, t.board_id, t.id, false, 'task-assign:' || new.task_id || ':' || new.user_id);
  return null;
end $$;
drop trigger if exists qc_notify_task_owner_trg on public.task_assignees;
create trigger qc_notify_task_owner_trg after insert on public.task_assignees
  for each row execute function public.qc_notify_task_owner();

-- Project Manager assigned to a project
create or replace function public.qc_notify_project_pm() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.project_manager_id is not null and (tg_op = 'INSERT' or new.project_manager_id is distinct from old.project_manager_id) then
    perform public.qc_push(new.project_manager_id, 'project_assigned', 'New project assigned',
      'You are the Project Manager of "' || new.name || '".', new.id, null, null, false, 'proj-pm:' || new.id || ':' || new.project_manager_id);
  end if;
  return null;
end $$;
drop trigger if exists qc_notify_project_pm_trg on public.projects;
create trigger qc_notify_project_pm_trg after insert or update of project_manager_id on public.projects
  for each row execute function public.qc_notify_project_pm();

-- a team is assigned to a project: its Team Lead and employees are told
create or replace function public.qc_notify_project_team() returns trigger
language plpgsql security definer set search_path = public as $$
declare pn text; tn text; rid uuid;
begin
  select name into pn from public.projects where id = new.project_id;
  select name into tn from public.teams where id = new.team_id;
  for rid in select team_lead_id from public.teams where id = new.team_id and team_lead_id is not null
             union select employee_id from public.team_members where team_id = new.team_id loop
    perform public.qc_push(rid, 'project_assigned', 'New project assigned',
      'Your team ' || coalesce(tn, '') || ' was assigned to the project "' || pn || '".', new.project_id, null, null, false,
      'proj-team:' || new.project_id || ':' || rid);
  end loop;
  return null;
end $$;
drop trigger if exists qc_notify_project_team_trg on public.project_team_assignments;
create trigger qc_notify_project_team_trg after insert on public.project_team_assignments
  for each row execute function public.qc_notify_project_team();

-- an employee joins a team that already has projects
create or replace function public.qc_notify_team_member() returns trigger
language plpgsql security definer set search_path = public as $$
declare tn text; pr record;
begin
  select name into tn from public.teams where id = new.team_id;
  perform public.qc_push(new.employee_id, 'team_added', 'Added to a team', 'You were added to the team ' || coalesce(tn, '') || '.',
    null, null, null, false, 'team-add:' || new.team_id || ':' || new.employee_id);
  for pr in select p.id, p.name from public.project_team_assignments a join public.projects p on p.id = a.project_id where a.team_id = new.team_id loop
    perform public.qc_push(new.employee_id, 'project_assigned', 'New project assigned',
      'Your team ' || coalesce(tn, '') || ' works on the project "' || pr.name || '".', pr.id, null, null, false,
      'proj-team:' || pr.id || ':' || new.employee_id);
  end loop;
  return null;
end $$;
drop trigger if exists qc_notify_team_member_trg on public.team_members;
create trigger qc_notify_team_member_trg after insert on public.team_members
  for each row execute function public.qc_notify_team_member();

-- a person becomes Team Lead of a team
create or replace function public.qc_notify_team_lead() returns trigger
language plpgsql security definer set search_path = public as $$
declare pr record;
begin
  if new.team_lead_id is not null and (tg_op = 'INSERT' or new.team_lead_id is distinct from old.team_lead_id) then
    perform public.qc_push(new.team_lead_id, 'team_added', 'You lead a team', 'You are the Team Lead of ' || new.name || '.',
      null, null, null, false, 'team-lead:' || new.id || ':' || new.team_lead_id);
    for pr in select p.id, p.name from public.project_team_assignments a join public.projects p on p.id = a.project_id where a.team_id = new.id loop
      perform public.qc_push(new.team_lead_id, 'project_assigned', 'New project assigned',
        'Your team ' || new.name || ' works on the project "' || pr.name || '".', pr.id, null, null, false,
        'proj-team:' || pr.id || ':' || new.team_lead_id);
    end loop;
  end if;
  return null;
end $$;
drop trigger if exists qc_notify_team_lead_trg on public.teams;
create trigger qc_notify_team_lead_trg after insert or update of team_lead_id on public.teams
  for each row execute function public.qc_notify_team_lead();

-- board discussion: every owner, the creator, the Team Lead and the Project Manager
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
    select o.user_id as rid from public.board_owners o where o.board_id = b.id
    union select b.owner_id
    union select b.created_by
    union select t.team_lead_id from public.teams t where t.id = b.team_id
    union select p.project_manager_id from public.projects p where p.id = b.project_id
  ) r
  where r.rid is not null and r.rid <> new.sender_id;
  return new;
end $$;

-- Spotlight: a new post is announced to everyone
do $$
declare c text;
begin
  if to_regclass('public.spotlight_notifications') is not null then
    for c in select conname from pg_constraint where conrelid = 'public.spotlight_notifications'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) ilike '%type%' loop
      execute format('alter table public.spotlight_notifications drop constraint %I', c);
    end loop;
    alter table public.spotlight_notifications add constraint spotlight_notifications_type_check check (type in ('like','comment','reply','post'));
  end if;
end $$;

create or replace function public.qc_sp_notify_post() returns trigger
language plpgsql security definer set search_path = public as $$
declare who text;
begin
  select coalesce(full_name, email) into who from public.profiles where id = new.user_id;
  insert into public.spotlight_notifications(recipient_id, actor_id, post_id, type, message)
  select p.id, new.user_id, new.id, 'post', coalesce(who, 'Someone') || ' shared a new post in Spotlight'
  from public.profiles p
  where p.id <> new.user_id and p.is_active and p.role in ('admin','hr','project_manager','team_lead','employee');
  return null;
end $$;
do $$ begin
  if to_regclass('public.spotlight_posts') is not null then
    drop trigger if exists qc_sp_notify_post_trg on public.spotlight_posts;
    create trigger qc_sp_notify_post_trg after insert on public.spotlight_posts
      for each row execute function public.qc_sp_notify_post();
  end if;
end $$;

-- ============================================================
-- 7. DEADLINE ALERTS (every owner of a task is alerted)
-- ============================================================
create or replace function public.qc_generate_deadline_alerts() returns integer
language plpgsql security definer set search_path = public as $$
declare
  today date := (now() at time zone public.qc_org_tz())::date;
  tomorrow date := (now() at time zone public.qc_org_tz())::date + 1;
  n integer := 0; c integer;
begin
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

  insert into public.work_notifications(recipient_id, type, title, message, project_id, task_id, board_id, due_date, dedupe_key)
  select a.user_id, 'task_due', 'Task due tomorrow',
         'Your task ' || t.title || ' is due tomorrow. Please update its status.', t.project_id, t.id, t.board_id, t.due_date,
         'task-due:' || t.id || ':' || a.user_id || ':' || t.due_date
  from public.tasks t join public.task_assignees a on a.task_id = t.id
  where t.due_date = tomorrow and t.status <> 'completed'
  on conflict (dedupe_key) do nothing;
  get diagnostics c = row_count; n := n + c;

  insert into public.work_notifications(recipient_id, type, title, message, project_id, task_id, board_id, due_date, dedupe_key)
  select tm.team_lead_id, 'task_due_team', 'Team task due tomorrow',
         coalesce(e.full_name, 'An employee') || ' has a task due tomorrow in ' || pr.name || '.', t.project_id, t.id, t.board_id, t.due_date,
         'task-due-tl:' || t.id || ':' || tm.team_lead_id || ':' || t.due_date
  from public.tasks t
  join public.teams tm on tm.id = t.team_id
  join public.projects pr on pr.id = t.project_id
  left join public.profiles e on e.id = t.assigned_to
  where t.project_id is not null and t.due_date = tomorrow and t.status <> 'completed'
    and tm.team_lead_id is not null
    and not exists (select 1 from public.task_assignees a where a.task_id = t.id and a.user_id = tm.team_lead_id)
  on conflict (dedupe_key) do nothing;
  get diagnostics c = row_count; n := n + c;

  insert into public.work_notifications(recipient_id, type, title, message, project_id, due_date, dedupe_key)
  select pr.project_manager_id, 'project_tasks_due', 'Tasks due tomorrow',
         pr.name || ' has ' || count(*) || ' task(s) due tomorrow.', pr.id, tomorrow,
         'pm-due:' || pr.id || ':' || pr.project_manager_id || ':' || tomorrow
  from public.tasks t join public.projects pr on pr.id = t.project_id
  where t.due_date = tomorrow and t.status <> 'completed' and t.parent_task_id is null and pr.project_manager_id is not null
  group by pr.id, pr.name, pr.project_manager_id
  on conflict (dedupe_key) do nothing;
  get diagnostics c = row_count; n := n + c;

  insert into public.work_notifications(recipient_id, type, title, message, project_id, task_id, board_id, due_date, dedupe_key)
  select a.user_id, 'task_overdue', 'Task overdue',
         'Your task ' || t.title || ' is overdue (was due ' || to_char(t.due_date, 'DD Mon YYYY') || ').', t.project_id, t.id, t.board_id, t.due_date,
         'task-over:' || t.id || ':' || a.user_id || ':' || t.due_date
  from public.tasks t join public.task_assignees a on a.task_id = t.id
  where t.due_date < today and t.status <> 'completed'
  on conflict (dedupe_key) do nothing;
  get diagnostics c = row_count; n := n + c;

  insert into public.work_notifications(recipient_id, type, title, message, project_id, task_id, board_id, due_date, dedupe_key)
  select tm.team_lead_id, 'task_overdue_team', 'Team task overdue',
         coalesce(e.full_name, 'An employee') || '''s task ' || t.title || ' is overdue in ' || pr.name || '.', t.project_id, t.id, t.board_id, t.due_date,
         'task-over-tl:' || t.id || ':' || tm.team_lead_id || ':' || t.due_date
  from public.tasks t
  join public.teams tm on tm.id = t.team_id
  join public.projects pr on pr.id = t.project_id
  left join public.profiles e on e.id = t.assigned_to
  where t.project_id is not null and t.due_date < today and t.status <> 'completed'
    and tm.team_lead_id is not null
    and not exists (select 1 from public.task_assignees a where a.task_id = t.id and a.user_id = tm.team_lead_id)
  on conflict (dedupe_key) do nothing;
  get diagnostics c = row_count; n := n + c;

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

-- ============================================================
-- 8. REALTIME (screens and the notification bell update by themselves)
-- ============================================================
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['board_owners','task_assignees','leave_notifications','spotlight_notifications','work_notifications','leave_requests'] loop
      if to_regclass('public.' || t) is not null and not exists (
           select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
