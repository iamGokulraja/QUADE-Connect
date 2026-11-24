-- QUADE Spotlight: internal social feed (posts, photos, likes, comments, notifications).
-- Safe to run more than once. Internal roles only: admin, hr, project_manager, team_lead, employee.

-- ============ 0. HELPERS ============
create or replace function public.qc_role() returns text
language sql stable security definer set search_path = public as $$
  select role::text from public.profiles where id = auth.uid() and is_active $$;

create or replace function public.qc_is_internal() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.qc_role() in ('admin','hr','project_manager','team_lead','employee'), false) $$;

create or replace function public.qc_can_moderate() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.qc_role() in ('admin','hr'), false) $$;

alter table public.profiles add column if not exists designation text;
alter table public.profiles add column if not exists avatar_path text;

-- ============ 1. TABLES ============
create table if not exists public.spotlight_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  content text not null default '' check (length(content) <= 5000),
  category text not null default 'General Updates' check (category in (
    'Company Events','Employee Achievements','Promotions','Team Activities',
    'Celebrations','Work Anniversaries','Company Memories','General Updates')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists qc_sp_posts_created_idx on public.spotlight_posts(created_at desc);
create index if not exists qc_sp_posts_user_idx on public.spotlight_posts(user_id, created_at desc);
create index if not exists qc_sp_posts_cat_idx on public.spotlight_posts(category, created_at desc);

create table if not exists public.spotlight_post_images (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.spotlight_posts(id) on delete cascade,
  image_path text not null,
  created_at timestamptz not null default now()
);
create index if not exists qc_sp_images_post_idx on public.spotlight_post_images(post_id);

create table if not exists public.spotlight_likes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.spotlight_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  unique (post_id, user_id)
);
create index if not exists qc_sp_likes_post_idx on public.spotlight_likes(post_id);

create table if not exists public.spotlight_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.spotlight_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  parent_comment_id uuid references public.spotlight_comments(id) on delete cascade,
  content text not null check (length(trim(content)) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists qc_sp_comments_post_idx on public.spotlight_comments(post_id, created_at);

create table if not exists public.spotlight_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete cascade,
  post_id uuid references public.spotlight_posts(id) on delete cascade,
  type text not null check (type in ('like','comment','reply')),
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists qc_sp_notif_idx on public.spotlight_notifications(recipient_id, is_read, created_at desc);

-- ============ 2. TRIGGERS ============
create or replace function public.qc_sp_touch() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;

drop trigger if exists qc_sp_posts_touch on public.spotlight_posts;
create trigger qc_sp_posts_touch before update on public.spotlight_posts
  for each row execute function public.qc_sp_touch();
drop trigger if exists qc_sp_comments_touch on public.spotlight_comments;
create trigger qc_sp_comments_touch before update on public.spotlight_comments
  for each row execute function public.qc_sp_touch();

-- at most 10 photos per post
create or replace function public.qc_sp_image_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.spotlight_post_images where post_id = new.post_id) >= 10 then
    raise exception 'A post can have at most 10 photos.';
  end if;
  return new;
end $$;
drop trigger if exists qc_sp_image_limit_trg on public.spotlight_post_images;
create trigger qc_sp_image_limit_trg before insert on public.spotlight_post_images
  for each row execute function public.qc_sp_image_limit();

-- replies: one level only, and on the same post
create or replace function public.qc_sp_comment_check() returns trigger
language plpgsql security definer set search_path = public as $$
declare parent public.spotlight_comments;
begin
  if new.parent_comment_id is not null then
    select * into parent from public.spotlight_comments where id = new.parent_comment_id;
    if parent.id is null or parent.post_id <> new.post_id then raise exception 'Invalid reply.'; end if;
    if parent.parent_comment_id is not null then new.parent_comment_id := parent.parent_comment_id; end if;
  end if;
  return new;
end $$;
drop trigger if exists qc_sp_comment_check_trg on public.spotlight_comments;
create trigger qc_sp_comment_check_trg before insert on public.spotlight_comments
  for each row execute function public.qc_sp_comment_check();

