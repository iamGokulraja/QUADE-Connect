import { useState } from "react";
import { Plus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { supabase } from "../../lib/supabaseClient";
import { boardOwnerIds } from "../../lib/board";
import { personName } from "../../hooks/queries";
import { ErrorBox, Field, Modal, btnGhost, btnPrimary, inputCls } from "../ui";
import { Avatar, AvatarStack } from "./Avatars";

// Board tabs of one project: "All boards", each board, and "+ New board".
export default function BoardSwitcher({ boards, selected, onSelect, canCreate, onCreate, me, people }) {
  const tab = (active) => `inline-flex items-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-medium transition ${active ? "bg-blue-600 text-white shadow" : "bg-[#17243D] text-slate-300 hover:bg-slate-700"}`;
  return (
    <div className="border-b border-slate-700/70 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <button className={tab(selected === "all")} onClick={() => onSelect("all")}>All boards <span className="rounded-full bg-black/20 px-1.5 text-xs">{boards.length}</span></button>
        {boards.map((b) => {
          const owners = boardOwnerIds(b);
          return (
            <button key={b.id} className={tab(selected === b.id)} onClick={() => onSelect(b.id)} title={`Owners: ${owners.map((id) => personName(people, id)).join(", ")}`}>
              {b.name}
              {!(owners.length === 1 && owners[0] === me.id) && <AvatarStack ids={owners} people={people} max={2} size={20} />}
            </button>
          );
        })}
        {canCreate && (
          <button onClick={onCreate} className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-blue-500/50 px-3.5 py-2 text-sm font-medium text-blue-300 hover:bg-blue-500/10">
            <Plus size={15} /> New board
          </button>
        )}
      </div>
    </div>
  );
}

// People who can own a board of this team: the Team Lead and the employees.
function OwnerChips({ ids, value, onChange, people }) {
  const toggle = (id) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {ids.map((id) => {
        const on = value.includes(id);
        return (
          <button type="button" key={id} onClick={() => toggle(id)}
            className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 text-left text-sm transition ${on ? "border-blue-500 bg-blue-500/10" : "border-slate-700 hover:border-slate-500"}`}>
            <Avatar id={id} people={people} size={28} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-white">{personName(people, id)}</span>
              <span className="text-[11px] text-slate-500">{people[id]?.role === "team_lead" ? "Team Lead" : "Employee"}</span>
            </span>
            <span className={`h-4 w-4 rounded-full border ${on ? "border-blue-400 bg-blue-500" : "border-slate-600"}`} />
          </button>
        );
      })}
    </div>
  );
}

// New board / edit board.
//  Employee        : creates a board for themselves only
//  Team Lead       : picks the owners (themselves and / or employees of the team)
//  Project Manager : picks the owners (Team Lead and / or employees of any assigned team)
export function BoardForm({ title, project, board, teamOptions = [], teamPeople = {}, people = {}, me, onClose, onSaved }) {
  const [form, setForm] = useState({ name: board?.name || "", description: board?.description || "", team_id: teamOptions[0]?.id || "" });
  const choosers = me.role === "team_lead" || me.role === "project_manager";
  const [owners, setOwners] = useState(me.role === "team_lead" ? [me.id] : []);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const people_ = (teamPeople[form.team_id] || []).filter((id) => me.role === "project_manager" || me.role === "team_lead" || id === me.id);

  const save = async () => {
    if (!form.name.trim()) return setError("Board name is required.");
    setBusy(true);
    let res;
    if (board) {
      res = await supabase.from("task_boards").update({ name: form.name.trim(), description: form.description.trim() || null }).eq("id", board.id).select().single();
    } else {
      if (choosers && owners.length === 0) { setBusy(false); return setError("Choose at least one board owner."); }
      res = await supabase.rpc("create_board", { p_project: project.id, p_team: form.team_id, p_name: form.name.trim(), p_description: form.description.trim(), p_owners: choosers ? owners : [me.id] });
    }
    setBusy(false);
    if (res.error) return setError(res.error.message);
    onSaved(res.data);
  };

  return (
    <Modal title={title} subtitle={project?.name} onClose={onClose}
      footer={<><button className={btnGhost} onClick={onClose}>Cancel</button><button className={btnPrimary} disabled={busy} onClick={save}>{busy ? "Saving..." : board ? "Save board" : "Create board"}</button></>}>
      <ErrorBox error={error} />
      <Field label="Board name"><input autoFocus className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Backend" /></Field>
      <Field label="Description (optional)"><textarea rows={2} className={inputCls} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
      {!board && teamOptions.length > 1 && (
        <Field label="Team"><select className={inputCls} value={form.team_id} onChange={(e) => { setForm({ ...form, team_id: e.target.value }); setOwners(me.role === "team_lead" ? [me.id] : []); }}>
          {teamOptions.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
      )}
      {!board && choosers && (
        <Field label="Board owners">
          <OwnerChips ids={people_} value={owners} onChange={setOwners} people={people} />
          <p className="mt-2 text-xs text-slate-500">Owners see the board, add their own tasks and join its discussion. Tasks can only be given to owners.</p>
        </Field>
      )}
      {!board && !choosers && (
        <p className="flex items-center gap-2 rounded-xl bg-[#0D172A] px-3 py-2.5 text-sm text-slate-300"><Avatar id={me.id} people={{ [me.id]: me }} size={24} /> You will be the owner of this board.</p>
      )}
    </Modal>
  );
}

// New board inside a project.
export function CreateBoardModal({ project, teamOptions = [], teamPeople = {}, people = {}, me, onClose, onCreated }) {
  const client = useQueryClient();
  return (
    <BoardForm title="Create board" project={project} teamOptions={teamOptions} teamPeople={teamPeople} people={people} me={me} onClose={onClose}
      onSaved={(b) => { ["boards", "groups", "board-columns"].forEach((k) => client.invalidateQueries({ queryKey: [k] })); onCreated(b); }} />
  );
}
