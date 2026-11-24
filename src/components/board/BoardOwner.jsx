import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";

import { supabase } from "../../lib/supabaseClient";
import { boardOwnerIds } from "../../lib/board";
import { personName } from "../../hooks/queries";
import { ErrorBox, Modal, btnGhost, btnPrimary } from "../ui";
import { Avatar } from "./Avatars";

// The owners of a board and the people of its team. The person who created the board (a Team Lead or Project Manager)
// ticks who owns it; employees cannot hand their own board to anyone. Task owners are always chosen from these owners.
export default function BoardOwner({ board, canChange, teamPeople, people, onClose }) {
  const client = useQueryClient();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState(boardOwnerIds(board));
  const changed = sel.length !== boardOwnerIds(board).length || sel.some((id) => !boardOwnerIds(board).includes(id));

  const toggle = (id) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const save = async () => {
    if (!sel.length) return setError("A board needs at least one owner.");
    setBusy(true);
    const { error: err } = await supabase.rpc("set_board_owners", { p_board: board.id, p_owners: sel });
    setBusy(false);
    if (err) return setError(err.message);
    ["boards", "tasks"].forEach((k) => client.invalidateQueries({ queryKey: [k] }));
    onClose();
  };

  return (
    <Modal title="Board owners" subtitle={board.name} onClose={onClose}
      footer={canChange
        ? <><button className={btnGhost} onClick={onClose}>Cancel</button><button className={btnPrimary} disabled={busy || !changed} onClick={save}>{busy ? "Saving..." : "Save owners"}</button></>
        : <button className={btnGhost} onClick={onClose}>Close</button>}>
      <ErrorBox error={error} />
      <p className="text-xs leading-relaxed text-slate-400">
        Board owners can see this board, add tasks for themselves and take part in its discussion. A task can only be given to a board owner.
        {canChange ? " Tick the people who should own this board." : " The person who created the board chooses its owners."}
      </p>
      <ul className="divide-y divide-slate-700/60 text-sm">
        {teamPeople.map((id) => {
          const on = canChange ? sel.includes(id) : boardOwnerIds(board).includes(id);
          return (
            <li key={id}>
              <button disabled={!canChange} onClick={() => toggle(id)} className="flex w-full items-center gap-3 py-2.5 text-left enabled:hover:bg-slate-800/60">
                <Avatar id={id} people={people} size={34} />
                <span className="flex-1">
                  <span className="block font-medium text-white">{personName(people, id)}</span>
                  <span className="text-xs text-slate-500">{people[id]?.role === "team_lead" ? "Team Lead" : "Employee"}</span>
                </span>
                {canChange
                  ? <span className={`grid h-6 w-6 place-items-center rounded-md border ${on ? "border-blue-500 bg-blue-600 text-white" : "border-slate-600"}`}>{on && <Check size={15} />}</span>
                  : on && <span className="rounded-full bg-blue-500/20 px-2.5 py-0.5 text-xs font-semibold text-blue-300">Owner</span>}
              </button>
            </li>
          );
        })}
        {teamPeople.length === 0 && <li className="py-3 text-slate-500">No team members found.</li>}
      </ul>
    </Modal>
  );
}
