-- =====================================================================================
-- MY MOMENTS  (private photo / video / text memories for every company member)
-- Run once in the Supabase SQL Editor. Safe to re-run. Fixes: "Could not find the table 'public.moments'".
--
-- Who: Admin, HR, Project Manager, Team Lead, Employee and QC. Clients cannot use it.
-- Privacy: a moment and its files belong to ONE person. Nobody else can see them - not other staff, not HR, not Admin.
-- Files: private bucket "my-moments" (JPG, PNG, WEBP, GIF, MP4, WEBM, MOV; up to 50 MB each; 10 files per moment).
-- =====================================================================================

-- ============ 1. TABLES ============
create table if not exists public.moments (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  caption     text not null default '' check (length(caption) <= 2000),
  category    text not null default 'Team Moments' check (category in (
                'Team Moments','Team Celebration','Project Achievement','Appreciation','Awards & Rewards',
                'Promotion','Goal Achieved','Motivation')),
  moment_date date not null default ((now() at time zone 'Asia/Kolkata')::date),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists moments_user_date_idx on public.moments (user_id, moment_date desc, created_at desc);
create index if not exists moments_user_cat_idx  on public.moments (user_id, category, moment_date desc);

create table if not exists public.moment_media (
  id           uuid primary key default gen_random_uuid(),
  moment_id    uuid not null references public.moments(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  storage_path text not null unique,
  file_name    text not null,
  mime_type    text,
  media_type   text not null check (media_type in ('image','video')),
  file_size    bigint check (file_size is null or file_size between 1 and 52428800),
  created_at   timestamptz not null default now()
);
create index if not exists moment_media_moment_idx on public.moment_media (moment_id);

-- ============ 2. GUARDS ============
create or replace function public.moments_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.moment_date > (now() at time zone 'Asia/Kolkata')::date + 1 then raise exception 'A moment cannot be dated in the future.'; end if;
  if tg_op = 'UPDATE' then
    if new.user_id is distinct from old.user_id then raise exception 'A moment cannot change owner.'; end if;
    new.updated_at := now();
  end if;
  return new;
end $$;
drop trigger if exists moments_before_trg on public.moments;
create trigger moments_before_trg before insert or update on public.moments for each row execute function public.moments_before();

create or replace function public.moment_media_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.moments m where m.id = new.moment_id and m.user_id = new.user_id) then
    raise exception 'You can only add files to your own moments.'; end if;
  if (select count(*) from public.moment_media x where x.moment_id = new.moment_id) >= 10 then
    raise exception 'A moment can hold up to 10 files.'; end if;
  if split_part(new.storage_path, '/', 1) <> new.user_id::text then raise exception 'Invalid file path.'; end if;
  return new;
end $$;
drop trigger if exists moment_media_before_trg on public.moment_media;
create trigger moment_media_before_trg before insert on public.moment_media for each row execute function public.moment_media_before();

-- ============ 3. ROW LEVEL SECURITY (owner only) ============
alter table public.moments enable row level security;
alter table public.moment_media enable row level security;

drop policy if exists moments_owner_select on public.moments;
create policy moments_owner_select on public.moments for select to authenticated using (user_id = auth.uid() and public.qc_is_internal());
drop policy if exists moments_owner_insert on public.moments;
create policy moments_owner_insert on public.moments for insert to authenticated with check (user_id = auth.uid() and public.qc_is_internal());
drop policy if exists moments_owner_update on public.moments;
create policy moments_owner_update on public.moments for update to authenticated
  using (user_id = auth.uid() and public.qc_is_internal()) with check (user_id = auth.uid());
drop policy if exists moments_owner_delete on public.moments;
create policy moments_owner_delete on public.moments for delete to authenticated using (user_id = auth.uid() and public.qc_is_internal());

drop policy if exists moment_media_owner_select on public.moment_media;
create policy moment_media_owner_select on public.moment_media for select to authenticated using (user_id = auth.uid() and public.qc_is_internal());
drop policy if exists moment_media_owner_insert on public.moment_media;
create policy moment_media_owner_insert on public.moment_media for insert to authenticated with check (user_id = auth.uid() and public.qc_is_internal());
drop policy if exists moment_media_owner_delete on public.moment_media;
create policy moment_media_owner_delete on public.moment_media for delete to authenticated using (user_id = auth.uid() and public.qc_is_internal());

revoke all on public.moments, public.moment_media from anon;
grant select, insert, update, delete on public.moments to authenticated;
grant select, insert, delete on public.moment_media to authenticated;

-- ============ 4. NUMBERS FOR THE TOP CARDS (only my own rows) ============
create or replace function public.moments_stats()
returns table (total int, celebrations int, appreciations int)
language sql stable security invoker set search_path = public as $$
  select count(*)::int,
         (count(*) filter (where category = 'Team Celebration'))::int,
         (count(*) filter (where category = 'Appreciation'))::int
    from public.moments where user_id = auth.uid()
$$;
revoke all on function public.moments_stats() from public, anon;
grant execute on function public.moments_stats() to authenticated;

-- ============ 5. FILE STORAGE (private bucket, my own folder only) ============
insert into storage.buckets (id, name, public, file_size_limit)
values ('my-moments', 'my-moments', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = 52428800;

drop policy if exists moments_files_select on storage.objects;
create policy moments_files_select on storage.objects for select to authenticated
  using (bucket_id = 'my-moments' and (storage.foldername(name))[1] = auth.uid()::text and public.qc_is_internal());
drop policy if exists moments_files_insert on storage.objects;
create policy moments_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'my-moments' and (storage.foldername(name))[1] = auth.uid()::text and public.qc_is_internal());
drop policy if exists moments_files_delete on storage.objects;
create policy moments_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'my-moments' and (storage.foldername(name))[1] = auth.uid()::text and public.qc_is_internal());
