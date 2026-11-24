import { useEffect, useMemo, useRef, useState } from "react";
import { AtSign, CornerUpLeft, Paperclip, Pencil, Send, Smile, X } from "lucide-react";

import { ACCEPT, EMOJIS, MAX_FILES_PER_MESSAGE, fmtSize, validateFile } from "../../lib/chat";
import toast from "../../lib/toast";

// Message box: Enter sends, Shift+Enter = new line, emoji, @mentions, attachments (pick, paste or drop), reply / edit modes.
export default function Composer({ people, replyTo, replyName, editing, onCancelReply, onCancelEdit, onSend, onSaveEdit, onTyping }) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState([]);
  const [emoji, setEmoji] = useState(false);
  const [mention, setMention] = useState(null);     // { query, start }
  const [picked, setPicked] = useState([]);         // [{ id, name }] people mentioned in this message
  const area = useRef(null);
  const fileInput = useRef(null);

  // entering edit mode loads the text; leaving it clears the box
  useEffect(() => {
    if (editing) { setText(editing.content || ""); setFiles([]); area.current?.focus(); }
  }, [editing]);
  useEffect(() => { if (replyTo) area.current?.focus(); }, [replyTo]);

  // auto-grow the textarea
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  const matches = useMemo(() => {
    if (!mention) return [];
    const q = mention.query.toLowerCase();
    return people.filter((p) => (p.full_name || "").toLowerCase().includes(q)).slice(0, 6);
  }, [mention, people]);

  const addFiles = (list) => {
    const incoming = [...list];
    const next = [...files];
    for (const f of incoming) {
      const err = validateFile(f);
      if (err) { toast.error(err); continue; }
      if (next.length >= MAX_FILES_PER_MESSAGE) { toast.error(`You can attach up to ${MAX_FILES_PER_MESSAGE} files per message.`); break; }
      if (!next.some((x) => x.name === f.name && x.size === f.size)) next.push(f);
    }
    setFiles(next);
  };

  const onChange = (e) => {
    const value = e.target.value;
    setText(value);
    if (!editing) onTyping?.();
    const caret = e.target.selectionStart;
    const m = /(^|\s)@([^\s@]{0,30})$/.exec(value.slice(0, caret));
    setMention(m && !editing ? { query: m[2], start: caret - m[2].length - 1 } : null);
  };

  const pickMention = (p) => {
    const caret = area.current.selectionStart;
    const before = text.slice(0, mention.start);
    const after = text.slice(caret);
    const insert = `@${p.full_name} `;
    setText(before + insert + after);
    setPicked((l) => (l.some((x) => x.id === p.id) ? l : [...l, { id: p.id, name: p.full_name }]));
    setMention(null);
    setTimeout(() => { area.current?.focus(); const pos = (before + insert).length; area.current?.setSelectionRange(pos, pos); }, 0);
  };

  const submit = () => {
    const content = text.trim();
    if (editing) {
      if (!content) return toast.error("A message cannot be empty. Delete it instead.");
      if (content !== editing.content) onSaveEdit(editing.id, content);
      else onCancelEdit();
      setText("");
      return;
    }
    if (!content && !files.length) return;
    const mentions = picked.filter((p) => content.includes(`@${p.name}`)).map((p) => p.id);
    onSend({ content, files, mentions, replyTo: replyTo?.id || null });
    setText(""); setFiles([]); setPicked([]); setMention(null); setEmoji(false);
    onCancelReply?.();
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (mention && matches.length) pickMention(matches[0]); else submit();
    } else if (e.key === "Escape") {
      if (mention) setMention(null);
      else if (editing) { onCancelEdit(); setText(""); }
      else if (replyTo) onCancelReply();
    }
  };

  return (
    <div className="border-t border-slate-800 bg-[#0B1120] p-3"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); if (!editing && e.dataTransfer.files.length) addFiles(e.dataTransfer.files); }}>
      {replyTo && !editing && (
        <div className="mb-2 flex items-start justify-between gap-3 rounded-xl border-l-4 border-blue-500 bg-[#111C32] px-3 py-2 text-xs">
          <div className="min-w-0"><p className="flex items-center gap-1 font-semibold text-blue-300"><CornerUpLeft size={12} /> Replying to {replyName}</p>
            <p className="truncate text-slate-400">{replyTo.content || "Attachment"}</p></div>
          <button onClick={onCancelReply} aria-label="Cancel reply" className="text-slate-400 hover:text-white"><X size={14} /></button>
        </div>
      )}
      {editing && (
        <div className="mb-2 flex items-center justify-between rounded-xl border-l-4 border-amber-500 bg-[#111C32] px-3 py-2 text-xs">
          <span className="flex items-center gap-1 font-semibold text-amber-300"><Pencil size={12} /> Editing message</span>
          <button onClick={() => { onCancelEdit(); setText(""); }} aria-label="Cancel edit" className="text-slate-400 hover:text-white"><X size={14} /></button>
        </div>
      )}
      {files.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {files.map((f) => (
            <span key={f.name + f.size} className="flex max-w-[14rem] items-center gap-2 rounded-lg border border-slate-700 bg-[#111C32] px-2.5 py-1.5 text-xs text-slate-200">
              <Paperclip size={12} className="shrink-0 text-blue-300" /><span className="truncate">{f.name}</span><span className="shrink-0 text-slate-500">{fmtSize(f.size)}</span>
              <button onClick={() => setFiles((l) => l.filter((x) => x !== f))} aria-label={`Remove ${f.name}`} className="text-slate-400 hover:text-white"><X size={12} /></button>
            </span>
          ))}
        </div>
      )}

      <div className="relative flex items-end gap-2">
        {mention && matches.length > 0 && (
          <ul className="absolute bottom-full left-0 z-20 mb-2 w-64 overflow-hidden rounded-xl border border-slate-700 bg-[#111C32] shadow-2xl">
            {matches.map((p) => (
              <li key={p.id}><button onMouseDown={(e) => { e.preventDefault(); pickMention(p); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-700"><AtSign size={13} className="text-blue-300" />{p.full_name}</button></li>
            ))}
          </ul>
        )}
        {emoji && (
          <div className="absolute bottom-full left-0 z-20 mb-2 grid w-72 grid-cols-8 gap-1 rounded-xl border border-slate-700 bg-[#111C32] p-2 shadow-2xl">
            {EMOJIS.map((e) => (
              <button key={e} type="button" onClick={() => { setText((t) => t + e); area.current?.focus(); }} className="rounded-lg p-1 text-xl hover:bg-slate-700">{e}</button>
            ))}
          </div>
        )}
        {!editing && (
          <>
            <button type="button" onClick={() => fileInput.current?.click()} title="Attach files" aria-label="Attach files"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-slate-400 hover:bg-slate-800 hover:text-white"><Paperclip size={19} /></button>
            <input ref={fileInput} type="file" multiple accept={ACCEPT} className="hidden"
              onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
          </>
        )}
        <button type="button" onClick={() => setEmoji((v) => !v)} title="Emoji" aria-label="Emoji"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-slate-400 hover:bg-slate-800 hover:text-white"><Smile size={19} /></button>
        <textarea ref={area} value={text} onChange={onChange} onKeyDown={onKeyDown} rows={1}
          onPaste={(e) => { if (!editing && e.clipboardData.files.length) { e.preventDefault(); addFiles(e.clipboardData.files); } }}
          placeholder={editing ? "Edit your message" : "Type a message (Enter to send, Shift+Enter for a new line)"}
          className="max-h-40 min-h-10 flex-1 resize-none rounded-xl border border-slate-700 bg-[#0D172A] px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-500 focus:border-blue-500" />
        <button type="button" onClick={submit} disabled={!text.trim() && !files.length} aria-label={editing ? "Save" : "Send"}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-600 text-white transition hover:bg-blue-500 disabled:opacity-40"><Send size={18} /></button>
      </div>
    </div>
  );
}
