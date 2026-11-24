-- =====================================================================================
-- QUADE TEAM CHAT  (database: groups, direct messages, files, reactions, read receipts, notifications)
-- Run once in the Supabase SQL Editor, AFTER all earlier migrations. Safe to re-run.
--
-- Security model
--  * Only active internal users (admin, hr, project_manager, team_lead, employee, qc) can use chat. Clients cannot.
--  * Membership decides access: nobody (not even Admin) reads a conversation they do not belong to.
--  * Conversations, members and moderation are changed ONLY through the chat_* functions below
--    (they re-check permissions on the server). Tables allow clients to read, send, edit, react.
--  * Files live in the PRIVATE bucket "chat-files"; access follows conversation membership.
--  * Audio/video calls come later as a separate script (20261121000000_team_chat_calls.sql).
-- =====================================================================================

-- ============ 1. HELPERS ============
create or replace function public.qc_chat_ok() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.qc_role() in ('admin','hr','project_manager','team_lead','employee','qc'), false)
$$;

-- ============ 2. TABLES ============
create table if not exists public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  conversation_type text not null check (conversation_type in ('direct','group')),
  group_type text check (group_type in ('custom','project')),
  name text,
  description text,
  avatar_path text,                                   -- path inside private bucket chat-files
  project_id uuid references public.projects(id) on delete set null,
  direct_key text unique,                             -- "<smaller uuid>:<larger uuid>" -> one direct chat per pair
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz,
  last_message_preview text,
  last_message_sender uuid references public.profiles(id) on delete set null,
  constraint chat_conv_shape check (
    (conversation_type = 'direct' and group_type is null and direct_key is not null and project_id is null)
    or (conversation_type = 'group' and group_type in ('custom','project') and direct_key is null)),
  constraint chat_conv_custom_no_project check (group_type is distinct from 'custom' or project_id is null)
);
create index if not exists qc_chat_conv_recent_idx on public.chat_conversations(last_message_at desc nulls last);
create index if not exists qc_chat_conv_project_idx on public.chat_conversations(project_id) where project_id is not null;

create table if not exists public.chat_conversation_members (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  member_role text not null default 'member' check (member_role in ('admin','member')),
  joined_at timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  is_muted boolean not null default false,
  is_pinned boolean not null default false,
  unique (conversation_id, user_id)
);
create index if not exists qc_chat_members_user_idx on public.chat_conversation_members(user_id);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  sender_id uuid references public.profiles(id) on delete set null default auth.uid(),
  content text not null default '' check (char_length(content) <= 8000),
  message_type text not null default 'text' check (message_type in ('text','image','file','system','call')),
  reply_to_message_id uuid references public.chat_messages(id) on delete set null,
  is_forwarded boolean not null default false,
  mentions uuid[] not null default '{}',
  is_edited boolean not null default false,
  edited_at timestamptz,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete set null,
  pinned_at timestamptz,
  pinned_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists qc_chat_msg_conv_idx on public.chat_messages(conversation_id, created_at desc);
create index if not exists qc_chat_msg_pinned_idx on public.chat_messages(conversation_id) where pinned_at is not null;

create table if not exists public.chat_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  mime_type text,
  file_size bigint,
  uploaded_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists qc_chat_att_conv_idx on public.chat_attachments(conversation_id, created_at desc);
create index if not exists qc_chat_att_msg_idx on public.chat_attachments(message_id);

create table if not exists public.chat_message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  reaction text not null check (char_length(reaction) between 1 and 16),
  created_at timestamptz not null default now(),
  unique (message_id, user_id, reaction)
);
create index if not exists qc_chat_react_msg_idx on public.chat_message_reactions(message_id);

create table if not exists public.chat_message_reads (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  unique (message_id, user_id)
);
create index if not exists qc_chat_reads_msg_idx on public.chat_message_reads(message_id);

create table if not exists public.chat_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  conversation_id uuid references public.chat_conversations(id) on delete cascade,
  type text not null check (type in ('message','mention','reply','incoming_call','missed_call','invite','removed')),
  title text not null,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists qc_chat_notif_idx on public.chat_notifications(recipient_id, is_read, created_at desc);
-- one unread "new messages" row per person per conversation (it is refreshed instead of duplicated)
create unique index if not exists qc_chat_notif_msg_uq on public.chat_notifications(recipient_id, conversation_id)
  where type = 'message' and is_read = false;

