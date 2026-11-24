-- =====================================================================================
-- QUADE TEAM CHAT - AUDIO CALLS (LiveKit)
-- Run once in the Supabase SQL Editor, AFTER the Team Chat scripts. Safe to re-run.
-- Adds call tables, call functions (start / answer / leave / end), call history lines in the chat and call
-- notifications. Audio only for now: starting a video call is refused by the database.
-- Voice itself never touches the database - it flows through LiveKit.
-- =====================================================================================

create table if not exists public.chat_calls (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  initiated_by uuid references public.profiles(id) on delete set null default auth.uid(),
  livekit_room_name text not null unique,
  call_type text not null check (call_type in ('audio','video')),
  call_status text not null default 'ringing' check (call_status in ('ringing','active','ended','missed','declined','cancelled')),
  started_at timestamptz,
  ended_at timestamptz,
  ended_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists qc_chat_calls_conv_idx on public.chat_calls(conversation_id, created_at desc);
create index if not exists qc_chat_calls_open_idx on public.chat_calls(call_status) where call_status in ('ringing','active');

create table if not exists public.chat_call_participants (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references public.chat_calls(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz,
  left_at timestamptz,
  last_ping timestamptz,
  participant_status text not null default 'ringing' check (participant_status in ('ringing','joined','declined','missed','left')),
  unique (call_id, user_id)
);
create index if not exists qc_chat_callp_user_idx on public.chat_call_participants(user_id, participant_status);


alter table public.chat_notifications add column if not exists call_id uuid references public.chat_calls(id) on delete cascade;

-- Notifications can now point at a call (this replaces the version from the Team Chat fix script)
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
    insert into public.chat_notifications(recipient_id, actor_id, conversation_id, call_id, type, title, message)
    values (p_to, p_actor, p_conv, p_call, p_type, p_title, p_msg);
  end if;
end $$;
revoke all on function public.chat_notify(uuid, uuid, text, text, text, uuid, uuid) from public, anon, authenticated;

create or replace function public.qc_chat_call_member(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.qc_chat_ok() and exists (
    select 1 from public.chat_calls k join public.chat_conversation_members cm on cm.conversation_id = k.conversation_id
    where k.id = c and cm.user_id = auth.uid())
$$;


alter table public.chat_calls enable row level security;
alter table public.chat_call_participants enable row level security;

-- calls (written by the call functions)
drop policy if exists qc_chat_calls_select on public.chat_calls;
create policy qc_chat_calls_select on public.chat_calls for select to authenticated
  using (public.qc_chat_is_member(conversation_id));
drop policy if exists qc_chat_callp_select on public.chat_call_participants;
create policy qc_chat_callp_select on public.chat_call_participants for select to authenticated
  using (public.qc_chat_call_member(call_id));


revoke all on public.chat_calls, public.chat_call_participants from anon, authenticated;
grant select on public.chat_calls, public.chat_call_participants to authenticated;

-- ============ 11. CALLS (LiveKit rooms; media never touches the database) ============
-- internal: close a call, fix participant rows, notify missed calls, leave a log line in the chat
create or replace function public.chat_finish_call(p_call uuid, p_status text, p_by uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare k record; r record; secs int; typ text; ttl text;
begin
  select * into k from public.chat_calls where id = p_call and call_status in ('ringing','active') for update;
  if k.id is null then return; end if;
  update public.chat_calls set call_status = p_status, ended_at = now(), ended_by = p_by where id = p_call;
  update public.chat_call_participants set participant_status = 'left', left_at = now()
   where call_id = p_call and participant_status = 'joined';
  if p_status in ('missed','cancelled') then
    select coalesce(nullif(name, ''), 'Direct call') into ttl from public.chat_conversations where id = k.conversation_id;
    for r in select user_id from public.chat_call_participants where call_id = p_call and participant_status = 'ringing' loop
      perform public.chat_notify(r.user_id, k.initiated_by, 'missed_call', public.chat_name_of(k.initiated_by),
        'Missed ' || k.call_type || ' call', k.conversation_id, p_call);
    end loop;
  end if;
  update public.chat_call_participants set participant_status = 'missed' where call_id = p_call and participant_status = 'ringing';
  update public.chat_notifications set is_read = true where call_id = p_call and type = 'incoming_call';
  secs := case when k.started_at is not null then greatest(0, extract(epoch from now() - k.started_at)::int) else 0 end;
  insert into public.chat_messages(conversation_id, sender_id, content, message_type)
  values (k.conversation_id, k.initiated_by, k.call_type || '|' || p_status || '|' || secs, 'call');
end $$;

-- Housekeeping: unanswered calls become "missed" after 45 s; people whose browser vanished are dropped after 90 s.
create or replace function public.chat_expire_calls() returns void
language plpgsql security definer set search_path = public as $$
declare k record;
begin
  update public.chat_call_participants p set participant_status = 'left', left_at = now()
   from public.chat_calls c
   where c.id = p.call_id and c.call_status in ('ringing','active') and p.participant_status = 'joined'
     and coalesce(p.last_ping, p.joined_at) < now() - interval '90 seconds';
  for k in select id, started_at from public.chat_calls where call_status in ('ringing','active') loop
    if not exists (select 1 from public.chat_call_participants where call_id = k.id and participant_status = 'joined') then
      perform public.chat_finish_call(k.id, case when k.started_at is not null then 'ended' else 'cancelled' end);
    end if;
  end loop;
  for k in select id from public.chat_calls where call_status = 'ringing' and created_at < now() - interval '45 seconds' loop
    perform public.chat_finish_call(k.id, 'missed');
  end loop;
end $$;

create or replace function public.chat_start_call(p_conv uuid, p_type text) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); cid uuid; r record; ttl text; kind text;
begin
  if not public.qc_chat_is_member(p_conv) then raise exception 'You are not a member of this conversation.'; end if;
  if p_type <> 'audio' then raise exception 'Only audio calls are available right now.'; end if;
  perform public.chat_expire_calls();
  select id into cid from public.chat_calls where conversation_id = p_conv and call_status in ('ringing','active')
   order by created_at desc limit 1;
  if cid is not null then            -- a call is already running here: join it
    perform public.chat_respond_call(cid, true);
    return cid;
  end if;
  insert into public.chat_calls(conversation_id, initiated_by, livekit_room_name, call_type)
  values (p_conv, me, 'qc-' || replace(gen_random_uuid()::text, '-', ''), p_type) returning id into cid;
  insert into public.chat_call_participants(call_id, user_id, participant_status, joined_at, last_ping)
  select cid, user_id, case when user_id = me then 'joined' else 'ringing' end,
         case when user_id = me then now() end, case when user_id = me then now() end
    from public.chat_conversation_members where conversation_id = p_conv;
  select coalesce(nullif(name, ''), public.chat_name_of(me)) into ttl from public.chat_conversations where id = p_conv;
  for r in select user_id from public.chat_conversation_members where conversation_id = p_conv and user_id <> me loop
    perform public.chat_notify(r.user_id, me, 'incoming_call', public.chat_name_of(me),
      'Incoming ' || p_type || ' call' || case when (select conversation_type from public.chat_conversations where id = p_conv) = 'group'
        then ' in ' || ttl else '' end, p_conv, cid);
  end loop;
  return cid;
end $$;

create or replace function public.chat_respond_call(p_call uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); k record;
begin
  select * into k from public.chat_calls where id = p_call for update;
  if k.id is null or not public.qc_chat_is_member(k.conversation_id) then raise exception 'Call not found.'; end if;
  if k.call_status not in ('ringing','active') then raise exception 'This call has already ended.'; end if;
  if p_accept then
    insert into public.chat_call_participants(call_id, user_id, participant_status, joined_at, last_ping)
    values (p_call, me, 'joined', now(), now())
    on conflict (call_id, user_id) do update
      set participant_status = 'joined', joined_at = coalesce(public.chat_call_participants.joined_at, now()), left_at = null, last_ping = now();
    update public.chat_calls set call_status = 'active', started_at = coalesce(started_at, now())
     where id = p_call and call_status = 'ringing' and initiated_by is distinct from me;
    update public.chat_notifications set is_read = true where call_id = p_call and recipient_id = me;
  else
    update public.chat_call_participants set participant_status = 'declined', left_at = now()
     where call_id = p_call and user_id = me and participant_status = 'ringing';
    update public.chat_notifications set is_read = true where call_id = p_call and recipient_id = me;
    if k.call_status = 'ringing'
       and not exists (select 1 from public.chat_call_participants where call_id = p_call and participant_status = 'ringing') then
      perform public.chat_finish_call(p_call, 'declined');
    end if;
  end if;
end $$;

create or replace function public.chat_leave_call(p_call uuid) returns void
language plpgsql security definer set search_path = public as $$
declare k record;
begin
  select * into k from public.chat_calls where id = p_call;
  if k.id is null or not public.qc_chat_call_member(p_call) then return; end if;
  update public.chat_call_participants set participant_status = 'left', left_at = now()
   where call_id = p_call and user_id = auth.uid() and participant_status = 'joined';
  if not exists (select 1 from public.chat_call_participants where call_id = p_call and participant_status = 'joined') then
    perform public.chat_finish_call(p_call, case when k.started_at is not null then 'ended' else 'cancelled' end, auth.uid());
  end if;
end $$;

-- End for everybody: the caller, a group administrator, or either person in a direct call.
create or replace function public.chat_end_call(p_call uuid) returns void
language plpgsql security definer set search_path = public as $$
declare k record; c record;
begin
  select * into k from public.chat_calls where id = p_call;
  if k.id is null or not public.qc_chat_call_member(p_call) then raise exception 'Call not found.'; end if;
  select * into c from public.chat_conversations where id = k.conversation_id;
  if not (c.conversation_type = 'direct' or k.initiated_by = auth.uid() or public.qc_chat_is_group_admin(k.conversation_id)) then
    raise exception 'Only the caller or a group administrator can end the call for everyone.'; end if;
  perform public.chat_finish_call(p_call, case when k.started_at is not null then 'ended' else 'cancelled' end, auth.uid());
end $$;

create or replace function public.chat_call_ping(p_call uuid) returns text
language plpgsql security definer set search_path = public as $$
declare st text;
begin
  update public.chat_call_participants set last_ping = now() where call_id = p_call and user_id = auth.uid() and participant_status = 'joined';
  perform public.chat_expire_calls();
  select call_status into st from public.chat_calls where id = p_call and public.qc_chat_call_member(p_call);
  return st;
end $$;

-- Incoming-call popup details
create or replace function public.chat_call_info(p_call uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', k.id, 'conversation_id', k.conversation_id, 'call_type', k.call_type,
    'call_status', k.call_status, 'initiated_by', k.initiated_by, 'caller_name', public.chat_name_of(k.initiated_by),
    'caller_avatar', (select avatar_path from public.profiles where id = k.initiated_by),
    'conversation_name', c.name, 'conversation_type', c.conversation_type, 'created_at', k.created_at)
  from public.chat_calls k join public.chat_conversations c on c.id = k.conversation_id
  where k.id = p_call and public.qc_chat_call_member(p_call)
$$;

-- LiveKit token gate (called by the livekit-token Edge Function with the USER's own session).
-- Only someone who has joined the call may get a token, and only for that call's room.
create or replace function public.chat_call_join_info(p_call uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare k record;
begin
  select * into k from public.chat_calls where id = p_call;
  if k.id is null or not public.qc_chat_call_member(p_call) then raise exception 'You cannot join this call.'; end if;
  if k.call_status not in ('ringing','active') then raise exception 'This call has ended.'; end if;
  if not exists (select 1 from public.chat_call_participants where call_id = p_call and user_id = auth.uid()
                 and participant_status = 'joined') then
    raise exception 'Accept the call before joining.'; end if;
  return jsonb_build_object('room', k.livekit_room_name, 'call_type', k.call_type, 'identity', auth.uid()::text,
                            'name', public.chat_name_of(auth.uid()));
end $$;


do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('chat_start_call','chat_respond_call','chat_leave_call','chat_end_call','chat_call_ping','chat_call_info','chat_call_join_info','chat_expire_calls','chat_finish_call','qc_chat_call_member') loop
    execute format('revoke all on function %s from public, anon', f.sig);
    if f.proname = 'chat_finish_call' then execute format('revoke all on function %s from authenticated', f.sig);
    else execute format('grant execute on function %s to authenticated', f.sig); end if;
  end loop;
end $$;

do $$
declare t text;
begin
  foreach t in array array['chat_calls','chat_call_participants'] loop
    begin execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null; when undefined_object then null; end;
  end loop;
end $$;

-- ============ 14. OPTIONAL: expire unanswered calls every minute (needs the pg_cron extension, already used for alerts) ============
do $$
begin
  if to_regnamespace('cron') is not null then
    perform cron.unschedule('qc-chat-expire-calls') where exists (select 1 from cron.job where jobname = 'qc-chat-expire-calls');
    perform cron.schedule('qc-chat-expire-calls', '* * * * *', 'select public.chat_expire_calls()');
  end if;
exception when others then
  raise notice 'pg_cron schedule skipped (%): calls still expire whenever someone uses chat.', sqlerrm;
end $$;