-- notifications (never about your own actions)
create or replace function public.qc_sp_notify_like() returns trigger
language plpgsql security definer set search_path = public as $$
declare owner uuid; who text;
begin
  select user_id into owner from public.spotlight_posts where id = new.post_id;
  if owner is null or owner = new.user_id then return null; end if;
  if exists (select 1 from public.spotlight_notifications where recipient_id = owner and actor_id = new.user_id
             and post_id = new.post_id and type = 'like' and not is_read) then return null; end if;
  select coalesce(full_name, email) into who from public.profiles where id = new.user_id;
  insert into public.spotlight_notifications(recipient_id, actor_id, post_id, type, message)
    values (owner, new.user_id, new.post_id, 'like', who || ' liked your post');
  return null;
end $$;
drop trigger if exists qc_sp_notify_like_trg on public.spotlight_likes;
create trigger qc_sp_notify_like_trg after insert on public.spotlight_likes
  for each row execute function public.qc_sp_notify_like();

create or replace function public.qc_sp_notify_comment() returns trigger
language plpgsql security definer set search_path = public as $$
declare owner uuid; parent_owner uuid; who text;
begin
  select coalesce(full_name, email) into who from public.profiles where id = new.user_id;
  select user_id into owner from public.spotlight_posts where id = new.post_id;
  if new.parent_comment_id is not null then
    select user_id into parent_owner from public.spotlight_comments where id = new.parent_comment_id;
    if parent_owner is not null and parent_owner <> new.user_id then
      insert into public.spotlight_notifications(recipient_id, actor_id, post_id, type, message)
        values (parent_owner, new.user_id, new.post_id, 'reply', who || ' replied to your comment');
    end if;
  end if;
  if owner is not null and owner <> new.user_id and owner is distinct from parent_owner then
    insert into public.spotlight_notifications(recipient_id, actor_id, post_id, type, message)
      values (owner, new.user_id, new.post_id, 'comment', who || ' commented on your post');
  end if;
  return null;
end $$;
drop trigger if exists qc_sp_notify_comment_trg on public.spotlight_comments;
create trigger qc_sp_notify_comment_trg after insert on public.spotlight_comments
  for each row execute function public.qc_sp_notify_comment();

-- ============ 3. ROW LEVEL SECURITY ============
alter table public.spotlight_posts enable row level security;
alter table public.spotlight_post_images enable row level security;
alter table public.spotlight_likes enable row level security;
alter table public.spotlight_comments enable row level security;
alter table public.spotlight_notifications enable row level security;

create or replace function public.qc_sp_owns_post(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.spotlight_posts where id = p and user_id = auth.uid()) $$;

-- posts
drop policy if exists qc_sp_posts_select on public.spotlight_posts;
create policy qc_sp_posts_select on public.spotlight_posts for select to authenticated using (public.qc_is_internal());
drop policy if exists qc_sp_posts_insert on public.spotlight_posts;
create policy qc_sp_posts_insert on public.spotlight_posts for insert to authenticated
  with check (public.qc_is_internal() and user_id = auth.uid());
