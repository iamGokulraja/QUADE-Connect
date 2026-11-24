-- FIX: "column call_id of relation chat_notifications does not exist" when creating a group / adding people.
-- Run once in the Supabase SQL Editor. Safe to re-run.
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
revoke all on function public.chat_notify(uuid, uuid, text, text, text, uuid, uuid) from public, anon, authenticated;
