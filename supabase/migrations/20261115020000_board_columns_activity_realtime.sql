-- QUADE Connect: customizable board columns, default groups, board type, task activity history and Realtime.
-- Run AFTER 20261115010000_project_boards_v2.sql. Safe to run more than once.

-- ============================================================
-- 1. BOARD DETAILS: optional board type, creator role
-- ============================================================
alter table public.task_boards add column if not exists kind text;
alter table public.task_boards add column if not exists created_by_role text;
alter table public.tasks add column if not exists custom jsonb not null default '{}'::jsonb;

create or replace function public.qc_boards_defaults() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.created_by_role := coalesce(new.created_by_role, (select role from public.profiles where id = new.owner_id));
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists qc_boards_defaults_trg on public.task_boards;
create trigger qc_boards_defaults_trg before insert or update on public.task_boards
  for each row execute function public.qc_boards_defaults();
update public.task_boards b set created_by_role = p.role from public.profiles p where p.id = b.owner_id and b.created_by_role is null;

-- ============================================================
-- 2. BOARD COLUMNS (Monday-style, per board)
-- System columns can be hidden, renamed and reordered. Custom columns (text / number / date) can also be added and removed.
-- Values of custom columns live in tasks.custom { "<column id>": value }.
-- ============================================================
create table if not exists public.board_columns (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.task_boards(id) on delete cascade,
  column_key text not null,
  name text not null check (length(trim(name)) between 1 and 60),
  column_type text not null default 'system' check (column_type in ('system','text','number','date')),
  position integer not null default 0,
  is_default boolean not null default false,
  is_visible boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists qc_board_columns_idx on public.board_columns(board_id, position);
create unique index if not exists qc_board_columns_key_idx on public.board_columns(board_id, column_key) where is_default;

create or replace function public.qc_seed_board() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.board_columns(board_id, column_key, name, position, is_default)
  select new.id, k, n, i, true from (values
    (0,'name','Task Name'),(1,'owner','Owner'),(2,'status','Status'),(3,'priority','Priority'),(4,'due_date','Due Date'),
    (5,'timeline','Timeline'),(6,'description','Description'),(7,'created_by','Created By'),(8,'created_date','Created Date'),
    (9,'last_updated','Last Updated')) as v(i,k,n);
  insert into public.task_groups(board_id, name, position)
  select new.id, g, i from (values (0,'New Tasks'),(1,'In Progress'),(2,'Under Review'),(3,'Completed')) as v(i,g);
  return new;
end $$;
drop trigger if exists qc_seed_board_trg on public.task_boards;
create trigger qc_seed_board_trg after insert on public.task_boards
  for each row execute function public.qc_seed_board();

-- existing boards get the default columns; boards with no groups get the default groups
insert into public.board_columns(board_id, column_key, name, position, is_default)
select b.id, v.k, v.n, v.i, true
from public.task_boards b
cross join (values (0,'name','Task Name'),(1,'owner','Owner'),(2,'status','Status'),(3,'priority','Priority'),(4,'due_date','Due Date'),
  (5,'timeline','Timeline'),(6,'description','Description'),(7,'created_by','Created By'),(8,'created_date','Created Date'),
  (9,'last_updated','Last Updated')) as v(i,k,n)
where not exists (select 1 from public.board_columns c where c.board_id = b.id)
on conflict do nothing;
insert into public.task_groups(board_id, name, position)
select b.id, v.g, v.i from public.task_boards b
cross join (values (0,'New Tasks'),(1,'In Progress'),(2,'Under Review'),(3,'Completed')) as v(i,g)
where not exists (select 1 from public.task_groups x where x.board_id = b.id);

alter table public.board_columns enable row level security;
drop policy if exists qc_columns_select on public.board_columns;
create policy qc_columns_select on public.board_columns for select to authenticated using (public.qc_can_view_board(board_id));
drop policy if exists qc_columns_insert on public.board_columns;
create policy qc_columns_insert on public.board_columns for insert to authenticated
  with check (public.qc_can_manage_board(board_id) and not is_default);
drop policy if exists qc_columns_update on public.board_columns;
create policy qc_columns_update on public.board_columns for update to authenticated
  using (public.qc_can_manage_board(board_id)) with check (public.qc_can_manage_board(board_id));
drop policy if exists qc_columns_delete on public.board_columns;
create policy qc_columns_delete on public.board_columns for delete to authenticated
  using (public.qc_can_manage_board(board_id) and not is_default);

-- ============================================================
-- 3. TASK ACTIVITY HISTORY (written by the database, read by anyone who can see the task)
-- ============================================================
create table if not exists public.task_activity (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  project_id uuid,
  board_id uuid,
  actor_id uuid,
  action text not null,
  detail text,
  created_at timestamptz not null default now()
);
create index if not exists qc_activity_task_idx on public.task_activity(task_id, created_at desc);

create or replace function public.qc_log_task_activity() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  who uuid := auth.uid();
  parent_label text := case when new.parent_task_id is null then 'Task' else 'Sub-task' end;
  nm text;
begin
  if tg_op = 'INSERT' then
    insert into public.task_activity(task_id, project_id, board_id, actor_id, action, detail)
    values (new.id, new.project_id, new.board_id, who, 'created', parent_label || ' created: ' || new.title);
    return new;
  end if;
  if new.status is distinct from old.status then
    insert into public.task_activity(task_id, project_id, board_id, actor_id, action, detail)
    values (new.id, new.project_id, new.board_id, who, 'status', 'Status: ' || old.status || ' → ' || new.status);
  end if;
  if new.assigned_to is distinct from old.assigned_to then
    select coalesce(full_name, email) into nm from public.profiles where id = new.assigned_to;
    insert into public.task_activity(task_id, project_id, board_id, actor_id, action, detail)
    values (new.id, new.project_id, new.board_id, who, 'owner', 'Owner changed to ' || coalesce(nm, 'nobody'));
  end if;
  if new.priority is distinct from old.priority then
    insert into public.task_activity(task_id, project_id, board_id, actor_id, action, detail)
    values (new.id, new.project_id, new.board_id, who, 'priority', 'Priority: ' || old.priority || ' → ' || new.priority);
  end if;
  if new.due_date is distinct from old.due_date then
    insert into public.task_activity(task_id, project_id, board_id, actor_id, action, detail)
    values (new.id, new.project_id, new.board_id, who, 'due_date', 'Due date: ' || coalesce(old.due_date::text, 'none') || ' → ' || coalesce(new.due_date::text, 'none'));
  end if;
  if new.title is distinct from old.title then
    insert into public.task_activity(task_id, project_id, board_id, actor_id, action, detail)
    values (new.id, new.project_id, new.board_id, who, 'title', 'Renamed to: ' || new.title);
  end if;
  if new.group_id is distinct from old.group_id then
    insert into public.task_activity(task_id, project_id, board_id, actor_id, action, detail)
    values (new.id, new.project_id, new.board_id, who, 'group', 'Moved to another group');
  end if;
  return new;
end $$;
drop trigger if exists qc_log_task_activity_trg on public.tasks;
create trigger qc_log_task_activity_trg after insert or update on public.tasks
  for each row execute function public.qc_log_task_activity();

alter table public.task_activity enable row level security;
drop policy if exists qc_activity_select on public.task_activity;
create policy qc_activity_select on public.task_activity for select to authenticated using (public.qc_can_view_task(task_id));
revoke insert, update, delete on public.task_activity from authenticated;

-- ============================================================
-- 4. REALTIME (changes are filtered by the same row level security rules)
-- ============================================================
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['tasks','task_boards','task_groups','board_columns','task_comments','task_activity','task_attachments','task_worklogs'] loop
      if to_regclass('public.' || t) is not null and not exists (
           select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
