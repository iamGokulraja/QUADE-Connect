import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronDown, PanelRight, Phone, Search, Video, X } from "lucide-react";

import { supabase } from "../../lib/supabaseClient";
import { dayLabel, convTitle, lastSeenLabel, likeEscape, otherMember } from "../../lib/chat";
import toast from "../../lib/toast";
import {
  editMessage, forwardMessage, mergeMessages, rpc, sendChatMessage, toggleReaction,
  useConversationRealtime, useMessages, useTyping,
} from "../../hooks/chat";
import { useOpenCall } from "../../hooks/calls";
import { useCall } from "../call/GlobalCallProvider";
import ChatAvatar from "./ChatAvatar";
import Composer from "./Composer";
import MessageBubble from "./MessageBubble";
import { ForwardModal } from "./Modals";
import { Loading } from "../ui";

export default function ConversationView({ conv, me, map, online, conversations, showDetails, onToggleDetails, onBack }) {
  const client = useQueryClient();
  const isGroup = conv.conversation_type === "group";
  const other = !isGroup ? map[otherMember(conv, me.id)] : null;
  const title = convTitle(conv, me.id, map);
  const iAmAdmin = isGroup && conv.my_role === "admin";

  const messagesQ = useMessages(conv.id);
  const [pending, setPending] = useState([]);              // messages still being sent (optimistic)
  const [replyTo, setReplyTo] = useState(null);
  const [editing, setEditing] = useState(null);
  const [forwarding, setForwarding] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const { typing, notify } = useTyping(conv.id, me.id);
  useConversationRealtime(conv.id);

  const messages = useMemo(() => mergeMessages(messagesQ.data?.pages, pending.filter((p) => p.conversation_id === conv.id)), [messagesQ.data, pending, conv.id]);
  const byId = useMemo(() => Object.fromEntries(messages.map((m) => [m.id, m])), [messages]);
  const memberIds = conv.members.map((m) => m.user_id);
  const people = memberIds.filter((id) => id !== me.id).map((id) => map[id]).filter(Boolean);
  const names = people.map((p) => p.full_name);

  // reset per-conversation state
  useEffect(() => { setReplyTo(null); setEditing(null); setSearchOpen(false); setQ(""); setResults([]); }, [conv.id]);

  /* ---- scrolling: stay at the bottom for new messages, keep position when older ones load ---- */
  const scroller = useRef(null);
  const stick = useRef(true);
  const prevHeight = useRef(0);
  const lastId = messages[messages.length - 1]?.id;
  useLayoutEffect(() => { stick.current = true; }, [conv.id]);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (prevHeight.current && !stick.current) el.scrollTop += el.scrollHeight - prevHeight.current;  // older page was prepended
    else if (stick.current) el.scrollTop = el.scrollHeight;
    prevHeight.current = 0;
  }, [lastId, messages.length, conv.id]);
  const onScroll = (e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120; };
  const loadOlder = () => { prevHeight.current = scroller.current?.scrollHeight || 0; stick.current = false; messagesQ.fetchNextPage(); };

  /* ---- read marker ---- */
  const hasUnread = conv.unread > 0;
  const markRead = useCallback(() => {
    if (document.visibilityState !== "visible") return;
    rpc("chat_mark_read", { p_conv: conv.id }).then(() => client.invalidateQueries({ queryKey: ["chat-conversations"] })).catch(() => {});
  }, [conv.id, client]);
  useEffect(() => { markRead(); }, [markRead, hasUnread]);
  useEffect(() => {
    document.addEventListener("visibilitychange", markRead);
    return () => document.removeEventListener("visibilitychange", markRead);
  }, [markRead]);

  /* ---- sending ---- */
  const attempt = useCallback(async (draft) => {
    const progress = (i, f) => setPending((l) => l.map((m) => (m.id === draft.id ? { ...m, _progress: Object.assign([...(m._progress || [])], { [i]: f }) } : m)));
    setPending((l) => l.map((m) => (m.id === draft.id ? { ...m, _failed: false, _pending: true } : m)));
    try {
      await sendChatMessage({ id: draft.id, conversationId: draft.conversation_id, content: draft.content, files: draft._files, replyTo: draft.reply_to_message_id, mentions: draft.mentions, onProgress: progress });
      await client.invalidateQueries({ queryKey: ["chat-messages", draft.conversation_id] });   // server copy replaces the optimistic one
      setPending((l) => l.filter((m) => m.id !== draft.id));
    } catch (e) {
      setPending((l) => l.map((m) => (m.id === draft.id ? { ...m, _pending: false, _failed: true, _error: e.message } : m)));
    }
  }, [client]);

  const send = ({ content, files, mentions, replyTo: reply }) => {
    const id = crypto.randomUUID();
    const draft = {
      id, conversation_id: conv.id, sender_id: me.id, content, mentions, reply_to_message_id: reply, message_type: files.length ? "file" : "text",
      created_at: new Date().toISOString(), is_edited: false, is_forwarded: false, _pending: true, _files: files, _progress: [],
      chat_attachments: files.map((f, i) => ({ id: `${id}-${i}`, file_name: f.name, file_size: f.size, mime_type: f.type })),
      chat_message_reactions: [], chat_message_reads: [],
    };
    stick.current = true;
    setPending((l) => [...l, draft]);
    attempt(draft);
  };

  const act = (fn, ok) => async (...a) => {
    try { await fn(...a); if (ok) toast.success(ok); client.invalidateQueries({ queryKey: ["chat-messages", conv.id] }); client.invalidateQueries({ queryKey: ["chat-pinned", conv.id] }); }
    catch (e) { toast.error(e.message); }
  };
  const saveEdit = act(async (id, content) => { await editMessage(id, content); setEditing(null); });
  const del = act((m) => (window.confirm("Delete this message?") ? rpc("chat_delete_message", { p_msg: m.id }) : null));
  const pin = act((m) => rpc("chat_pin_message", { p_msg: m.id, p_pin: !m.pinned_at }));
  const react = act((m, e) => toggleReaction(m.id, e, (m.chat_message_reactions || []).some((r) => r.user_id === me.id && r.reaction === e)));

  /* ---- search inside this conversation ---- */
  useEffect(() => {
    if (!searchOpen || q.trim().length < 2) { setResults([]); return undefined; }
    const t = setTimeout(async () => {
      const { data } = await supabase.from("chat_messages").select("id, content, sender_id, created_at").eq("conversation_id", conv.id)
        .is("deleted_at", null).in("message_type", ["text", "image", "file"]).ilike("content", `%${likeEscape(q.trim())}%`).order("created_at", { ascending: false }).limit(25);
      setResults(data || []);
    }, 300);
    return () => clearTimeout(t);
  }, [q, searchOpen, conv.id]);


  /* ---- audio / video call ---- */
  const call = useCall();
  const openCall = useOpenCall(conv.id).data;
  const inThisCall = call?.active?.conversationId === conv.id;
  const callInfo = (type) => ({ conversationId: conv.id, type: type === "video" ? "video" : "audio", title, isDirect: !isGroup });
  // A call already running here is joined as the type it was started with; otherwise start the type of the button.
  const callButton = (type) => {
    if (!call) return;
    if (inThisCall) call.setView("full");
    else if (openCall) call.joinCall({ ...callInfo(openCall.call_type), callId: openCall.id, accept: true });
    else call.startCall(callInfo(type));
  };
  const busyElsewhere = !!call?.active && !inThisCall;
  const liveType = inThisCall ? call.active.type : openCall?.call_type;

  const subtitle = isGroup
    ? `${conv.members.length} members${conv.group_type === "project" ? " · Project group" : ""}`
    : online.has(other?.id) ? "Online" : lastSeenLabel(other?.last_seen_at);
  const typingNames = typing.map((id) => map[id]?.full_name?.split(" ")[0]).filter(Boolean);

  let lastDay = "";
  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <header className="flex items-center gap-3 border-b border-slate-800 px-4 py-3">
        <button onClick={onBack} aria-label="Back to conversations" className="rounded-lg p-1.5 text-slate-300 hover:bg-slate-800 md:hidden"><ArrowLeft size={18} /></button>
        <ChatAvatar name={title} path={isGroup ? conv.avatar_path : other?.avatar_path} group={isGroup} size={40} online={isGroup ? null : online.has(other?.id)} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-bold text-white">{title}</h2>
          <p className={`truncate text-xs ${!isGroup && online.has(other?.id) ? "text-emerald-400" : "text-slate-500"}`}>{typingNames.length ? `${typingNames.join(", ")} typing...` : subtitle}</p>
        </div>
        <div className="flex items-center gap-1">
          {call && [["audio", Phone, "audio"], ["video", Video, "video"]].map(([type, Icon, word]) => (
            <button key={type} onClick={() => callButton(type)} disabled={busyElsewhere}
              title={busyElsewhere ? "You are in another call" : `Start ${isGroup ? "a group" : "a"} ${word} call`}
              aria-label={`${word[0].toUpperCase()}${word.slice(1)} call`}
              className={`rounded-lg p-2 hover:bg-slate-800 disabled:opacity-40 ${liveType === type ? "text-emerald-400" : "text-slate-300"}`}><Icon size={18} /></button>
          ))}
          <button onClick={() => setSearchOpen((v) => !v)} title="Search this conversation" aria-label="Search this conversation" className="rounded-lg p-2 text-slate-300 hover:bg-slate-800"><Search size={18} /></button>
          <button onClick={onToggleDetails} title="Conversation details" aria-label="Conversation details" className={`rounded-lg p-2 hover:bg-slate-800 ${showDetails ? "text-blue-300" : "text-slate-300"}`}><PanelRight size={18} /></button>
        </div>
      </header>

      {call && openCall && !inThisCall && (
        <div className="flex items-center justify-between gap-3 border-b border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-200">
          <span className="flex items-center gap-2">{openCall.call_type === "video" ? <Video size={15} /> : <Phone size={15} />} {openCall.call_status === "ringing" ? "Calling..." : `${openCall.call_type === "video" ? "Video" : "Audio"} call in progress`}</span>
          <button onClick={() => callButton(openCall.call_type)} disabled={!!call.active} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-40">Join call</button>
        </div>
      )}

      {searchOpen && (
        <div className="border-b border-slate-800 bg-[#0D1628] p-3">
          <div className="flex items-center gap-2"><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search messages in this conversation"
            className="flex-1 rounded-xl border border-slate-700 bg-[#0D172A] px-3 py-2 text-sm text-white outline-none focus:border-blue-500" />
            <button onClick={() => { setSearchOpen(false); setQ(""); }} aria-label="Close search" className="text-slate-400 hover:text-white"><X size={16} /></button></div>
          {q.trim().length >= 2 && (
            <ul className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-slate-700/70">
              {results.length === 0 && <li className="p-3 text-xs text-slate-500">No messages found.</li>}
              {results.map((r) => (
                <li key={r.id} className="border-b border-slate-800 px-3 py-2 text-xs last:border-0">
                  <span className="font-semibold text-blue-300">{map[r.sender_id]?.full_name || "Someone"}</span> <span className="text-slate-500">{dayLabel(r.created_at)}</span>
                  <p className="text-slate-200">{r.content}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div ref={scroller} onScroll={onScroll} className="relative min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {messagesQ.isLoading && <Loading text="Loading messages..." />}
        {messagesQ.error && <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{messagesQ.error.message}</p>}
        {messagesQ.hasNextPage && (
          <div className="mb-2 text-center"><button onClick={loadOlder} disabled={messagesQ.isFetchingNextPage}
            className="rounded-full border border-slate-700 bg-[#111C32] px-4 py-1.5 text-xs font-semibold text-slate-300 hover:text-white disabled:opacity-50">
            {messagesQ.isFetchingNextPage ? "Loading..." : "Load older messages"}</button></div>
        )}
        {!messagesQ.isLoading && !messages.length && (
          <p className="mt-16 text-center text-sm text-slate-500">{isGroup ? "This group has no messages yet. Say hello!" : `Start your conversation with ${title}.`}</p>
        )}
        {messages.map((m, i) => {
          const day = dayLabel(m.created_at);
          const showDay = day !== lastDay;
          lastDay = day;
          const prev = messages[i - 1];
          const grouped = !showDay && prev && prev.sender_id === m.sender_id && !["system", "call"].includes(prev.message_type) && !["system", "call"].includes(m.message_type)
            && new Date(m.created_at) - new Date(prev.created_at) < 5 * 60000;
          const target = m.reply_to_message_id ? byId[m.reply_to_message_id] : null;
          const readers = (m.chat_message_reads || []).filter((r) => r.user_id !== me.id).length;
          return (
            <div key={m.id}>
              {showDay && <div className="my-3 flex justify-center"><span className="rounded-full bg-[#17243D] px-3 py-1 text-[11px] font-semibold text-slate-400">{day}</span></div>}
              <MessageBubble onCallBack={(t) => call?.startCall(callInfo(t))} m={m} mine={m.sender_id === me.id} isGroup={isGroup} sender={map[m.sender_id]} grouped={grouped} meId={me.id}
                replyTarget={target} replyName={target ? map[target.sender_id]?.full_name : null} names={names}
                readersCount={readers} memberCount={conv.members.length} progress={m._progress}
                canPin={!isGroup || iAmAdmin} canModerate={isGroup && (iAmAdmin || ["admin", "hr"].includes(me.role))}
                onReply={setReplyTo} onForward={setForwarding} onEdit={(x) => { setReplyTo(null); setEditing(x); }}
                onDelete={del} onPin={pin} onReact={react}
                onRetry={(x) => attempt(x)} onDiscard={(x) => setPending((l) => l.filter((p) => p.id !== x.id))} />
            </div>
          );
        })}
        {!stick.current && messages.length > 8 && (
          <button onClick={() => { scroller.current.scrollTop = scroller.current.scrollHeight; }} aria-label="Scroll to latest"
            className="sticky bottom-2 ml-auto grid h-9 w-9 place-items-center rounded-full bg-blue-600 text-white shadow-lg"><ChevronDown size={18} /></button>
        )}
      </div>

      <Composer people={people} replyTo={replyTo} replyName={replyTo ? map[replyTo.sender_id]?.full_name || "message" : ""}
        editing={editing} onCancelReply={() => setReplyTo(null)} onCancelEdit={() => setEditing(null)}
        onSend={send} onSaveEdit={saveEdit} onTyping={notify} />

      {forwarding && (
        <ForwardModal conversations={conversations} me={me} map={map} onClose={() => setForwarding(null)}
          onForward={async (ids) => {
            try { await forwardMessage(forwarding, ids); toast.success("Message forwarded."); client.invalidateQueries({ queryKey: ["chat-conversations"] }); setForwarding(null); }
            catch (e) { toast.error(e.message); }
          }} />
      )}
    </div>
  );
}
