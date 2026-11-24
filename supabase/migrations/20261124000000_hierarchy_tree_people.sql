-- QUADE Connect · Reporting Hierarchy tree (drag & drop) + People page
-- Run once in Supabase -> SQL Editor. Safe to run again. Nothing existing is dropped or changed:
-- it only ADDS a history table, triggers, extra read policies and three HR/Admin move functions.
--
-- What it guarantees
--  * Moving an employee to another team, or replacing a team's Team Lead, never removes the work they already had:
--    the projects of the old team stay visible in their project section ("Previous team"), together with the
--    project owner (Project Manager), their own boards and tasks. New projects follow the NEW team automatically.
--  * Moving a Team Lead under another Project Manager changes only the reporting line. Projects keep their owner.

-- ============ 1. HISTORY: which projects a person keeps seeing after a team change ============
create table if not exists public.staff_project_access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  team_id uuid,                                   -- the team they worked in (plain id, so deleting a team never blocks)
  role_at_time text,                              -- 'employee' | 'team_lead'
  reason text,
  created_at timestamptz not null default now(),
  unique (user_id, project_id)
);
create index if not exists staff_project_access_user_idx on public.staff_project_access(user_id);

alter table public.staff_project_access enable row level security;
drop policy if exists staff_project_access_select on public.staff_project_access;
create policy staff_project_access_select on public.staff_project_access for select to authenticated
  using (user_id = auth.uid() or public.qc_is_hr_or_admin());
grant select on public.staff_project_access to authenticated;     -- rows are written only by the triggers below

