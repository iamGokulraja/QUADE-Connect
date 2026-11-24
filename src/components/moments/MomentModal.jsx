import { useEffect, useRef, useState } from "react";
import { ImagePlus, Lock, X } from "lucide-react";

import toast from "../../lib/toast";
import { todayStr } from "../../lib/utils";
import { ACCEPT, MAX_FILES, MAX_IMAGE_MB, MAX_VIDEO_MB, MOMENT_CATEGORIES, mediaTypeOf, validateMedia } from "../../lib/moments";
import { createMoment, updateMoment, useMomentsRefresh } from "../../hooks/moments";
import { Modal, inputCls, btnGhost, btnPrimary } from "../ui";

// Add a moment (text + photos / videos) or edit the text / category / date of an existing one.
export default function MomentModal({ userId, moment, defaultCategory = "", onClose }) {
  const editing = !!moment;
  const refresh = useMomentsRefresh();
  const input = useRef(null);
  const [caption, setCaption] = useState(moment?.caption || "");
  const [category, setCategory] = useState(moment?.category || defaultCategory || MOMENT_CATEGORIES[0]);
  const [date, setDate] = useState(moment?.moment_date || todayStr());
  const [files, setFiles] = useState([]);          // [{ file, url, type }]
  const [progress, setProgress] = useState(null);  // { index, fraction }
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);

  useEffect(() => () => files.forEach((f) => URL.revokeObjectURL(f.url)), []); // eslint-disable-line

  const add = (list) => {
    const ok = [];
    for (const file of Array.from(list)) {
      const problem = validateMedia(file);
      if (problem) { toast.error(problem); continue; }
      ok.push({ file, url: URL.createObjectURL(file), type: mediaTypeOf(file) });
    }
    const room = MAX_FILES - files.length;
    if (ok.length > room) { toast.error(`You can add up to ${MAX_FILES} photos / videos.`); ok.slice(room).forEach((o) => URL.revokeObjectURL(o.url)); }
    setFiles((cur) => [...cur, ...ok.slice(0, Math.max(room, 0))]);
  };
  const drop = (i) => setFiles((cur) => { URL.revokeObjectURL(cur[i].url); return cur.filter((_, k) => k !== i); });

  const canSave = !busy && (caption.trim() || files.length > 0 || (editing && moment.moment_media?.length > 0));

  const save = async () => {
    setBusy(true);
    try {
      if (editing) await updateMoment(moment.id, { caption: caption.trim(), category, moment_date: date });
      else await createMoment({ userId, caption: caption.trim(), category, moment_date: date, files: files.map((f) => f.file), onProgress: (index, fraction) => setProgress({ index, fraction }) });
      await refresh();
      toast.success(editing ? "Moment updated." : "Moment saved.");
      onClose(true);
    } catch (e) { toast.error(e.message || "Could not save your moment."); setBusy(false); setProgress(null); }
  };

  return (
    <Modal title={editing ? "Edit moment" : "Add a moment"} subtitle="Private: only you can see your moments." onClose={() => !busy && onClose(false)}
      footer={<><button className={btnGhost} onClick={() => onClose(false)} disabled={busy}>Cancel</button>
        <button className={btnPrimary} onClick={save} disabled={!canSave}>{busy ? (progress ? `Uploading ${progress.index + 1}/${files.length} · ${Math.round(progress.fraction * 100)}%` : "Saving…") : editing ? "Save changes" : "Save moment"}</button></>}>
      <label className="block text-sm text-slate-300">What happened?
        <textarea rows={4} maxLength={2000} value={caption} onChange={(e) => setCaption(e.target.value)} className={`${inputCls} mt-1 resize-none`} />
        <span className="mt-1 block text-right text-[11px] text-slate-500">{caption.length}/2000</span>
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm text-slate-300">Category
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={`${inputCls} mt-1`}>
            {MOMENT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label className="block text-sm text-slate-300">Date of the moment
          <input type="date" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value || todayStr())} className={`${inputCls} mt-1`} />
        </label>
      </div>

      {!editing ? (
        <div>
          <input ref={input} type="file" hidden multiple accept={ACCEPT} onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
          <div onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); }}
            className={`rounded-xl border-2 border-dashed p-5 text-center transition ${over ? "border-blue-500 bg-blue-500/10" : "border-slate-600"}`}>
            <button type="button" onClick={() => input.current?.click()} disabled={busy || files.length >= MAX_FILES}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-700/60 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50">
              <ImagePlus size={16} /> Add photos or videos
            </button>
            <p className="mt-2 text-xs text-slate-500">JPG, PNG, WEBP, GIF (up to {MAX_IMAGE_MB} MB) · MP4, WEBM, MOV (up to {MAX_VIDEO_MB} MB) · max {MAX_FILES} files. You can also drop them here.</p>
          </div>
          {files.length > 0 && (
            <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
              {files.map((f, i) => (
                <div key={f.url} className="relative aspect-square overflow-hidden rounded-lg bg-black">
                  {f.type === "video" ? <video src={`${f.url}#t=0.1`} muted preload="metadata" className="h-full w-full object-cover" /> : <img src={f.url} alt="" className="h-full w-full object-cover" />}
                  {f.type === "video" && <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 text-[10px] font-semibold text-white">VIDEO</span>}
                  {!busy && <button onClick={() => drop(i)} aria-label="Remove" className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white"><X size={13} /></button>}
                  {busy && progress?.index === i && <span className="absolute inset-x-0 bottom-0 h-1 bg-blue-500" style={{ width: `${progress.fraction * 100}%` }} />}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <p className="rounded-lg bg-slate-800/60 p-3 text-xs text-slate-400">Photos and videos can't be changed after saving. To change them, delete this moment and add it again.</p>
      )}
      <p className="flex items-center gap-1.5 text-xs text-slate-500"><Lock size={12} /> Stored in a private folder that only your account can open.</p>
    </Modal>
  );
}
