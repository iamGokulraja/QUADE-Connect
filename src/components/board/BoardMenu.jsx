import { useState } from "react";
import { Columns3, EllipsisVertical, Info, Pencil, Trash2, UserRound } from "lucide-react";

import { ROLE_LABEL } from "../../lib/constants";
import { boardOwnerIds } from "../../lib/board";
import { fmtDate } from "../../lib/utils";
import { personName } from "../../hooks/queries";
import { Modal, btnGhost } from "../ui";
import { AvatarStack } from "./Avatars";

// The "⋮" menu of a board: Details for everyone, management actions for the person who created it.
export default function BoardMenu({ board, project, team, people, taskCount, perms, canOwners, onEdit, onOwners, onColumns, onDelete }) {
  const [open, setOpen] = useState(false);
  const [details, setDetails] = useState(false);
  const item = "flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm hover:bg-slate-800";
  const go = (fn) => () => { setOpen(false); fn(); };

  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} aria-label="Board options" aria-expanded={open}
        className="grid h-9 w-9 place-items-center rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-800 hover:text-white">
        <EllipsisVertical size={17} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-xl border border-slate-700 bg-[#0D172A] py-1 shadow-2xl">
            <button className={`${item} text-slate-200`} onClick={go(() => setDetails(true))}><Info size={15} className="text-blue-300" /> Details</button>
            {perms.manage && (
              <>
                <button className={`${item} text-slate-200`} onClick={go(onEdit)}><Pencil size={15} className="text-slate-400" /> Edit board</button>
                {canOwners && <button className={`${item} text-slate-200`} onClick={go(onOwners)}><UserRound size={15} className="text-slate-400" /> Board owners</button>}
                <button className={`${item} text-slate-200`} onClick={go(onColumns)}><Columns3 size={15} className="text-slate-400" /> Customize columns</button>
                <div className="my-1 border-t border-slate-700" />
                <button className={`${item} text-red-400`} onClick={go(onDelete)}><Trash2 size={15} /> Delete board</button>
              </>
            )}
          </div>
        </>
      )}
      {details && (
        <Modal title={board.name} subtitle="Board details" onClose={() => setDetails(false)} footer={<button className={btnGhost} onClick={() => setDetails(false)}>Close</button>}>
          <dl className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-3 text-sm">
            <dt className="text-slate-500">Project</dt><dd className="text-white">{project?.name || "—"}</dd>
            <dt className="text-slate-500">Team</dt><dd className="text-white">{team?.name || "—"}</dd>
            <dt className="text-slate-500">Owners</dt>
            <dd className="text-white">
              <div className="flex items-center gap-2"><AvatarStack ids={boardOwnerIds(board)} people={people} max={5} size={28} /></div>
              <p className="mt-1 text-slate-300">{boardOwnerIds(board).map((id) => personName(people, id)).join(", ")}</p>
            </dd>
            <dt className="text-slate-500">Created by</dt>
            <dd className="text-white">{personName(people, board.created_by || board.owner_id)}{board.created_by_role ? <span className="text-slate-400"> · {ROLE_LABEL[board.created_by_role] || board.created_by_role}</span> : null}</dd>
            <dt className="text-slate-500">Created on</dt><dd className="text-white">{fmtDate(board.created_at)}</dd>
            <dt className="text-slate-500">Tasks</dt><dd className="text-white">{taskCount}</dd>
            <dt className="text-slate-500">Description</dt><dd className="whitespace-pre-wrap text-slate-300">{board.description || "—"}</dd>
          </dl>
        </Modal>
      )}
    </div>
  );
}
