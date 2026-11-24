import { useState } from "react";
import { Lock, Pencil, Trash2 } from "lucide-react";

import toast from "../../lib/toast";
import { fmtMomentDate } from "../../lib/moments";
import { deleteMoment, useMomentsRefresh } from "../../hooks/moments";
import { Modal, btnGhost } from "../ui";
import MediaThumb from "./MediaThumb";
import { CATEGORY_PILL } from "./MomentCard";

// Full view of one moment: every photo / video, the whole text, edit and delete.
export default function MomentViewer({ moment, onEdit, onClose }) {
  const refresh = useMomentsRefresh();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const media = [...(moment.moment_media || [])].sort((a, b) => a.created_at.localeCompare(b.created_at));

  const remove = async () => {
    setBusy(true);
    try { await deleteMoment(moment); await refresh(); toast.success("Moment deleted."); onClose(); }
    catch (e) { toast.error(e.message || "Could not delete."); setBusy(false); }
  };

  return (
    <Modal wide title={moment.category} subtitle={fmtMomentDate(moment.moment_date)} onClose={onClose}
      footer={confirm ? (
        <>
          <span className="mr-auto self-center text-sm text-slate-300">Delete this moment and its files?</span>
          <button className={btnGhost} onClick={() => setConfirm(false)} disabled={busy}>Keep it</button>
          <button className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50" onClick={remove} disabled={busy}>{busy ? "Deleting…" : "Yes, delete"}</button>
        </>
      ) : (
        <>
          <span className="mr-auto flex items-center gap-1.5 self-center text-xs text-slate-500"><Lock size={12} /> Only you can see this</span>
          <button className={btnGhost} onClick={() => setConfirm(true)}><Trash2 size={15} className="text-red-400" /> Delete</button>
          <button className={btnGhost} onClick={() => onEdit(moment)}><Pencil size={15} /> Edit</button>
        </>
      )}>
      {media.length > 0 && (
        <div className="space-y-3">
          {media.map((m) => <MediaThumb key={m.id} path={m.storage_path} type={m.media_type} name={m.file_name} full className="max-h-[70vh] w-full rounded-xl" />)}
        </div>
      )}
      {moment.caption && <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-200">{moment.caption}</p>}
      <span className={`inline-block rounded-full px-2.5 py-1 text-[11px] font-semibold ${CATEGORY_PILL[moment.category] || ""}`} data-keep-colors>{moment.category}</span>
    </Modal>
  );
}
