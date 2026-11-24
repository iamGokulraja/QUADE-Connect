import { memo, useState } from "react";
import { Check, CheckCheck, CornerUpLeft, Download, FileText, Forward, Headphones, Pencil, Pin, PinOff, SmilePlus, Trash2, Video, VideoOff, PhoneMissed, ImageIcon } from "lucide-react";

import { CALL_STATUS_LABEL, REACTIONS, clock, fmtDuration, fmtSize, isImageFile, parseCallLog, splitMentions } from "../../lib/chat";
import { downloadChatFile, useChatFileUrl } from "../../hooks/chat";
import toast from "../../lib/toast";
import ChatAvatar from "./ChatAvatar";

function ImageAttachment({ a }) {
  const url = useChatFileUrl(a.storage_path);
  if (!url) return <div className="grid h-40 w-56 place-items-center rounded-xl bg-slate-800/60 text-slate-500"><ImageIcon size={22} /></div>;
  return (
    <a href={url} target="_blank" rel="noreferrer" title={a.file_name}>
      <img src={url} alt={a.file_name} loading="lazy" className="max-h-64 max-w-[16rem] rounded-xl object-cover" />
    </a>
  );
}

function FileAttachment({ a, progress }) {
  const pending = !a.storage_path;
  return (
    <div className="flex w-64 max-w-full items-center gap-3 rounded-xl border border-slate-700/70 bg-black/20 p-2.5">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-blue-600/20 text-blue-300"><FileText size={18} /></span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-white">{a.file_name}</p>
        <p className="text-[11px] text-slate-400">{fmtSize(a.file_size)}</p>
        {pending && <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-700"><div className="h-full bg-blue-400 transition-all" style={{ width: `${Math.round((progress || 0) * 100)}%` }} /></div>}
      </div>
      {!pending && (
        <button onClick={() => downloadChatFile(a.storage_path, a.file_name).catch((e) => toast.error(e.message))}
          aria-label={`Download ${a.file_name}`} className="rounded-lg p-2 text-slate-300 hover:bg-white/10 hover:text-white"><Download size={16} /></button>
      )}
    </div>
  );
}

// Grey centre line for "X added Y" and for call history ("Video call · 05:12" / "Missed audio call").
function CenterLine({ m, onCallBack }) {
  if (m.message_type === "call") {
    const c = parseCallLog(m.content);
    const missed = ["missed", "cancelled", "declined"].includes(c.status);
    const Icon = missed ? (c.type === "video" ? VideoOff : PhoneMissed) : c.type === "video" ? Video : Headphones;
    return (
      <div className="my-3 flex justify-center">
        <button onClick={() => onCallBack?.(c.type)} title="Call again"
          className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${missed ? "border-red-500/30 bg-red-500/10 text-red-300" : "border-slate-700 bg-[#111C32] text-slate-300"} hover:brightness-125`}>
          <Icon size={13} />
          {c.type === "video" ? "Video" : "Audio"} call · {missed ? CALL_STATUS_LABEL[c.status] : `ended${c.seconds ? ` · ${fmtDuration(c.seconds)}` : ""}`}
          <span className="text-slate-500">{clock(m.created_at)}</span>
        </button>
      </div>
    );
  }
  return <p className="my-2 text-center text-[11px] text-slate-500">{m.content} · {clock(m.created_at)}</p>;
}

function MessageBubble({ m, mine, isGroup, sender, grouped, replyTarget, replyName, names, readersCount, memberCount,
  canPin, canModerate, meId, progress, onReply, onForward, onEdit, onDelete, onPin, onReact, onCallBack, onRetry, onDiscard }) {
  const [picker, setPicker] = useState(false);
  if (m.message_type === "system" || m.message_type === "call") return <CenterLine m={m} onCallBack={onCallBack} />;

  const deleted = !!m.deleted_at;
  const atts = m.chat_attachments || [];
  const images = atts.filter((a) => isImageFile(a.file_name, a.mime_type));
  const files = atts.filter((a) => !images.includes(a));
  const reactions = Object.entries((m.chat_message_reactions || []).reduce((acc, r) => {
    (acc[r.reaction] ||= []).push(r.user_id);
    return acc;
  }, {}));
  const seen = readersCount > 0;
  const canDelete = mine || canModerate;

  return (
    <div className={`group flex gap-2 ${mine ? "flex-row-reverse" : ""} ${grouped ? "mt-0.5" : "mt-3"}`}>
      <div className="w-8 shrink-0">
        {!mine && isGroup && !grouped && <ChatAvatar name={sender?.full_name} path={sender?.avatar_path} size={32} />}
      </div>
      <div className={`flex max-w-[78%] flex-col ${mine ? "items-end" : "items-start"}`}>
        {!mine && isGroup && !grouped && <span className="mb-0.5 px-1 text-xs font-semibold text-blue-300">{sender?.full_name || "Unknown user"}</span>}
        <div className="relative">
          <div className={`rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
            m._failed ? "border border-red-500/50 bg-red-950/40 text-red-100"
            : mine ? "rounded-br-md bg-blue-600 text-white" : "rounded-bl-md border border-slate-700/70 bg-[#17243D] text-slate-100"} ${m._pending ? "opacity-70" : ""}`}>
            {m.is_forwarded && !deleted && <p className="mb-1 flex items-center gap-1 text-[11px] italic opacity-70"><Forward size={11} /> Forwarded</p>}
            {m.reply_to_message_id && !deleted && (
              <div className={`mb-1.5 rounded-lg border-l-2 px-2 py-1 text-xs ${mine ? "border-white/60 bg-white/10" : "border-blue-400 bg-black/20"}`}>
                <p className="font-semibold">{replyName || "Message"}</p>
                <p className="line-clamp-2 opacity-80">{replyTarget?.deleted_at ? "Message deleted" : replyTarget?.content || (replyTarget?.chat_attachments?.length ? "Attachment" : "Original message")}</p>
              </div>
            )}
            {deleted ? (
              <p className="italic opacity-70">{m.deleted_by && m.deleted_by !== m.sender_id ? "This message was removed by a moderator" : "This message was deleted"}</p>
            ) : (
              <>
                {images.length > 0 && <div className="mb-1.5 flex flex-wrap gap-1.5">{images.map((a) => <ImageAttachment key={a.id} a={a} />)}</div>}
                {files.length > 0 && <div className="mb-1.5 grid gap-1.5">{files.map((a, i) => <FileAttachment key={a.id} a={a} progress={progress?.[atts.indexOf(a)] ?? progress?.[i]} />)}</div>}
                {m.content && (
                  <p className="whitespace-pre-wrap break-words">
                    {splitMentions(m.content, names).map((p, i) => p.mention
                      ? <span key={i} className={`rounded px-1 font-semibold ${mine ? "bg-white/20" : "bg-blue-500/20 text-blue-300"}`}>{p.text}</span>
                      : <span key={i}>{p.text}</span>)}
                  </p>
                )}
              </>
            )}
            <div className={`mt-1 flex items-center justify-end gap-1.5 text-[10px] ${mine ? "text-blue-100/80" : "text-slate-400"}`}>
              {m.pinned_at && !deleted && <Pin size={10} />}
              {m.is_edited && !deleted && <span>edited</span>}
              <span>{clock(m.created_at)}</span>
              {mine && !deleted && !m._pending && !m._failed && (
                seen ? <span className="flex items-center gap-0.5 text-sky-200" title={isGroup ? `Seen by ${readersCount} of ${memberCount - 1}` : "Seen"}>
                  <CheckCheck size={13} />{isGroup && <span>{readersCount}</span>}</span> : <Check size={13} title="Sent" />
              )}
            </div>
          </div>

          {/* hover toolbar */}
          {!deleted && !m._pending && !m._failed && (
            <div className={`absolute -top-4 z-10 hidden items-center gap-0.5 rounded-lg border border-slate-700 bg-[#111C32] p-0.5 shadow-lg group-hover:flex ${mine ? "right-2" : "left-2"} ${picker ? "!flex" : ""}`}>
              <button onClick={() => setPicker((v) => !v)} title="React" className="rounded p-1.5 text-slate-300 hover:bg-slate-700"><SmilePlus size={14} /></button>
              <button onClick={() => onReply(m)} title="Reply" className="rounded p-1.5 text-slate-300 hover:bg-slate-700"><CornerUpLeft size={14} /></button>
              <button onClick={() => onForward(m)} title="Forward" className="rounded p-1.5 text-slate-300 hover:bg-slate-700"><Forward size={14} /></button>
              {mine && m.message_type === "text" && <button onClick={() => onEdit(m)} title="Edit" className="rounded p-1.5 text-slate-300 hover:bg-slate-700"><Pencil size={14} /></button>}
              {canPin && <button onClick={() => onPin(m)} title={m.pinned_at ? "Unpin" : "Pin"} className="rounded p-1.5 text-slate-300 hover:bg-slate-700">{m.pinned_at ? <PinOff size={14} /> : <Pin size={14} />}</button>}
              {canDelete && <button onClick={() => onDelete(m)} title="Delete" className="rounded p-1.5 text-red-300 hover:bg-red-500/20"><Trash2 size={14} /></button>}
              {picker && (
                <div className={`absolute top-full z-20 mt-1 flex gap-1 rounded-xl border border-slate-700 bg-[#111C32] p-1.5 shadow-xl ${mine ? "right-0" : "left-0"}`}>
                  {REACTIONS.map((e) => (
                    <button key={e} onClick={() => { setPicker(false); onReact(m, e); }} className="rounded-lg px-1.5 py-1 text-lg hover:bg-slate-700">{e}</button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {m._failed && (
          <p className="mt-1 text-xs text-red-300">
            Not sent: {m._error} · <button className="underline" onClick={() => onRetry(m)}>Retry</button> · <button className="underline" onClick={() => onDiscard(m)}>Remove</button>
          </p>
        )}

        {reactions.length > 0 && !deleted && (
          <div className="mt-1 flex flex-wrap gap-1">
            {reactions.map(([emoji, users]) => {
              const own = users.includes(meId);
              return (
                <button key={emoji} onClick={() => onReact(m, emoji)} title={`${users.length} reaction${users.length > 1 ? "s" : ""}`}
                  className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${own ? "border-blue-400 bg-blue-500/20 text-blue-100" : "border-slate-700 bg-[#17243D] text-slate-300"}`}>
                  <span>{emoji}</span><span>{users.length}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(MessageBubble);
