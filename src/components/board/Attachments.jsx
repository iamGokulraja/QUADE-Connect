import { useRef, useState } from "react";
import { Paperclip, Trash2, Download } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "../../lib/supabaseClient";
import { ErrorBox } from "../ui";

const MAX_MB = 10;

// Uploads files to a task. Returns an error message (or "" when everything worked).
export async function uploadTaskFiles(task, me, list) {
  let problem = "";
  for (const file of Array.from(list)) {
    if (file.size > MAX_MB * 1024 * 1024) { problem = `${file.name} is larger than ${MAX_MB} MB.`; continue; }
    const safe = file.name.replace(/[^\w.\-]+/g, "_");
    const path = `${task.id}/${crypto.randomUUID()}-${safe}`;
    const { error: e1 } = await supabase.storage.from("task-files").upload(path, file, { contentType: file.type || undefined });
    if (e1) { problem = e1.message; continue; }
    const { error: e2 } = await supabase.from("task_attachments").insert({ task_id: task.id, uploader_id: me.id, file_path: path, file_name: file.name, file_size: file.size });
    if (e2) { await supabase.storage.from("task-files").remove([path]); problem = e2.message; }
  }
  return problem;
}

// Files on a task, stored in the private "task-files" bucket (opened through short-lived signed links).
export default function Attachments({ task, me, canUpload }) {
  const client = useQueryClient();
  const input = useRef(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: files = [] } = useQuery({
    queryKey: ["task-attachments", task.id],
    queryFn: async () => {
      const { data, error: err } = await supabase.from("task_attachments").select("*").eq("task_id", task.id).order("created_at");
      if (err) throw err;
      return data || [];
    },
  });
  const refresh = () => client.invalidateQueries({ queryKey: ["task-attachments", task.id] });

  const upload = async (list) => {
    setError("");
    setBusy(true);
    const err = await uploadTaskFiles(task, me, list);
    setBusy(false);
    if (err) setError(err);
    if (input.current) input.current.value = "";
    refresh();
  };

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
    refresh();
  };

  return (
    <div>
      <ErrorBox error={error} />
      <ul className="space-y-1.5 text-sm">
        {files.map((f) => (
          <li key={f.id} className="flex items-center gap-3">
            <Paperclip size={14} className="shrink-0 text-slate-500" />
            <span className="min-w-0 flex-1 truncate text-slate-200">{f.file_name}</span>
            <button onClick={() => open(f)} aria-label="Download" className="text-blue-400"><Download size={15} /></button>
            {(f.uploader_id === me.id || canUpload) && <button onClick={() => remove(f)} aria-label="Remove" className="text-red-400"><Trash2 size={15} /></button>}
          </li>
        ))}
        {files.length === 0 && <li className="text-xs text-slate-500">No attachments.</li>}
      </ul>
      {canUpload && (
        <>
          <input ref={input} type="file" multiple hidden onChange={(e) => upload(e.target.files)} />
          <button onClick={() => input.current?.click()} disabled={busy} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50">
            <Paperclip size={15} /> {busy ? "Uploading…" : "Attach files"}
          </button>
        </>
      )}
    </div>
  );
}
