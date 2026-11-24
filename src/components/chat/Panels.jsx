import { useMemo, useState } from "react";
import { Download, FileText } from "lucide-react";

import { convTitle, extOf, fmtSize } from "../../lib/chat";
import toast from "../../lib/toast";
import { downloadChatFile, useSharedFiles } from "../../hooks/chat";
import { Empty, Loading } from "../ui";

// Shared files: every file from every conversation I belong to, grouped by conversation.
export function FilesPanel({ me, map, conversations, conversationId, compact = false }) {
  const { data = [], isLoading } = useSharedFiles(conversationId);
  const [conv, setConv] = useState("all");
  const [q, setQ] = useState("");
  const convs = useMemo(() => Object.fromEntries(conversations.map((c) => [c.id, c])), [conversations]);
  const rows = data.filter((a) => (conv === "all" || a.conversation_id === conv) && a.file_name.toLowerCase().includes(q.toLowerCase()));
  const get = (a) => downloadChatFile(a.storage_path, a.file_name).catch((e) => toast.error(e.message));

  return (
    <div className="flex h-full flex-col">
      {!compact && (
        <div className="flex flex-wrap gap-2 border-b border-slate-800 p-4">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search files"
            className="min-w-40 flex-1 rounded-xl border border-slate-700 bg-[#0D172A] px-3 py-2 text-sm text-white outline-none focus:border-blue-500" />
          <select value={conv} onChange={(e) => setConv(e.target.value)} className="rounded-xl border border-slate-700 bg-[#0D172A] px-3 py-2 text-sm text-white">
            <option value="all">All conversations</option>
            {conversations.map((c) => <option key={c.id} value={c.id}>{convTitle(c, me.id, map)}</option>)}
          </select>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading && <Loading />}
        {!isLoading && !rows.length && <Empty icon={FileText} title="No shared files" text="Files sent in chats appear here." />}
        {rows.map((a) => (
          <div key={a.id} className="flex items-center gap-3 border-b border-slate-800/70 px-4 py-2.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-600/20 text-[10px] font-bold uppercase text-blue-300">{extOf(a.file_name).slice(0, 4) || "file"}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-white">{a.file_name}</span>
              <span className="block truncate text-[11px] text-slate-400">
                {map[a.uploaded_by]?.full_name || "Unknown"} · {fmtSize(a.file_size)} · {new Date(a.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                {!conversationId && convs[a.conversation_id] ? ` · ${convTitle(convs[a.conversation_id], me.id, map)}` : ""}
              </span>
            </span>
            <button onClick={() => get(a)} aria-label={`Download ${a.file_name}`} className="rounded-lg p-2 text-slate-300 hover:bg-white/10 hover:text-white"><Download size={16} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}