drop policy if exists qc_sp_posts_update on public.spotlight_posts;
create policy qc_sp_posts_update on public.spotlight_posts for update to authenticated
  using (public.qc_is_internal() and user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists qc_sp_posts_delete on public.spotlight_posts;
create policy qc_sp_posts_delete on public.spotlight_posts for delete to authenticated
  using (public.qc_is_internal() and (user_id = auth.uid() or public.qc_can_moderate()));

-- images
drop policy if exists qc_sp_images_select on public.spotlight_post_images;
create policy qc_sp_images_select on public.spotlight_post_images for select to authenticated using (public.qc_is_internal());
drop policy if exists qc_sp_images_insert on public.spotlight_post_images;
create policy qc_sp_images_insert on public.spotlight_post_images for insert to authenticated
  with check (public.qc_is_internal() and public.qc_sp_owns_post(post_id));
drop policy if exists qc_sp_images_delete on public.spotlight_post_images;
create policy qc_sp_images_delete on public.spotlight_post_images for delete to authenticated
  using (public.qc_is_internal() and (public.qc_sp_owns_post(post_id) or public.qc_can_moderate()));

-- likes
drop policy if exists qc_sp_likes_select on public.spotlight_likes;
create policy qc_sp_likes_select on public.spotlight_likes for select to authenticated using (public.qc_is_internal());
drop policy if exists qc_sp_likes_insert on public.spotlight_likes;
create policy qc_sp_likes_insert on public.spotlight_likes for insert to authenticated
  with check (public.qc_is_internal() and user_id = auth.uid());
drop policy if exists qc_sp_likes_delete on public.spotlight_likes;
create policy qc_sp_likes_delete on public.spotlight_likes for delete to authenticated
  using (public.qc_is_internal() and user_id = auth.uid());

-- comments
drop policy if exists qc_sp_comments_select on public.spotlight_comments;
create policy qc_sp_comments_select on public.spotlight_comments for select to authenticated using (public.qc_is_internal());
drop policy if exists qc_sp_comments_insert on public.spotlight_comments;
create policy qc_sp_comments_insert on public.spotlight_comments for insert to authenticated
  with check (public.qc_is_internal() and user_id = auth.uid());
drop policy if exists qc_sp_comments_update on public.spotlight_comments;
create policy qc_sp_comments_update on public.spotlight_comments for update to authenticated
  using (public.qc_is_internal() and user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists qc_sp_comments_delete on public.spotlight_comments;
create policy qc_sp_comments_delete on public.spotlight_comments for delete to authenticated
  using (public.qc_is_internal() and (user_id = auth.uid() or public.qc_can_moderate()));

-- notifications (rows are created by the triggers above)
drop policy if exists qc_sp_notif_select on public.spotlight_notifications;
create policy qc_sp_notif_select on public.spotlight_notifications for select to authenticated using (recipient_id = auth.uid());
drop policy if exists qc_sp_notif_update on public.spotlight_notifications;
create policy qc_sp_notif_update on public.spotlight_notifications for update to authenticated
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

-- ============ 4. VIEWS (author details for all internal users, counts in one query) ============
create or replace view public.spotlight_authors as
select p.id, p.full_name, p.role::text as role, p.designation, p.avatar_path
from public.profiles p
where p.is_active and p.role::text in ('admin','hr','project_manager','team_lead','employee')
  and public.qc_is_internal();

create or replace view public.spotlight_feed as
select p.id, p.user_id, p.content, p.category, p.created_at, p.updated_at,
  a.full_name as author_name, a.role::text as author_role, a.designation as author_designation, a.avatar_path as author_avatar,
  (select count(*) from public.spotlight_likes l where l.post_id = p.id)::int as like_count,
  (select count(*) from public.spotlight_comments c where c.post_id = p.id)::int as comment_count,
  exists (select 1 from public.spotlight_likes l where l.post_id = p.id and l.user_id = auth.uid()) as liked_by_me,
  coalesce((select json_agg(i.image_path order by i.created_at) from public.spotlight_post_images i where i.post_id = p.id), '[]'::json) as images
from public.spotlight_posts p
join public.profiles a on a.id = p.user_id
where public.qc_is_internal();

grant select on public.spotlight_authors to authenticated;
grant select on public.spotlight_feed to authenticated;

-- ============ 5. PROFILE PHOTO ============
create or replace function public.spotlight_set_avatar(p_path text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.qc_is_internal() then raise exception 'Not allowed.'; end if;
  if p_path is not null and split_part(p_path, '/', 1) <> auth.uid()::text then raise exception 'Invalid photo path.'; end if;
  update public.profiles set avatar_path = p_path where id = auth.uid();
end $$;
grant execute on function public.spotlight_set_avatar(text) to authenticated;

-- ============ 6. PHOTO STORAGE (private bucket, signed URLs, internal users only) ============
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('spotlight', 'spotlight', false, 5242880, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set public = false, file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif'];

drop policy if exists qc_spotlight_insert on storage.objects;
create policy qc_spotlight_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'spotlight' and public.qc_is_internal() and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists qc_spotlight_select on storage.objects;
create policy qc_spotlight_select on storage.objects for select to authenticated
  using (bucket_id = 'spotlight' and public.qc_is_internal());
drop policy if exists qc_spotlight_delete on storage.objects;
create policy qc_spotlight_delete on storage.objects for delete to authenticated
  using (bucket_id = 'spotlight' and public.qc_is_internal()
         and ((storage.foldername(name))[1] = auth.uid()::text or public.qc_can_moderate()));
