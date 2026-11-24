-- QUADE Connect: team-shared boards, simpler default columns, board discussion chat with notifications,
-- client edit/delete of their projects, and project delete cascade.
-- Run AFTER 20261115020000_board_columns_activity_realtime.sql. Safe to run more than once.

-- ============================================================
-- 1. DEFAULT COLUMNS: only Task Name, Owner, Status, Priority, Due Date are visible.
--    Everything else exists but is hidden (the eye icon in "Customize columns" shows it).
--    The Description column is no longer a board column (tasks keep their description).
-- ============================================================
create or replace function public.qc_seed_board() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.board_columns(board_id, column_key, name, position, is_default, is_visible)
  select new.id, k, n, i, true, i < 5 from (values
    (0,'name','Task Name'),(1,'owner','Owner'),(2,'status','Status'),(3,'priority','Priority'),(4,'due_date','Due Date'),
    (5,'timeline','Timeline'),(6,'time_tracking','Time Tracking'),(7,'attachments','Attachments'),
    (8,'created_by','Created By'),(9,'created_date','Created Date'),(10,'last_updated','Last Updated')) as v(i,k,n);
  insert into public.task_groups(board_id, name, position)
  select new.id, g, i from (values (0,'New Tasks'),(1,'In Progress'),(2,'Under Review'),(3,'Completed')) as v(i,g);
  return new;
end $$;

-- existing boards (first run only): hide the extra columns, drop Description, add Time Tracking and Attachments
do $$
begin
  if exists (select 1 from public.board_columns where column_key = 'description' and is_default) then
    delete from public.board_columns where column_key = 'description' and is_default;
    update public.board_columns set is_visible = false
      where is_default and column_key in ('timeline','created_by','created_date','last_updated');
    insert into public.board_columns(board_id, column_key, name, position, is_default, is_visible)
    select b.id, v.k, v.n, v.i, true, false from public.task_boards b
    cross join (values (20,'time_tracking','Time Tracking'),(21,'attachments','Attachments')) as v(i,k,n)
    on conflict do nothing;
  end if;
end $$;

