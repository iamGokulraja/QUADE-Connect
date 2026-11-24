-- =====================================================================================
-- SPOTLIGHT: show every person's real name (likes list, comments) - including QC users and
-- people whose account was deactivated later. Run once in the Supabase SQL Editor. Safe to re-run.
-- Clients are still never listed. Only signed-in company members (not QC/clients) can read it, as before.
-- =====================================================================================
create or replace view public.spotlight_authors as
select p.id, p.full_name, p.role::text as role, p.designation, p.avatar_path, p.is_active
from public.profiles p
where p.role::text in ('admin','hr','project_manager','team_lead','employee','qc')
  and public.qc_is_internal();
grant select on public.spotlight_authors to authenticated;
