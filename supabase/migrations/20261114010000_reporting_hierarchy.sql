-- QUADE Connect: reporting hierarchy (Project Manager -> Team Leads -> their team employees).
-- Separate from HR teams and project-team assignments. Run AFTER 20261114000000_work_management.sql.
-- Requires columns project_manager_id and team_lead_id on project_manager_team_leads (see inspect file).

-- One Team Lead reports to one Project Manager (skipped silently if existing data has duplicates).
do $$ begin
  create unique index if not exists qc_pmtl_one_manager on public.project_manager_team_leads(team_lead_id);
exception when others then raise notice 'Unique index skipped: %', sqlerrm;
end $$;

alter table public.project_manager_team_leads enable row level security;

drop policy if exists qc_pmtl_select on public.project_manager_team_leads;
create policy qc_pmtl_select on public.project_manager_team_leads for select to authenticated using (
  public.qc_is_hr_or_admin() or project_manager_id = auth.uid() or team_lead_id = auth.uid());

drop policy if exists qc_pmtl_write on public.project_manager_team_leads;
create policy qc_pmtl_write on public.project_manager_team_leads for all to authenticated
  using (public.qc_is_hr_or_admin()) with check (public.qc_is_hr_or_admin());

-- Profile visibility now also follows the reporting hierarchy:
--  * a Project Manager sees their Team Leads and those leads' team employees
--  * a Team Lead sees the Project Manager they report to
-- A Team Lead still sees only their own team members (never another lead's employees).
create or replace function public.qc_can_see_profile(target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    target = auth.uid()
    or public.qc_role() in ('admin', 'hr')
    -- same team (as lead or member)
    or exists (
      select 1 from public.teams t
      where (t.team_lead_id = auth.uid()
             or exists (select 1 from public.team_members m where m.team_id = t.id and m.employee_id = auth.uid()))
        and (t.team_lead_id = target
             or exists (select 1 from public.team_members m2 where m2.team_id = t.id and m2.employee_id = target)))
    -- PM: people of teams working on my projects
    or exists (
      select 1 from public.projects p
      join public.project_team_assignments a on a.project_id = p.id
      join public.teams t on t.id = a.team_id
      where p.project_manager_id = auth.uid()
        and (t.team_lead_id = target
             or exists (select 1 from public.team_members m where m.team_id = t.id and m.employee_id = target)))
    -- team members: the PM of projects my team works on
    or exists (
      select 1 from public.projects p
      join public.project_team_assignments a on a.project_id = p.id
      join public.teams t on t.id = a.team_id
      where p.project_manager_id = target
        and (t.team_lead_id = auth.uid()
             or exists (select 1 from public.team_members m where m.team_id = t.id and m.employee_id = auth.uid())))
    -- PM: my reporting Team Leads and their team employees
    or exists (
      select 1 from public.project_manager_team_leads r
      where r.project_manager_id = auth.uid()
        and (r.team_lead_id = target
             or exists (select 1 from public.teams t join public.team_members m on m.team_id = t.id
                        where t.team_lead_id = r.team_lead_id and m.employee_id = target)))
    -- Team Lead: the PM I report to
    or exists (
      select 1 from public.project_manager_team_leads r
      where r.team_lead_id = auth.uid() and r.project_manager_id = target)
  )
$$;

-- A Project Manager may assign only teams led by a Team Lead who reports to them.
-- RESTRICTIVE policies are ANDed with the existing permissive ones, so nothing existing is changed.
create or replace function public.qc_pm_has_team(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.teams tm
    join public.project_manager_team_leads r on r.team_lead_id = tm.team_lead_id
    where tm.id = t and r.project_manager_id = auth.uid())
$$;

drop policy if exists qc_pta_pm_only_own_leads on public.project_team_assignments;
create policy qc_pta_pm_only_own_leads on public.project_team_assignments
  as restrictive for insert to authenticated
  with check (public.qc_role() is distinct from 'project_manager' or public.qc_pm_has_team(team_id));