-- ============================================================
-- 2. TEAM-SHARED BOARDS: a board created by the Team Lead is shared with the whole team.
--    Every team member sees all of its tasks (read-only unless the task is theirs).
--    Boards created by an employee stay private to that employee, the Team Lead and the Project Manager.
-- ============================================================
create or replace function public.qc_can_view_task(task uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.qc_role() is not null and exists (
    select 1 from public.tasks t where t.id = task and (
      (t.project_id is not null and (
          public.qc_is_admin() or t.assigned_to = auth.uid() or t.created_by = auth.uid()
          or public.qc_leads_team(t.team_id) or public.qc_manages_project(t.project_id)
          or (t.board_id is not null and not public.qc_board_member_owned(t.board_id)
              and exists (select 1 from public.team_members m where m.team_id = t.team_id and m.employee_id = auth.uid()))))
      or (t.project_id is null and (
          t.created_by = auth.uid() or public.qc_leads_employee(t.created_by) or public.qc_pm_sees_employee(t.created_by)))))
$$;

drop policy if exists qc_tasks_select on public.tasks;
create policy qc_tasks_select on public.tasks for select to authenticated using (
  (project_id is not null and (
      public.qc_is_admin() or assigned_to = auth.uid() or created_by = auth.uid()
      or public.qc_leads_team(team_id) or public.qc_manages_project(project_id)
      or (board_id is not null and not public.qc_board_member_owned(board_id)
          and exists (select 1 from public.team_members m where m.team_id = tasks.team_id and m.employee_id = auth.uid()))))
  or (project_id is null and (
      created_by = auth.uid() or public.qc_leads_employee(created_by) or public.qc_pm_sees_employee(created_by))));

-- ============================================================
-- 3. BOARD DISCUSSION CHAT
-- Anyone who can see a board can write on it. Everyone else on the board is notified.
-- ============================================================
alter table public.work_notifications add column if not exists board_id uuid references public.task_boards(id) on delete cascade;

create table if not exists public.board_messages (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.task_boards(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  body text not null check (length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists qc_board_messages_idx on public.board_messages(board_id, created_at);
alter table public.board_messages enable row level security;
drop policy if exists qc_bmsg_select on public.board_messages;
create policy qc_bmsg_select on public.board_messages for select to authenticated using (public.qc_can_view_board(board_id));
drop policy if exists qc_bmsg_insert on public.board_messages;
create policy qc_bmsg_insert on public.board_messages for insert to authenticated
  with check (sender_id = auth.uid() and public.qc_can_view_board(board_id));
drop policy if exists qc_bmsg_delete on public.board_messages;
create policy qc_bmsg_delete on public.board_messages for delete to authenticated using (sender_id = auth.uid());

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
    union select t.team_lead_id from public.teams t where t.id = b.team_id
    union select p.project_manager_id from public.projects p where p.id = b.project_id
    union select m.employee_id from public.team_members m
          where m.team_id = b.team_id and not public.qc_board_member_owned(b.id)
  ) r
  where r.rid is not null and r.rid <> new.sender_id;
  return new;
end $$;
drop trigger if exists qc_notify_board_message_trg on public.board_messages;
create trigger qc_notify_board_message_trg after insert on public.board_messages
  for each row execute function public.qc_notify_board_message();

do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['board_messages','work_notifications'] loop
      if to_regclass('public.' || t) is not null and not exists (
           select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

-- ============================================================
-- 4. CLIENT PROJECTS: clients edit / delete their own projects; changes flow to the internal project.
--    Deleting a client project (or an internal project) removes its team assignments, boards and tasks.
-- ============================================================
alter table public.client_project_requests enable row level security;
drop policy if exists qc_cpr_client_update on public.client_project_requests;
create policy qc_cpr_client_update on public.client_project_requests for update to authenticated
  using (created_by = auth.uid()) with check (created_by = auth.uid());
drop policy if exists qc_cpr_client_delete on public.client_project_requests;
create policy qc_cpr_client_delete on public.client_project_requests for delete to authenticated
  using (created_by = auth.uid());

-- a client can change the details, never the review status or the owner
create or replace function public.qc_cpr_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and public.qc_role() = 'client' then
    new.status := old.status;
    new.created_by := old.created_by;
  end if;
  return new;
end $$;
drop trigger if exists qc_cpr_guard_trg on public.client_project_requests;
create trigger qc_cpr_guard_trg before update on public.client_project_requests
  for each row execute function public.qc_cpr_guard();

-- edits flow to the internal project created from the request
create or replace function public.qc_cpr_sync() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.projects set name = new.name, description = new.description, priority = new.priority,
         start_date = new.start_date, due_date = new.due_date
   where source_request_id = new.id;
  return new;
end $$;
drop trigger if exists qc_cpr_sync_trg on public.client_project_requests;
create trigger qc_cpr_sync_trg after update of name, description, priority, start_date, due_date on public.client_project_requests
  for each row execute function public.qc_cpr_sync();

-- deleting the request deletes the internal project
create or replace function public.qc_cpr_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.projects where source_request_id = old.id;
  return old;
end $$;
drop trigger if exists qc_cpr_delete_trg on public.client_project_requests;
create trigger qc_cpr_delete_trg before delete on public.client_project_requests
  for each row execute function public.qc_cpr_delete();

-- deleting a project removes the whole hierarchy under it (team assignments, boards, tasks, notifications)
create or replace function public.qc_project_cascade() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.project_team_assignments where project_id = old.id;
  delete from public.task_boards where project_id = old.id;
  delete from public.tasks where project_id = old.id;
  delete from public.work_notifications where project_id = old.id;
  return old;
end $$;
drop trigger if exists qc_project_cascade_trg on public.projects;
create trigger qc_project_cascade_trg before delete on public.projects
  for each row execute function public.qc_project_cascade();

drop policy if exists qc_projects_admin_delete on public.projects;
create policy qc_projects_admin_delete on public.projects for delete to authenticated using (public.qc_is_admin());