-- helpers (security definer, so policies never recurse)
create or replace function public.qc_has_project_history(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (select 1 from public.staff_project_access where user_id = auth.uid() and project_id = p)
$$;
create or replace function public.qc_has_team_history(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (select 1 from public.staff_project_access where user_id = auth.uid() and team_id = t)
$$;
-- the project owner and the old Team Lead of a project I keep seeing
create or replace function public.qc_history_sees_profile(target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (
    select 1 from public.staff_project_access a
    join public.projects p on p.id = a.project_id
    where a.user_id = auth.uid()
      and (p.project_manager_id = target
           or exists (select 1 from public.teams t where t.id = a.team_id and t.team_lead_id = target)))
$$;

-- extra READ access (policies are permissive, so they are added to the existing ones)
drop policy if exists qc_history_projects_select on public.projects;
create policy qc_history_projects_select on public.projects for select to authenticated using (public.qc_has_project_history(id));
drop policy if exists qc_history_assignments_select on public.project_team_assignments;
create policy qc_history_assignments_select on public.project_team_assignments for select to authenticated
  using (public.qc_has_project_history(project_id));
drop policy if exists qc_history_teams_select on public.teams;
create policy qc_history_teams_select on public.teams for select to authenticated using (public.qc_has_team_history(id));
drop policy if exists qc_history_profiles_select on public.profiles;
create policy qc_history_profiles_select on public.profiles for select to authenticated using (public.qc_history_sees_profile(id));

-- HR and Admin can always read the organisation structure (the hierarchy tree and People page need it)
drop policy if exists qc_hr_admin_read_projects on public.projects;
create policy qc_hr_admin_read_projects on public.projects for select to authenticated using (public.qc_is_hr_or_admin());
drop policy if exists qc_hr_admin_read_assignments on public.project_team_assignments;
create policy qc_hr_admin_read_assignments on public.project_team_assignments for select to authenticated using (public.qc_is_hr_or_admin());
drop policy if exists qc_hr_admin_read_teams on public.teams;
create policy qc_hr_admin_read_teams on public.teams for select to authenticated using (public.qc_is_hr_or_admin());
drop policy if exists qc_hr_admin_read_members on public.team_members;
create policy qc_hr_admin_read_members on public.team_members for select to authenticated using (public.qc_is_hr_or_admin());

-- ============ 2. TRIGGERS: remember the old team's projects whenever someone leaves a team or loses a team ============
-- Works for every way a change can happen (this tree, the Teams page, SQL). A failure here never blocks the change itself.
create or replace function public.qc_snapshot_member_leave() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    insert into public.staff_project_access(user_id, project_id, team_id, role_at_time, reason)
    select old.employee_id, a.project_id, old.team_id, 'employee', 'left team'
      from public.project_team_assignments a where a.team_id = old.team_id
    on conflict (user_id, project_id) do nothing;
  exception when others then null;
  end;
  return old;
end $$;
drop trigger if exists qc_snapshot_member_leave_trg on public.team_members;
create trigger qc_snapshot_member_leave_trg after delete on public.team_members
  for each row execute function public.qc_snapshot_member_leave();

create or replace function public.qc_snapshot_lead_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.team_lead_id is not null and old.team_lead_id is distinct from new.team_lead_id then
    begin
      insert into public.staff_project_access(user_id, project_id, team_id, role_at_time, reason)
      select old.team_lead_id, a.project_id, old.id, 'team_lead', 'replaced as team lead'
        from public.project_team_assignments a where a.team_id = old.id
      on conflict (user_id, project_id) do nothing;
    exception when others then null;
    end;
  end if;
  return new;
end $$;
drop trigger if exists qc_snapshot_lead_change_trg on public.teams;
create trigger qc_snapshot_lead_change_trg after update of team_lead_id on public.teams
  for each row execute function public.qc_snapshot_lead_change();

-- ============ 3. MOVE FUNCTIONS (HR / Admin only) ============
-- Employee: team -> team (p_from / p_to may be null: "no team yet")
create or replace function public.hr_move_employee(p_employee uuid, p_from uuid, p_to uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.qc_is_hr_or_admin() then raise exception 'Only HR or Admin can move people between teams.'; end if;
  if not exists (select 1 from public.profiles where id = p_employee and role = 'employee') then
    raise exception 'Only employees can be moved between teams.'; end if;
  if p_to is not null and not exists (select 1 from public.teams where id = p_to) then raise exception 'That team does not exist.'; end if;
  if p_from is not distinct from p_to then return; end if;
  if p_from is not null then
    delete from public.team_members where team_id = p_from and employee_id = p_employee;   -- trigger keeps their old projects visible
  end if;
  if p_to is not null and not exists (select 1 from public.team_members where team_id = p_to and employee_id = p_employee) then
    insert into public.team_members(team_id, employee_id) values (p_to, p_employee);
  end if;
end $$;

-- Team Lead: which Project Manager they report to (p_pm null = not assigned to any Project Manager)
create or replace function public.hr_move_team_lead(p_lead uuid, p_pm uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.qc_is_hr_or_admin() then raise exception 'Only HR or Admin can change the reporting line.'; end if;
  if not exists (select 1 from public.profiles where id = p_lead and role = 'team_lead') then raise exception 'That person is not a Team Lead.'; end if;
  if p_pm is not null and not exists (select 1 from public.profiles where id = p_pm and role = 'project_manager') then
    raise exception 'That person is not a Project Manager.'; end if;
  delete from public.project_manager_team_leads where team_lead_id = p_lead;
  if p_pm is not null then
    insert into public.project_manager_team_leads(project_manager_id, team_lead_id) values (p_pm, p_lead);
  end if;
end $$;

-- Team: replace the Team Lead (p_lead null = leave the team without a lead)
create or replace function public.hr_set_team_lead(p_team uuid, p_lead uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.qc_is_hr_or_admin() then raise exception 'Only HR or Admin can change a Team Lead.'; end if;
  if not exists (select 1 from public.teams where id = p_team) then raise exception 'That team does not exist.'; end if;
  if p_lead is not null and not exists (select 1 from public.profiles where id = p_lead and role = 'team_lead') then
    raise exception 'That person is not a Team Lead.'; end if;
  update public.teams set team_lead_id = p_lead where id = p_team;                          -- trigger keeps the old lead's projects visible
end $$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('hr_move_employee','hr_move_team_lead','hr_set_team_lead') loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;
