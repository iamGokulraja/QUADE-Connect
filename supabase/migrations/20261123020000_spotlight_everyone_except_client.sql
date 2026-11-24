-- =====================================================================================
-- SPOTLIGHT FOR EVERYONE EXCEPT CLIENTS
-- Admin, HR, Project Manager, Team Lead, Employee and QC can see the whole Spotlight (old posts included) no matter
-- when the account was created or which colleagues it is linked to. Clients and signed-out visitors see nothing.
--
-- Why a new employee saw an empty feed: the feed looks up the post author's profile, and the profile security rules
-- only show a person the profiles of colleagues they are linked to. A new employee is not linked to the author yet,
-- so the post was filtered out. The lookup now goes through a safe function that returns only name, role,
-- designation and photo (never phone, birthday or email).
-- Run once in the Supabase SQL Editor. Safe to re-run.
-- =====================================================================================
update public.profiles set is_active = true where is_active is null;

create or replace function public.qc_is_internal() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.role::text in ('admin','hr','project_manager','team_lead','employee','qc')
                     from public.profiles p where p.id = auth.uid()), false) $$;

-- Public face of every company member (only name, role, designation, photo) - for company members only
create or replace function public.sp_author_rows()
returns table (id uuid, full_name text, role text, designation text, avatar_path text, is_active boolean)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.role::text, p.designation, p.avatar_path, coalesce(p.is_active, true)
    from public.profiles p
   where public.qc_is_internal() and p.role::text in ('admin','hr','project_manager','team_lead','employee','qc')
$$;
revoke all on function public.sp_author_rows() from public, anon;
grant execute on function public.sp_author_rows() to authenticated;

create or replace view public.spotlight_authors as
select a.id, a.full_name, a.role, a.designation, a.avatar_path, a.is_active from public.sp_author_rows() a;

create or replace view public.spotlight_feed as
select p.id, p.user_id, p.content, p.category, p.created_at, p.updated_at,
  a.full_name as author_name, a.role as author_role, a.designation as author_designation, a.avatar_path as author_avatar,
  (select count(*) from public.spotlight_likes l where l.post_id = p.id)::int as like_count,
  (select count(*) from public.spotlight_comments c where c.post_id = p.id)::int as comment_count,
  exists (select 1 from public.spotlight_likes l where l.post_id = p.id and l.user_id = auth.uid()) as liked_by_me,
  coalesce((select json_agg(i.image_path order by i.created_at) from public.spotlight_post_images i where i.post_id = p.id), '[]'::json) as images
from public.spotlight_posts p
join public.sp_author_rows() a on a.id = p.user_id
where public.qc_is_internal();

grant select on public.spotlight_authors to authenticated;
grant select on public.spotlight_feed to authenticated;

-- Check: every profile and whether it can see Spotlight (all non-clients must say true)
select full_name, email, role, is_active,
       role::text in ('admin','hr','project_manager','team_lead','employee','qc') as can_see_spotlight
  from public.profiles order by role, full_name;
