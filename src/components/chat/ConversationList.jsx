import { BellOff, Pin } from "lucide-react";

import { convTitle, listTime, otherMember } from "../../lib/chat";
import ChatAvatar from "./ChatAvatar";

export default function ConversationList({ items, activeId, me, map, online, onSelect, empty }) {
  if (!items.length) return <p className="p-6 text-center text-sm text-slate-500">{empty}</p>;
  return (
    <ul>
      {items.map((c) => {
        const direct = c.conversation_type === "direct";
        const other = direct ? map[otherMember(c, me.id)] : null;
        const title = convTitle(c, me.id, map);
        const preview = c.last_message_preview
          ? `${c.last_message_sender === me.id ? "You: " : !direct && map[c.last_message_sender] ? `${map[c.last_message_sender].full_name.split(" ")[0]}: ` : ""}${c.last_message_preview}`
          : direct ? "Say hello" : c.description || "No messages yet";
        return (
          <li key={c.id}>
            <button onClick={() => onSelect(c.id)}
              className={`flex w-full items-center gap-3 border-b border-slate-800/70 px-4 py-3 text-left transition hover:bg-white/[0.04] ${activeId === c.id ? "bg-blue-600/15" : ""}`}>
              <ChatAvatar name={title} path={direct ? other?.avatar_path : c.avatar_path} group={!direct} size={44} online={direct ? online.has(other?.id) : null} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className={`truncate text-sm ${c.unread ? "font-bold text-white" : "font-semibold text-slate-200"}`}>{title}</span>
                  <span className="shrink-0 text-[11px] text-slate-500">{listTime(c.last_message_at)}</span>
                </span>
                <span className="flex items-center justify-between gap-2">
                  <span className={`truncate text-xs ${c.unread ? "text-slate-200" : "text-slate-500"}`}>{preview}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    {c.is_pinned && <Pin size={11} className="text-slate-500" />}
                    {c.is_muted && <BellOff size={11} className="text-slate-500" />}
                    {c.unread > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">{c.unread > 99 ? "99+" : c.unread}</span>}
                  </span>
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