-- Presence is live only; this just remembers "last seen" and whether the person shares it.
create table if not exists public.chat_user_status (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  show_last_seen boolean not null default true
);

-- ============ 3. ACCESS HELPERS (security definer, no RLS recursion) ============
create or replace function public.qc_chat_is_member(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.qc_chat_ok() and exists (
    select 1 from public.chat_conversation_members where conversation_id = c and user_id = auth.uid())
$$;

create or replace function public.qc_chat_is_group_admin(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.qc_chat_ok() and exists (
    select 1 from public.chat_conversation_members m join public.chat_conversations v on v.id = m.conversation_id
    where m.conversation_id = c and m.user_id = auth.uid() and m.member_role = 'admin' and v.conversation_type = 'group')
$$;

create or replace function public.qc_chat_msg_member(m uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.qc_chat_ok() and exists (
    select 1 from public.chat_messages x join public.chat_conversation_members cm on cm.conversation_id = x.conversation_id
    where x.id = m and cm.user_id = auth.uid())
$$;

-- Is user u an active internal user?
create or replace function public.qc_chat_user_ok(u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = u and is_active
    and role::text in ('admin','hr','project_manager','team_lead','employee','qc'))
$$;

-- Who works on a project? Its Project Manager, the Team Leads and the members of every team assigned to it.
create or replace function public.qc_chat_project_participant(p uuid, u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.projects where id = p and project_manager_id = u)
      or exists (select 1 from public.project_team_assignments a join public.teams t on t.id = a.team_id
                 where a.project_id = p and t.team_lead_id = u)
      or exists (select 1 from public.project_team_assignments a join public.team_members m on m.team_id = a.team_id
                 where a.project_id = p and m.employee_id = u)
$$;

-- Project groups: Admin (any project), the Project Manager of the project, or a Team Lead of a team assigned to it.
create or replace function public.qc_chat_can_create_project_group(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p is not null and (
    public.qc_role() = 'admin'
    or (public.qc_role() = 'project_manager' and exists (select 1 from public.projects where id = p and project_manager_id = auth.uid()))
    or (public.qc_role() = 'team_lead' and exists (
          select 1 from public.project_team_assignments a join public.teams t on t.id = a.team_id
          where a.project_id = p and t.team_lead_id = auth.uid())))
$$;

-- Storage paths: "<conversation uuid>/<file>" (members only) or "avatars/<uid>/<file>" (group pictures, internal users).
create or replace function public.qc_chat_path_ok(path text, writing boolean) returns boolean
language plpgsql stable security definer set search_path = public, storage as $$
declare parts text[] := storage.foldername(path);
begin
  if not public.qc_chat_ok() then return false; end if;
  if parts[1] = 'avatars' then
    return not writing or parts[2] = auth.uid()::text;
  end if;
  if parts[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return public.qc_chat_is_member(parts[1]::uuid);
  end if;
  return false;
end $$;

-- ============ 4. INTERNAL NOTIFICATION HELPER ============
create or replace function public.chat_notify(p_to uuid, p_actor uuid, p_type text, p_title text, p_msg text,
  p_conv uuid default null, p_call uuid default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_to is null or p_to is not distinct from p_actor then return; end if;
  if p_type = 'message' then
    insert into public.chat_notifications(recipient_id, actor_id, conversation_id, type, title, message)
    values (p_to, p_actor, p_conv, 'message', p_title, p_msg)
    on conflict (recipient_id, conversation_id) where type = 'message' and is_read = false
    do update set message = excluded.message, title = excluded.title, actor_id = excluded.actor_id, created_at = now();
  else
    insert into public.chat_notifications(recipient_id, actor_id, conversation_id, type, title, message)
    values (p_to, p_actor, p_conv, p_type, p_title, p_msg);
  end if;
end $$;

create or replace function public.chat_name_of(u uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(full_name, ''), email, 'Someone') from public.profiles where id = u
$$;

-- Adds a grey system line ("Priya added Hari") to a conversation.
create or replace function public.chat_system_message(p_conv uuid, p_text text) returns void
language sql security definer set search_path = public as $$
  insert into public.chat_messages(conversation_id, sender_id, content, message_type) values (p_conv, auth.uid(), p_text, 'system')
$$;

-- ============ 5. TRIGGERS ============
-- direct conversations hold exactly two people
create or replace function public.chat_members_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.chat_conversations where id = new.conversation_id and conversation_type = 'direct')
     and (select count(*) from public.chat_conversation_members where conversation_id = new.conversation_id) >= 2 then
    raise exception 'A direct conversation has exactly two people.';
  end if;
  return new;
end $$;
drop trigger if exists chat_members_guard_trg on public.chat_conversation_members;
create trigger chat_members_guard_trg before insert on public.chat_conversation_members
for each row execute function public.chat_members_guard();

-- replies must stay inside the same conversation
create or replace function public.chat_message_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.reply_to_message_id is not null and not exists (
    select 1 from public.chat_messages where id = new.reply_to_message_id and conversation_id = new.conversation_id) then
    raise exception 'You can only reply to a message in the same conversation.';
  end if;
  return new;
end $$;
drop trigger if exists chat_message_before_insert_trg on public.chat_messages;
create trigger chat_message_before_insert_trg before insert on public.chat_messages
for each row execute function public.chat_message_before_insert();

-- editing: only the text changes; mark the message as edited
create or replace function public.chat_message_before_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if current_setting('qc.chat_rpc', true) = '1' then return new; end if;
  if new.content is distinct from old.content then
    new.is_edited := true;
    new.edited_at := now();
  end if;
  new.conversation_id := old.conversation_id; new.sender_id := old.sender_id; new.created_at := old.created_at;
  new.message_type := old.message_type; new.deleted_at := old.deleted_at; new.pinned_at := old.pinned_at;
  return new;
end $$;
drop trigger if exists chat_message_before_update_trg on public.chat_messages;
create trigger chat_message_before_update_trg before update on public.chat_messages
for each row execute function public.chat_message_before_update();

-- a new message: refresh the conversation row, mark my own side read, notify the others (never myself)
create or replace function public.chat_message_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  preview text; conv record; who text; reply_author uuid; r record; kind text; ttl text;
begin
  preview := case new.message_type
    when 'image' then 'Photo' when 'file' then 'File' when 'call' then 'Call'
    else left(regexp_replace(new.content, '\s+', ' ', 'g'), 120) end;
  update public.chat_conversations
     set last_message_at = new.created_at, last_message_preview = preview,
         last_message_sender = new.sender_id, updated_at = now()
   where id = new.conversation_id returning * into conv;

  if new.sender_id is not null then
    update public.chat_conversation_members set last_read_at = greatest(last_read_at, new.created_at)
     where conversation_id = new.conversation_id and user_id = new.sender_id;
  end if;
  if new.message_type in ('system','call') then return new; end if;

  who := public.chat_name_of(new.sender_id);
  if new.reply_to_message_id is not null then
    select sender_id into reply_author from public.chat_messages where id = new.reply_to_message_id;
  end if;
  ttl := case when conv.conversation_type = 'direct' then who else coalesce(conv.name, 'Group') end;

  for r in select user_id, is_muted from public.chat_conversation_members
            where conversation_id = new.conversation_id and user_id is distinct from new.sender_id loop
    if r.user_id = any(new.mentions) then
      perform public.chat_notify(r.user_id, new.sender_id, 'mention', ttl, who || ' mentioned you: ' || preview, new.conversation_id);
    elsif r.user_id = reply_author then
      perform public.chat_notify(r.user_id, new.sender_id, 'reply', ttl, who || ' replied to you: ' || preview, new.conversation_id);
    elsif not r.is_muted then
      perform public.chat_notify(r.user_id, new.sender_id, 'message', ttl,
        case when conv.conversation_type = 'direct' then preview else who || ': ' || preview end, new.conversation_id);
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists chat_message_after_insert_trg on public.chat_messages;
create trigger chat_message_after_insert_trg after insert on public.chat_messages
for each row execute function public.chat_message_after_insert();

-- ============ 6. ROW LEVEL SECURITY ============
alter table public.chat_conversations enable row level security;
alter table public.chat_conversation_members enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_attachments enable row level security;
alter table public.chat_message_reactions enable row level security;
alter table public.chat_message_reads enable row level security;
alter table public.chat_notifications enable row level security;
alter table public.chat_user_status enable row level security;

-- conversations / members: read-only for members (every change goes through the chat_* functions)
drop policy if exists qc_chat_conv_select on public.chat_conversations;
create policy qc_chat_conv_select on public.chat_conversations for select to authenticated
  using (public.qc_chat_is_member(id));
drop policy if exists qc_chat_members_select on public.chat_conversation_members;
create policy qc_chat_members_select on public.chat_conversation_members for select to authenticated
  using (public.qc_chat_is_member(conversation_id));

-- messages
drop policy if exists qc_chat_msg_select on public.chat_messages;
create policy qc_chat_msg_select on public.chat_messages for select to authenticated
  using (public.qc_chat_is_member(conversation_id));
drop policy if exists qc_chat_msg_insert on public.chat_messages;
create policy qc_chat_msg_insert on public.chat_messages for insert to authenticated
  with check (sender_id = auth.uid() and message_type in ('text','image','file') and public.qc_chat_is_member(conversation_id));
drop policy if exists qc_chat_msg_update on public.chat_messages;
create policy qc_chat_msg_update on public.chat_messages for update to authenticated
  using (sender_id = auth.uid() and deleted_at is null and message_type in ('text','image','file') and public.qc_chat_is_member(conversation_id))
  with check (sender_id = auth.uid());

-- attachments: members read; only the sender of the message adds them
drop policy if exists qc_chat_att_select on public.chat_attachments;
create policy qc_chat_att_select on public.chat_attachments for select to authenticated
  using (public.qc_chat_is_member(conversation_id)
         and exists (select 1 from public.chat_messages m where m.id = message_id and m.deleted_at is null));
drop policy if exists qc_chat_att_insert on public.chat_attachments;
create policy qc_chat_att_insert on public.chat_attachments for insert to authenticated
  with check (uploaded_by = auth.uid() and public.qc_chat_is_member(conversation_id)
              and exists (select 1 from public.chat_messages m
                          where m.id = message_id and m.conversation_id = chat_attachments.conversation_id and m.sender_id = auth.uid())
              and storage_path like conversation_id::text || '/%');

-- reactions
drop policy if exists qc_chat_react_select on public.chat_message_reactions;
create policy qc_chat_react_select on public.chat_message_reactions for select to authenticated
  using (public.qc_chat_msg_member(message_id));
drop policy if exists qc_chat_react_insert on public.chat_message_reactions;
create policy qc_chat_react_insert on public.chat_message_reactions for insert to authenticated
  with check (user_id = auth.uid() and public.qc_chat_msg_member(message_id));
drop policy if exists qc_chat_react_delete on public.chat_message_reactions;
create policy qc_chat_react_delete on public.chat_message_reactions for delete to authenticated
  using (user_id = auth.uid());

-- read receipts (written by chat_mark_read)
drop policy if exists qc_chat_reads_select on public.chat_message_reads;
create policy qc_chat_reads_select on public.chat_message_reads for select to authenticated
  using (public.qc_chat_msg_member(message_id));

-- notifications: mine only, may only flip is_read
drop policy if exists qc_chat_notif_select on public.chat_notifications;
create policy qc_chat_notif_select on public.chat_notifications for select to authenticated
  using (recipient_id = auth.uid() and public.qc_chat_ok());
drop policy if exists qc_chat_notif_update on public.chat_notifications;
create policy qc_chat_notif_update on public.chat_notifications for update to authenticated
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

-- last-seen rows are read through chat_directory() only (privacy setting respected)

-- table privileges: read for everyone, narrow writes
revoke all on public.chat_conversations, public.chat_conversation_members, public.chat_messages, public.chat_attachments,
  public.chat_message_reactions, public.chat_message_reads,
  public.chat_notifications, public.chat_user_status from anon, authenticated;
grant select on public.chat_conversations, public.chat_conversation_members,
  public.chat_message_reads, public.chat_notifications to authenticated;
grant select, insert on public.chat_messages, public.chat_attachments to authenticated;
grant update (content) on public.chat_messages to authenticated;
grant select, insert, delete on public.chat_message_reactions to authenticated;
grant update (is_read) on public.chat_notifications to authenticated;

-- ============ 7. FILE STORAGE (private bucket) ============
insert into storage.buckets (id, name, public, file_size_limit)
values ('chat-files', 'chat-files', false, 26214400)   -- 25 MB per file
on conflict (id) do update set public = false, file_size_limit = 26214400;

drop policy if exists qc_chat_files_select on storage.objects;
create policy qc_chat_files_select on storage.objects for select to authenticated
  using (bucket_id = 'chat-files' and public.qc_chat_path_ok(name, false));
drop policy if exists qc_chat_files_insert on storage.objects;
create policy qc_chat_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'chat-files' and public.qc_chat_path_ok(name, true));

-- ============ 8. DIRECTORY AND CONVERSATION LIST ============
-- Everyone in the company who can chat (names, roles, pictures). Last seen only if the person shares it.
create or replace function public.chat_directory()
returns table (id uuid, full_name text, role text, designation text, avatar_path text, last_seen_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, coalesce(nullif(p.full_name, ''), p.email), p.role::text, p.designation, p.avatar_path,
         case when p.id = auth.uid() or coalesce(s.show_last_seen, true) then s.last_seen_at end
  from public.profiles p left join public.chat_user_status s on s.user_id = p.id
  where public.qc_chat_ok() and p.is_active
    and p.role::text in ('admin','hr','project_manager','team_lead','employee','qc')
$$;

create or replace function public.chat_my_conversations()
returns table (id uuid, conversation_type text, group_type text, name text, description text, avatar_path text,
  project_id uuid, created_by uuid, last_message_at timestamptz, last_message_preview text, last_message_sender uuid,
  unread int, is_muted boolean, is_pinned boolean, my_role text, members jsonb)
language sql stable security definer set search_path = public as $$
  select c.id, c.conversation_type, c.group_type, c.name, c.description, c.avatar_path, c.project_id, c.created_by,
         c.last_message_at, c.last_message_preview, c.last_message_sender,
         (select count(*)::int from (
            select 1 from public.chat_messages m
            where m.conversation_id = c.id and m.created_at > me.last_read_at and m.deleted_at is null
              and m.message_type in ('text','image','file') and m.sender_id is distinct from auth.uid() limit 100) u),
         me.is_muted, me.is_pinned, me.member_role,
         (select coalesce(jsonb_agg(jsonb_build_object('user_id', x.user_id, 'role', x.member_role)), '[]'::jsonb)
            from public.chat_conversation_members x where x.conversation_id = c.id)
  from public.chat_conversations c
  join public.chat_conversation_members me on me.conversation_id = c.id and me.user_id = auth.uid()
  where public.qc_chat_ok()
  order by me.is_pinned desc, coalesce(c.last_message_at, c.created_at) desc
$$;

-- ============ 9. DIRECT MESSAGES AND GROUPS ============
create or replace function public.chat_open_direct(p_other uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); k text; cid uuid;
begin
  if not public.qc_chat_ok() then raise exception 'Team Chat is not available for your account.'; end if;
  if p_other is null or p_other = me then raise exception 'Choose someone else to message.'; end if;
  if not public.qc_chat_user_ok(p_other) then raise exception 'That person cannot be messaged.'; end if;
  k := least(me::text, p_other::text) || ':' || greatest(me::text, p_other::text);
  select id into cid from public.chat_conversations where direct_key = k;
  if cid is null then
    insert into public.chat_conversations(conversation_type, direct_key, created_by) values ('direct', k, me)
      on conflict (direct_key) do nothing returning id into cid;
    if cid is null then
      select id into cid from public.chat_conversations where direct_key = k;
    else
      insert into public.chat_conversation_members(conversation_id, user_id) values (cid, me), (cid, p_other);
    end if;
  end if;
  return cid;
end $$;

create or replace function public.chat_create_group(p_name text, p_description text default null, p_avatar_path text default null,
  p_member_ids uuid[] default '{}', p_group_type text default 'custom', p_project_id uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); cid uuid; u uuid; nm text := nullif(trim(p_name), ''); pname text;
begin
  if not public.qc_chat_ok() then raise exception 'Team Chat is not available for your account.'; end if;
  if nm is null then raise exception 'Enter a group name.'; end if;
  if p_group_type not in ('custom','project') then raise exception 'Invalid group type.'; end if;
  if p_group_type = 'project' then
    if p_project_id is null then raise exception 'Select a project.'; end if;
    if not public.qc_chat_can_create_project_group(p_project_id) then
      raise exception 'You can create project groups only for projects you manage or lead.'; end if;
  elsif p_project_id is not null then
    raise exception 'Custom groups cannot be linked to a project.';
  end if;
  if p_avatar_path is not null and p_avatar_path not like 'avatars/' || me::text || '/%' then
    raise exception 'Invalid group picture.'; end if;

  for u in select distinct x from unnest(coalesce(p_member_ids, '{}')) x where x <> me loop
    if not public.qc_chat_user_ok(u) then raise exception 'One of the selected people cannot be added.'; end if;
    if p_group_type = 'project' and not public.qc_chat_project_participant(p_project_id, u) then
      raise exception 'Only people working on this project can be added to its group.'; end if;
  end loop;

  insert into public.chat_conversations(conversation_type, group_type, name, description, avatar_path, project_id, created_by)
  values ('group', p_group_type, nm, nullif(trim(p_description), ''), p_avatar_path, p_project_id, me) returning id into cid;
  insert into public.chat_conversation_members(conversation_id, user_id, member_role) values (cid, me, 'admin');
  for u in select distinct x from unnest(coalesce(p_member_ids, '{}')) x where x <> me loop
    insert into public.chat_conversation_members(conversation_id, user_id) values (cid, u);
    perform public.chat_notify(u, me, 'invite', nm, public.chat_name_of(me) || ' added you to the group "' || nm || '".', cid);
  end loop;
  perform public.chat_system_message(cid, public.chat_name_of(me) || ' created this group');
  return cid;
end $$;

create or replace function public.chat_add_members(p_conv uuid, p_user_ids uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); c record; u uuid; nm text;
begin
  if not public.qc_chat_is_group_admin(p_conv) then raise exception 'Only group administrators can add members.'; end if;
  select * into c from public.chat_conversations where id = p_conv;
  for u in select distinct x from unnest(coalesce(p_user_ids, '{}')) x loop
    if exists (select 1 from public.chat_conversation_members where conversation_id = p_conv and user_id = u) then continue; end if;
    if not public.qc_chat_user_ok(u) then raise exception 'One of the selected people cannot be added.'; end if;
    if c.group_type = 'project' and not public.qc_chat_project_participant(c.project_id, u) then
      raise exception 'Only people working on this project can be added to its group.'; end if;
    insert into public.chat_conversation_members(conversation_id, user_id) values (p_conv, u);
    nm := public.chat_name_of(u);
    perform public.chat_notify(u, me, 'invite', c.name, public.chat_name_of(me) || ' added you to the group "' || c.name || '".', p_conv);
    perform public.chat_system_message(p_conv, public.chat_name_of(me) || ' added ' || nm);
  end loop;
end $$;

create or replace function public.chat_remove_member(p_conv uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); c record;
begin
  if not public.qc_chat_is_group_admin(p_conv) then raise exception 'Only group administrators can remove members.'; end if;
  if p_user = me then raise exception 'Use "Leave group" to remove yourself.'; end if;
  select * into c from public.chat_conversations where id = p_conv;
  delete from public.chat_conversation_members where conversation_id = p_conv and user_id = p_user;
  if found then
    perform public.chat_notify(p_user, me, 'removed', c.name, 'You were removed from the group "' || c.name || '".', null);
    perform public.chat_system_message(p_conv, public.chat_name_of(me) || ' removed ' || public.chat_name_of(p_user));
  end if;
end $$;

create or replace function public.chat_set_member_role(p_conv uuid, p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_role not in ('admin','member') then raise exception 'Invalid role.'; end if;
  if not public.qc_chat_is_group_admin(p_conv) then raise exception 'Only group administrators can change roles.'; end if;
  if p_role = 'member' and (select count(*) from public.chat_conversation_members
        where conversation_id = p_conv and member_role = 'admin' and user_id <> p_user) = 0 then
    raise exception 'A group needs at least one administrator.'; end if;
  update public.chat_conversation_members set member_role = p_role where conversation_id = p_conv and user_id = p_user;
end $$;

-- p_patch may contain: name, description, avatar_path (null removes the picture)
create or replace function public.chat_update_group(p_conv uuid, p_patch jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); nm text;
begin
  if not public.qc_chat_is_group_admin(p_conv) then raise exception 'Only group administrators can edit the group.'; end if;
  if p_patch ? 'name' then
    nm := nullif(trim(p_patch->>'name'), '');
    if nm is null then raise exception 'Enter a group name.'; end if;
    update public.chat_conversations set name = nm, updated_at = now() where id = p_conv;
  end if;
  if p_patch ? 'description' then
    update public.chat_conversations set description = nullif(trim(p_patch->>'description'), ''), updated_at = now() where id = p_conv;
  end if;
  if p_patch ? 'avatar_path' then
    if p_patch->>'avatar_path' is not null and (p_patch->>'avatar_path') not like 'avatars/' || me::text || '/%' then
      raise exception 'Invalid group picture.'; end if;
    update public.chat_conversations set avatar_path = p_patch->>'avatar_path', updated_at = now() where id = p_conv;
  end if;
end $$;

create or replace function public.chat_leave_group(p_conv uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if not exists (select 1 from public.chat_conversations where id = p_conv and conversation_type = 'group') then
    raise exception 'Only groups can be left.'; end if;
  if not public.qc_chat_is_member(p_conv) then raise exception 'You are not in this group.'; end if;
  perform public.chat_system_message(p_conv, public.chat_name_of(me) || ' left the group');
  delete from public.chat_conversation_members where conversation_id = p_conv and user_id = me;
  if not exists (select 1 from public.chat_conversation_members where conversation_id = p_conv) then
    delete from public.chat_conversations where id = p_conv;
  elsif not exists (select 1 from public.chat_conversation_members where conversation_id = p_conv and member_role = 'admin') then
    update public.chat_conversation_members set member_role = 'admin'
     where id = (select id from public.chat_conversation_members where conversation_id = p_conv order by joined_at limit 1);
  end if;
end $$;

-- Ownership rule: the creator deletes the group; if the creator already left, any group administrator may.
-- Only the chat is removed - never the project, its teams or assignments.
create or replace function public.chat_delete_group(p_conv uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c record; me uuid := auth.uid();
begin
  select * into c from public.chat_conversations where id = p_conv and conversation_type = 'group';
  if c.id is null or not public.qc_chat_is_member(p_conv) then raise exception 'Group not found.'; end if;
  if not (c.created_by = me or (public.qc_chat_is_group_admin(p_conv) and not exists (
      select 1 from public.chat_conversation_members where conversation_id = p_conv and user_id = c.created_by))) then
    raise exception 'Only the group creator can delete this group.'; end if;
  delete from public.chat_conversations where id = p_conv;
end $$;

create or replace function public.chat_set_pref(p_conv uuid, p_muted boolean default null, p_pinned boolean default null) returns void
language sql security definer set search_path = public as $$
  update public.chat_conversation_members
     set is_muted = coalesce(p_muted, is_muted), is_pinned = coalesce(p_pinned, is_pinned)
   where conversation_id = p_conv and user_id = auth.uid() and public.qc_chat_ok()
$$;

-- ============ 10. MESSAGE ACTIONS ============
-- Delete: the sender; a group administrator; or an Admin/HR member of that group (moderation). Never other people's DMs.
create or replace function public.chat_delete_message(p_msg uuid) returns void
language plpgsql security definer set search_path = public as $$
declare m record; c record; me uuid := auth.uid(); allowed boolean := false;
begin
  select * into m from public.chat_messages where id = p_msg and deleted_at is null;
  if m.id is null or not public.qc_chat_is_member(m.conversation_id) then raise exception 'Message not found.'; end if;
  select * into c from public.chat_conversations where id = m.conversation_id;
  if m.message_type in ('system','call') then raise exception 'This message cannot be deleted.'; end if;
  allowed := m.sender_id = me
    or (c.conversation_type = 'group' and (public.qc_chat_is_group_admin(m.conversation_id) or public.qc_role() in ('admin','hr')));
  if not allowed then raise exception 'You can delete only your own messages.'; end if;
  perform set_config('qc.chat_rpc', '1', true);
  update public.chat_messages set deleted_at = now(), deleted_by = me, content = '', pinned_at = null, pinned_by = null where id = p_msg;
  update public.chat_conversations set last_message_preview = 'Message deleted' where id = m.conversation_id
     and last_message_at = m.created_at;
end $$;

create or replace function public.chat_pin_message(p_msg uuid, p_pin boolean) returns void
language plpgsql security definer set search_path = public as $$
declare m record; c record;
begin
  select * into m from public.chat_messages where id = p_msg and deleted_at is null;
  if m.id is null or not public.qc_chat_is_member(m.conversation_id) then raise exception 'Message not found.'; end if;
  select * into c from public.chat_conversations where id = m.conversation_id;
  if c.conversation_type = 'group' and not public.qc_chat_is_group_admin(m.conversation_id) then
    raise exception 'Only group administrators can pin messages.'; end if;
  perform set_config('qc.chat_rpc', '1', true);
  update public.chat_messages
     set pinned_at = case when p_pin then now() end, pinned_by = case when p_pin then auth.uid() end where id = p_msg;
end $$;

-- Opening a conversation: move my read marker, record read receipts, clear its notifications.
create or replace function public.chat_mark_read(p_conv uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); prev timestamptz;
begin
  if not public.qc_chat_is_member(p_conv) then return; end if;
  select last_read_at into prev from public.chat_conversation_members where conversation_id = p_conv and user_id = me;
  update public.chat_conversation_members set last_read_at = now() where conversation_id = p_conv and user_id = me;
  insert into public.chat_message_reads(message_id, user_id)
    select m.id, me from public.chat_messages m
    where m.conversation_id = p_conv and m.created_at > prev - interval '1 second' and m.sender_id is distinct from me
      and m.message_type in ('text','image','file') and m.deleted_at is null
    order by m.created_at desc limit 500
  on conflict (message_id, user_id) do nothing;
  update public.chat_notifications set is_read = true
   where recipient_id = me and conversation_id = p_conv and not is_read and type in ('message','mention','reply');
end $$;

create or replace function public.chat_touch() returns void
language sql security definer set search_path = public as $$
  insert into public.chat_user_status(user_id, last_seen_at) select auth.uid(), now() where public.qc_chat_ok()
  on conflict (user_id) do update set last_seen_at = now()
$$;

create or replace function public.chat_set_last_seen_visible(p_visible boolean) returns void
language sql security definer set search_path = public as $$
  insert into public.chat_user_status(user_id, show_last_seen) select auth.uid(), p_visible where public.qc_chat_ok()
  on conflict (user_id) do update set show_last_seen = p_visible
$$;

create or replace function public.chat_my_status() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select show_last_seen from public.chat_user_status where user_id = auth.uid()), true)
$$;

-- Project groups: which projects may I create a group for, and who works on a project (only answered for authorised callers)
create or replace function public.chat_project_options() returns table (id uuid, name text)
language sql stable security definer set search_path = public as $$
  select p.id, p.name from public.projects p where public.qc_chat_can_create_project_group(p.id) order by p.name
$$;

create or replace function public.chat_project_participants(p uuid) returns uuid[]
language sql stable security definer set search_path = public as $$
  select case when public.qc_chat_can_create_project_group(p) then coalesce((
    select array_agg(distinct u) from (
      select project_manager_id as u from public.projects where id = p
      union select t.team_lead_id from public.project_team_assignments a join public.teams t on t.id = a.team_id where a.project_id = p
      union select m.employee_id from public.project_team_assignments a join public.team_members m on m.team_id = a.team_id where a.project_id = p
    ) x where u is not null and public.qc_chat_user_ok(u)), '{}') else '{}'::uuid[] end
$$;

-- ============ 12. FUNCTION PRIVILEGES ============
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and (p.proname like 'chat\_%' or p.proname like 'qc\_chat\_%') loop
    execute format('revoke all on function %s from public, anon', f.sig);
    if f.proname in ('chat_notify','chat_system_message','chat_name_of','chat_members_guard',
                     'chat_message_before_insert','chat_message_before_update','chat_message_after_insert') then
      execute format('revoke all on function %s from authenticated', f.sig);
    else
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
  end loop;
end $$;

-- ============ 13. REALTIME ============
do $$
declare t text;
begin
  foreach t in array array['chat_conversations','chat_conversation_members','chat_messages','chat_attachments',
    'chat_message_reactions','chat_message_reads','chat_notifications'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
              when undefined_object then null;
    end;
  end loop;
end $$;

-- Typing indicators and online presence run on PRIVATE realtime channels: chat:presence and chat:typing:<conversation>.
create or replace function public.qc_chat_topic_ok(topic text) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.qc_chat_ok() then return false; end if;
  if topic = 'chat:presence' then return true; end if;
  if topic ~ '^chat:typing:[0-9a-fA-F-]{36}$' then return public.qc_chat_is_member(substr(topic, 13)::uuid); end if;
  return false;
end $$;
revoke all on function public.qc_chat_topic_ok(text) from public, anon;
grant execute on function public.qc_chat_topic_ok(text) to authenticated;

do $$
begin
  if to_regclass('realtime.messages') is not null then
    execute 'drop policy if exists qc_chat_rt_select on realtime.messages';
    execute 'create policy qc_chat_rt_select on realtime.messages for select to authenticated using (public.qc_chat_topic_ok(realtime.topic()))';
    execute 'drop policy if exists qc_chat_rt_insert on realtime.messages';
    execute 'create policy qc_chat_rt_insert on realtime.messages for insert to authenticated with check (public.qc_chat_topic_ok(realtime.topic()))';
  end if;
exception when others then
  raise notice 'Realtime channel policies were not created (%). Typing/online status will fall back to off.', sqlerrm;
end $$;

