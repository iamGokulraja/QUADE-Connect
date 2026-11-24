import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { FileText, MessageCircle, MessageSquarePlus, Search, UserRound, Users, UsersRound, X } from "lucide-react";

import { supabase } from "../../lib/supabaseClient";
import { ROLE_LABEL } from "../../lib/constants";
import { convTitle, likeEscape } from "../../lib/chat";
import toast from "../../lib/toast";
import { rpc, useConversations, useDirectory } from "../../hooks/chat";
import { useChatRuntime } from "../../components/chat/ChatRuntime";
import ChatAvatar from "../../components/chat/ChatAvatar";
import ConversationList from "../../components/chat/ConversationList";
import ConversationView from "../../components/chat/ConversationView";
import DetailsPanel from "../../components/chat/DetailsPanel";
import { FilesPanel } from "../../components/chat/Panels";
import { CreateGroupModal, NewMessageModal } from "../../components/chat/Modals";
import { Loading } from "../../components/ui";

const TABS = [["groups", "Groups", UsersRound], ["direct", "Direct", UserRound], ["files", "Files", FileText]];

// Team Connect: one page for every internal role. Conversation membership (enforced by the database) decides what you see.
export default function TeamChat() {
  const client = useQueryClient();
  const { me, online, setActiveConversation } = useChatRuntime();
  const [params, setParams] = useSearchParams();
  const convId = params.get("c");
  const [tab, setTab] = useState("groups");
  const [q, setQ] = useState("");
  const [messageHits, setMessageHits] = useState([]);
  const [showDetails, setShowDetails] = useState(() => window.innerWidth >= 1280);
  const [modal, setModal] = useState(null);

  const convsQ = useConversations(!!me);
  const { people, map } = useDirectory();
  const conversations = useMemo(() => convsQ.data || [], [convsQ.data]);
  const active = conversations.find((c) => c.id === convId) || null;

  useEffect(() => {
    setActiveConversation(active?.id || null);
    return () => setActiveConversation(null);
  }, [active?.id, setActiveConversation]);
  useEffect(() => { if (active) setTab(active.conversation_type === "group" ? "groups" : "direct"); }, [active?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = (id) => { setParams({ c: id }, { replace: false }); setQ(""); };
  const close = () => setParams({}, { replace: true });

  const openDirect = async (userId) => {
    try {
      const id = await rpc("chat_open_direct", { p_other: userId });
      await client.invalidateQueries({ queryKey: ["chat-conversations"] });
      setModal(null);
      open(id);
    } catch (e) { toast.error(e.message); }
  };

  // search: people + groups locally, messages in the database (it only ever returns conversations I belong to)
  const s = q.trim().toLowerCase();
  useEffect(() => {
    if (s.length < 2) { setMessageHits([]); return undefined; }
    const t = setTimeout(async () => {
      const { data } = await supabase.from("chat_messages").select("id, conversation_id, content, created_at")
        .is("deleted_at", null).in("message_type", ["text", "image", "file"]).ilike("content", `%${likeEscape(q.trim())}%`)
        .order("created_at", { ascending: false }).limit(15);
      setMessageHits(data || []);
    }, 300);
    return () => clearTimeout(t);
  }, [s, q]);

  if (!me) return <div className="p-8"><Loading text="Opening Team Connect..." /></div>;
  if (convsQ.error) {
    return (
      <div className="m-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 text-sm text-amber-200">
        Team Connect is not set up in the database yet. Run <code>20261120000000_team_chat.sql</code> in the Supabase SQL Editor, then reload.
        <p className="mt-2 text-xs text-amber-300/80">{convsQ.error.message}</p>
      </div>
    );
  }

  const groups = conversations.filter((c) => c.conversation_type === "group");
  const directs = conversations.filter((c) => c.conversation_type === "direct");
  const unreadOf = (list) => list.reduce((n, c) => n + (c.is_muted ? 0 : c.unread), 0);
  const list = tab === "groups" ? groups : directs;
  const peopleHits = s ? people.filter((p) => p.id !== me.id && `${p.full_name} ${p.designation || ""}`.toLowerCase().includes(s)).slice(0, 8) : [];
  const groupHits = s ? conversations.filter((c) => c.conversation_type === "group" && (c.name || "").toLowerCase().includes(s)).slice(0, 6) : [];
  const byId = Object.fromEntries(conversations.map((c) => [c.id, c]));

  const showList = !active;      // on phones only one pane is visible at a time
  return (
    <div className="flex h-[calc(100vh-4rem)] min-h-[32rem] overflow-hidden border-t border-slate-800 bg-[#0B1120]">
      {/* ---------------- left: navigation ---------------- */}
      <section className={`${showList ? "flex" : "hidden"} w-full shrink-0 flex-col border-r border-slate-800 bg-[#0D1628] md:flex md:w-80`}>
        <div className="space-y-3 border-b border-slate-800 p-4">
          <div className="flex items-center justify-between">
            <h1 className="flex items-center gap-2 text-lg font-bold text-white"><MessageCircle size={20} className="text-blue-400" /> Team Connect</h1>
          </div>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people, groups, messages"
              className="w-full rounded-xl border border-slate-700 bg-[#0B1120] py-2.5 pl-9 pr-8 text-sm text-white outline-none placeholder:text-slate-500 focus:border-blue-500" />
            {q && <button onClick={() => setQ("")} aria-label="Clear search" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"><X size={14} /></button>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setModal("new")} className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 py-2 text-xs font-semibold text-white hover:bg-blue-500"><MessageSquarePlus size={15} /> New message</button>
            <button onClick={() => setModal("group")} className="flex items-center justify-center gap-2 rounded-xl border border-slate-600 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800"><Users size={15} /> Create group</button>
          </div>
          {!s && (
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-[#0B1120] p-1">
              {TABS.map(([k, l, Icon]) => {
                const n = k === "groups" ? unreadOf(groups) : k === "direct" ? unreadOf(directs) : 0;
                return (
                  <button key={k} onClick={() => { setTab(k); if (k === "files") close(); }}
                    className={`relative flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold ${tab === k ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"}`}>
                    <Icon size={13} />{l}
                    {n > 0 && <span className="absolute -right-0.5 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[9px] text-white">{n}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {s ? (
            <div>
              {peopleHits.length > 0 && <p className="px-4 pt-3 text-[11px] font-bold uppercase tracking-widest text-slate-500">People</p>}
              {peopleHits.map((p) => (
                <button key={p.id} onClick={() => openDirect(p.id)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-white/[0.04]">
                  <ChatAvatar name={p.full_name} path={p.avatar_path} size={36} online={online.has(p.id)} />
                  <span className="min-w-0"><span className="block truncate text-sm font-semibold text-white">{p.full_name}</span>
                    <span className="block truncate text-xs text-slate-400">{p.designation || ROLE_LABEL[p.role]}</span></span>
                </button>
              ))}
              {groupHits.length > 0 && <p className="px-4 pt-3 text-[11px] font-bold uppercase tracking-widest text-slate-500">Groups</p>}
              {groupHits.map((c) => (
                <button key={c.id} onClick={() => open(c.id)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-white/[0.04]">
                  <ChatAvatar name={c.name} path={c.avatar_path} group size={36} /><span className="truncate text-sm font-semibold text-white">{c.name}</span>
                </button>
              ))}
              {messageHits.length > 0 && <p className="px-4 pt-3 text-[11px] font-bold uppercase tracking-widest text-slate-500">Messages</p>}
              {messageHits.map((m) => byId[m.conversation_id] && (
                <button key={m.id} onClick={() => open(m.conversation_id)} className="block w-full px-4 py-2.5 text-left hover:bg-white/[0.04]">
                  <span className="block truncate text-xs font-semibold text-blue-300">{convTitle(byId[m.conversation_id], me.id, map)}</span>
                  <span className="block truncate text-sm text-slate-200">{m.content}</span>
                </button>
              ))}
              {!peopleHits.length && !groupHits.length && !messageHits.length && <p className="p-6 text-center text-sm text-slate-500">Nothing found.</p>}
            </div>
          ) : tab === "files" ? (
            <p className="p-6 text-center text-xs text-slate-500">Files from all your chats are shown on the right.</p>
          ) : convsQ.isLoading ? <Loading /> : (
            <ConversationList items={list} activeId={convId} me={me} map={map} online={online} onSelect={open}
              empty={tab === "groups" ? "No groups yet. Create one to chat with your team." : "No direct messages yet. Click New message."} />
          )}
        </div>
      </section>

      {/* ---------------- centre: conversation / files ---------------- */}
      <section className={`${showList ? "hidden md:flex" : "flex"} min-w-0 flex-1`}>
        {active ? (
          <>
            <ConversationView key={active.id} conv={active} me={me} map={map} online={online} conversations={conversations}
              showDetails={showDetails} onToggleDetails={() => setShowDetails((v) => !v)} onBack={close} />
            {showDetails && (
              <div className="fixed inset-y-0 right-0 z-40 w-[min(22rem,100vw)] shadow-2xl xl:static xl:z-auto xl:w-80 xl:shrink-0 xl:shadow-none">
                <DetailsPanel conv={active} me={me} map={map} online={online} conversations={conversations}
                  onClose={() => setShowDetails(false)} onLeft={close} onOpenFiles={() => { close(); setTab("files"); }} />
              </div>
            )}
          </>
        ) : tab === "files" ? (
          <div className="min-w-0 flex-1"><div className="border-b border-slate-800 px-4 py-3 text-sm font-bold text-white">Shared files</div>
            <div className="h-[calc(100%-3rem)]"><FilesPanel me={me} map={map} conversations={conversations} /></div></div>
        ) : (
          <div className="grid flex-1 place-items-center p-8 text-center">
            <div><MessageCircle size={44} className="mx-auto mb-3 text-slate-700" />
              <h2 className="text-lg font-bold text-white">Welcome to Team Connect</h2>
              <p className="mt-1 text-sm text-slate-500">Select a conversation, start a new message or create a group.</p></div>
          </div>
        )}
      </section>

      {modal === "new" && <NewMessageModal me={me} online={online} onClose={() => setModal(null)} onPick={openDirect} />}
      {modal === "group" && <CreateGroupModal me={me} online={online} onClose={() => setModal(null)} onCreated={(id) => { setModal(null); open(id); }} />}
    </div>
  );
}
