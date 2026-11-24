-- QUADE Connect · Team Chat VIDEO calls
-- Run once in Supabase -> SQL Editor (after the audio-call migration). Safe to run again.
-- The tables, ring/accept/decline/leave/end logic, call history and the LiveKit token gate already
-- understand video (chat_calls.call_type is 'audio' | 'video'). The only thing that blocked video was
-- the check inside chat_start_call, so this replaces that single function with the check widened.

create or replace function public.chat_start_call(p_conv uuid, p_type text) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); cid uuid; r record; ttl text;
begin
  if not public.qc_chat_is_member(p_conv) then raise exception 'You are not a member of this conversation.'; end if;
  if p_type not in ('audio', 'video') then raise exception 'Call type must be audio or video.'; end if;
  perform public.chat_expire_calls();
  select id into cid from public.chat_calls where conversation_id = p_conv and call_status in ('ringing','active')
   order by created_at desc limit 1;
  if cid is not null then            -- a call is already running here: join it (as whatever type it is)
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

revoke all on function public.chat_start_call(uuid, text) from public, anon;
grant execute on function public.chat_start_call(uuid, text) to authenticated;
