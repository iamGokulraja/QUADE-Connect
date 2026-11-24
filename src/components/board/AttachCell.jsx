import { useRef, useState } from "react";
import { Download, LoaderCircle, Paperclip, Trash2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "../../lib/supabaseClient";
import { uploadTaskFiles } from "./Attachments";

// Attachments column: the pin opens the file picker of your computer and uploads straight to the task.
// The number next to it lists the files (open / remove).
export default function AttachCell({ task, count = 0, canUpload, me }) {
  const client = useQueryClient();
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pos, setPos] = useState(null);

  const refresh = () => ["task-attachments"].forEach((k) => client.invalidateQueries({ queryKey: [k] }));
  const pick = async (e) => {
    const files = e.target.files;
    if (!files?.length) return;
    setBusy(true); setError("");
    const err = await uploadTaskFiles(task, me, files);
    setBusy(false);
    if (input.current) input.current.value = "";
    if (err) setError(err);
    refresh();
  };
  const openList = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    setPos({ top: r.bottom + 4 > window.innerHeight - 220 ? Math.max(r.top - 224, 8) : r.bottom + 4, left: Math.min(r.left, window.innerWidth - 300) });
  };

  return (
    <span className="inline-flex items-center gap-1">
      <input ref={input} type="file" multiple hidden onChange={pick} />
      <button type="button" disabled={!canUpload || busy} onClick={() => input.current?.click()}
        title={canUpload ? "Attach files from your computer" : "You cannot attach files to this task"}
        className="grid h-8 w-8 place-items-center rounded-lg text-slate-300 hover:bg-slate-700 hover:text-blue-300 disabled:opacity-40">
        {busy ? <LoaderCircle size={16} className="animate-spin" /> : <Paperclip size={16} />}
      </button>
      {count > 0 && (
        <button type="button" onClick={openList} className="rounded-full bg-blue-500/20 px-2 py-0.5 text-xs font-semibold text-blue-300 hover:bg-blue-500/30">{count}</button>
      )}
      {error && <span className="max-w-[160px] truncate text-xs text-red-400" title={error}>{error}</span>}
      {pos && <FileList task={task} me={me} canRemove={canUpload} pos={pos} onClose={() => setPos(null)} onChanged={refresh} />}
    </span>
  );
}

function FileList({ task, me, canRemove, pos, onClose, onChanged }) {
  const { data: files = [] } = useQuery({
    queryKey: ["task-attachments", task.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("task_attachments").select("*").eq("task_id", task.id).order("created_at");
      if (error) throw error;
      return data || [];
    },
  });
  const [error, setError] = useState("");
  const open = async (f) => {
    const { data, error: err } = await supabase.storage.from("task-files").createSignedUrl(f.file_path, 300);
    if (err) return setError(err.message);
    window.open(data.signedUrl, "_blank", "noopener");
  };
  const remove = async (f) => {
    if (!window.confirm(`Remove ${f.file_name}?`)) return;
    const { error: err } = await supabase.from("task_attachments").delete().eq("id", f.id);
    if (err) return setError(err.message);
    await supabase.storage.from("task-files").remove([f.file_path]);
    onChanged();
  };
  return (
    <>
      <div className="fixed inset-0 z-[80]" onClick={onClose} />
      <div style={{ top: pos.top, left: pos.left }} className="fixed z-[81] w-72 rounded-xl border border-slate-700 bg-[#0D172A] p-2 shadow-2xl">
        <p className="px-2 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Files on this task</p>
        {error && <p className="px-2 pb-1 text-xs text-red-400">{error}</p>}
        <ul className="max-h-48 overflow-y-auto">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-800">
              <Paperclip size={13} className="shrink-0 text-slate-500" />
              <span className="min-w-0 flex-1 truncate text-slate-200" title={f.file_name}>{f.file_name}</span>
              <button onClick={() => open(f)} aria-label="Open" className="text-blue-400"><Download size={14} /></button>
              {(f.uploader_id === me.id || canRemove) && <button onClick={() => remove(f)} aria-label="Remove" className="text-red-400"><Trash2 size={14} /></button>}
            </li>
          ))}
          {files.length === 0 && <li className="px-2 py-2 text-xs text-slate-500">No files yet.</li>}
        </ul>
      </div>
    </>
  );
}
