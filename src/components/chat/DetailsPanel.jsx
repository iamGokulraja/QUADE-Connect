import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BellOff, Bell, Crown, LogOut, Pencil, Pin, PinOff, Shield, Trash2, UserMinus, UserPlus, X } from "lucide-react";

import { supabase } from "../../lib/supabaseClient";
import { ROLE_LABEL } from "../../lib/constants";
import { convTitle, lastSeenLabel, otherMember } from "../../lib/chat";
import toast from "../../lib/toast";
import { rpc, useLastSeenSetting, usePinned } from "../../hooks/chat";
import ChatAvatar from "./ChatAvatar";
import { FilesPanel } from "./Panels";
import { AddMembersModal, EditGroupModal } from "./Modals";

const sec = "border-b border-slate-800 p-4";
const h = "mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500";

export default function DetailsPanel({ conv, me, map, online, conversations, onClose, onLeft, onOpenFiles }) {
  const client = useQueryClient();
  const isGroup = conv.conversation_type === "group";
  const iAmAdmin = isGroup && conv.my_role === "admin";
  const other = !isGroup ? map[otherMember(conv, me.id)] : null;
  const { data: pinned = [] } = usePinned(conv.id);
  const { data: showSeen = true } = useLastSeenSetting();
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const pic = useRef(null);

  const refresh = () => client.invalidateQueries({ queryKey: ["chat-conversations"] });
  const run = async (fn, ok) => {
    try { await fn(); refresh(); if (ok) toast.success(ok); } catch (e) { toast.error(e.message); }
  };
  const changePicture = async (file) => {
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type) || file.size > 5 * 1048576) return toast.error("Use a PNG, JPG or WEBP picture up to 5 MB.");
    const path = `avatars/${me.id}/${Date.now()}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
    await run(async () => {
      const { error } = await supabase.storage.from("chat-files").upload(path, file, { contentType: file.type });
      if (error) throw error;
      await rpc("chat_update_group", { p_conv: conv.id, p_patch: { avatar_path: path } });
    }, "Group picture updated.");
  };
  const confirmDo = (msg, fn, ok) => window.confirm(msg) && run(fn, ok);

  const members = [...conv.members].sort((a, b) => (a.role === "admin" ? -1 : 1) - (b.role === "admin" ? -1 : 1));

  return (
    <aside className="flex h-full w-full flex-col overflow-y-auto border-l border-slate-800 bg-[#0D1628]">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <strong className="text-sm text-white">{isGroup ? "Group details" : "Contact"}</strong>
        <button onClick={onClose} aria-label="Close details" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"><X size={16} /></button>
      </div>

      <div className={`${sec} flex flex-col items-center text-center`}>
        <div className="relative">
          <ChatAvatar name={convTitle(conv, me.id, map)} path={isGroup ? conv.avatar_path : other?.avatar_path} group={isGroup} size={84} online={isGroup ? null : online.has(other?.id)} />
          {iAmAdmin && (
            <>
              <button onClick={() => pic.current?.click()} aria-label="Change group picture" className="absolute -bottom-1 -right-1 grid h-8 w-8 place-items-center rounded-full bg-blue-600 text-white hover:bg-blue-500"><Pencil size={14} /></button>
              <input ref={pic} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { if (e.target.files[0]) changePicture(e.target.files[0]); e.target.value = ""; }} />
            </>
          )}
        </div>
        <h3 className="mt-3 text-base font-bold text-white">{convTitle(conv, me.id, map)}</h3>
        {isGroup ? (
          <>
            <p className="text-xs text-slate-400">{conv.group_type === "project" ? "Project group" : "Custom group"} · {conv.members.length} members</p>
            {conv.description && <p className="mt-2 text-sm text-slate-300">{conv.description}</p>}
            {iAmAdmin && <button onClick={() => setEditOpen(true)} className="mt-2 text-xs font-semibold text-blue-400 hover:underline">Edit name and description</button>}
          </>
        ) : (
          <>
            <p className="text-sm text-slate-300">{other?.designation || ROLE_LABEL[other?.role] || ""}</p>
            <p className="text-xs text-slate-500">{ROLE_LABEL[other?.role]}</p>
            <p className={`mt-1 text-xs ${online.has(other?.id) ? "text-emerald-400" : "text-slate-500"}`}>{online.has(other?.id) ? "Online" : lastSeenLabel(other?.last_seen_at)}</p>
          </>
        )}
      </div>

      <div className={`${sec} grid grid-cols-2 gap-2`}>
        <button onClick={() => run(() => rpc("chat_set_pref", { p_conv: conv.id, p_muted: !conv.is_muted }), conv.is_muted ? "Notifications on." : "Muted.")}
          className="flex items-center justify-center gap-2 rounded-xl border border-slate-700 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800">
          {conv.is_muted ? <Bell size={14} /> : <BellOff size={14} />}{conv.is_muted ? "Unmute" : "Mute"}</button>
        <button onClick={() => run(() => rpc("chat_set_pref", { p_conv: conv.id, p_pinned: !conv.is_pinned }))}
          className="flex items-center justify-center gap-2 rounded-xl border border-slate-700 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800">
          {conv.is_pinned ? <PinOff size={14} /> : <Pin size={14} />}{conv.is_pinned ? "Unpin chat" : "Pin chat"}</button>
      </div>

      {isGroup && (
        <div className={sec}>
          <div className="mb-2 flex items-center justify-between"><p className={`${h} mb-0`}>Members ({members.length})</p>
            {iAmAdmin && <button onClick={() => setAddOpen(true)} className="flex items-center gap-1 text-xs font-semibold text-blue-400 hover:underline"><UserPlus size={13} /> Add</button>}</div>
          <ul className="space-y-1">
            {members.map((m) => {
              const p = map[m.user_id];
              return (
                <li key={m.user_id} className="group flex items-center gap-2.5 rounded-lg px-1 py-1.5 hover:bg-white/[0.04]">
                  <ChatAvatar name={p?.full_name} path={p?.avatar_path} size={32} online={online.has(m.user_id)} />
                  <span className="min-w-0 flex-1"><span className="flex items-center gap-1 truncate text-sm font-semibold text-white">{p?.full_name || "Unknown user"}{m.user_id === me.id && <span className="text-xs font-normal text-slate-500">(you)</span>}</span>
                    <span className="block truncate text-[11px] text-slate-500">{p?.designation || ROLE_LABEL[p?.role]}</span></span>
                  {m.role === "admin" && <span title="Group administrator" className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-300"><Crown size={10} /> Admin</span>}
                  {iAmAdmin && m.user_id !== me.id && (
                    <span className="flex gap-0.5 opacity-0 group-hover:opacity-100">
                      <button title={m.role === "admin" ? "Remove admin" : "Make admin"} onClick={() => run(() => rpc("chat_set_member_role", { p_conv: conv.id, p_user: m.user_id, p_role: m.role === "admin" ? "member" : "admin" }))}
                        className="rounded p-1.5 text-slate-300 hover:bg-slate-700"><Shield size={13} /></button>
                      <button title="Remove from group" onClick={() => confirmDo(`Remove ${p?.full_name || "this person"} from the group?`, () => rpc("chat_remove_member", { p_conv: conv.id, p_user: m.user_id }), "Member removed.")}
                        className="rounded p-1.5 text-red-300 hover:bg-red-500/20"><UserMinus size={13} /></button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className={sec}>
        <p className={h}>Pinned messages</p>
        {pinned.length === 0 ? <p className="text-xs text-slate-500">{isGroup ? "Group administrators can pin important messages." : "Nothing pinned."}</p> : (
          <ul className="space-y-1.5">{pinned.map((m) => (
            <li key={m.id} className="rounded-lg bg-[#17243D] p-2 text-xs text-slate-200"><span className="font-semibold text-blue-300">{map[m.sender_id]?.full_name || "Someone"}: </span>{m.content || "Attachment"}</li>
          ))}</ul>
        )}
      </div>

      <div className="border-b border-slate-800">
        <div className="flex items-center justify-between px-4 pt-4"><p className={`${h} mb-0`}>Shared files</p>
          <button onClick={onOpenFiles} className="text-xs font-semibold text-blue-400 hover:underline">All files</button></div>
        <div className="max-h-64 overflow-y-auto"><FilesPanel me={me} map={map} conversations={conversations} conversationId={conv.id} compact /></div>
      </div>

      <div className={`${sec} space-y-3`}>
        <label className="flex cursor-pointer items-center justify-between gap-3 text-xs text-slate-300">
          <span>Show my "last seen" to others</span>
          <input type="checkbox" checked={showSeen} onChange={(e) => run(async () => { await rpc("chat_set_last_seen_visible", { p_visible: e.target.checked }); client.invalidateQueries({ queryKey: ["chat-last-seen-setting"] }); client.invalidateQueries({ queryKey: ["chat-directory"] }); })} />
        </label>
        {isGroup && (
          <>
            <button onClick={() => confirmDo("Leave this group?", async () => { await rpc("chat_leave_group", { p_conv: conv.id }); onLeft(); }, "You left the group.")}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800"><LogOut size={14} /> Leave group</button>
            {conv.created_by === me.id && (
              <button onClick={() => confirmDo("Delete this group and all its messages for everyone? Projects and teams are not affected.", async () => { await rpc("chat_delete_group", { p_conv: conv.id }); onLeft(); }, "Group deleted.")}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/40 py-2 text-xs font-semibold text-red-300 hover:bg-red-500/10"><Trash2 size={14} /> Delete group</button>
            )}
          </>
        )}
      </div>

      {addOpen && <AddMembersModal conv={conv} me={me} online={online} onClose={() => setAddOpen(false)} />}
      {editOpen && <EditGroupModal conv={conv} onClose={() => setEditOpen(false)} />}
    </aside>
  );
}
