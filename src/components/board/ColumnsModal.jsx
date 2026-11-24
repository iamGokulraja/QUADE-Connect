import { useState } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { supabase } from "../../lib/supabaseClient";
import { ErrorBox, Modal, btnGhost, inputCls } from "../ui";

// Customize the columns of one board: show / hide, rename, reorder, and add or remove custom columns.
export default function ColumnsModal({ board, columns, onClose }) {
  const client = useQueryClient();
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState("text");
  const list = [...columns].filter((c) => c.board_id === board.id).sort((a, b) => a.position - b.position);

  const run = async (promise) => {
    const { error: err } = await promise;
    if (err) return setError(err.message);
    setError("");
    client.invalidateQueries({ queryKey: ["board-columns"] });
  };
  const update = (c, values) => run(supabase.from("board_columns").update(values).eq("id", c.id));
  const rename = (c) => {
    const v = window.prompt("Column name", c.name);
    if (v?.trim()) update(c, { name: v.trim() });
  };
  const move = async (c, dir) => {
    const other = list[list.indexOf(c) + dir];
    if (!other) return;
    await run(supabase.from("board_columns").update({ position: other.position }).eq("id", c.id));
    await run(supabase.from("board_columns").update({ position: c.position }).eq("id", other.id));
  };
  const add = async () => {
    if (!name.trim()) return;
    await run(supabase.from("board_columns").insert({ board_id: board.id, column_key: "custom", name: name.trim(), column_type: type, position: (list.at(-1)?.position ?? 0) + 1 }));
    setName("");
  };
  const remove = (c) => window.confirm(`Delete column "${c.name}"? Its values are removed from the tasks.`) && run(supabase.from("board_columns").delete().eq("id", c.id));

  return (
    <Modal title="Customize columns" subtitle={board.name} onClose={onClose} footer={<button className={btnGhost} onClick={onClose}>Done</button>}>
      <ErrorBox error={error} />
      <ul className="divide-y divide-slate-700/60 text-sm">
        {list.map((c, i) => (
          <li key={c.id} className="flex items-center gap-2 py-2">
            <button onClick={() => update(c, { is_visible: !c.is_visible })} disabled={c.column_key === "name"} aria-label="Show or hide" className={c.is_visible ? "text-blue-300" : "text-slate-600"}>
              {c.is_visible ? <Eye size={16} /> : <EyeOff size={16} />}
            </button>
            <button onClick={() => rename(c)} className="min-w-0 flex-1 truncate text-left text-white hover:text-blue-300">{c.name}</button>
            <span className="text-xs text-slate-500">{c.is_default ? "default" : c.column_type}</span>
            <button disabled={i === 0} onClick={() => move(c, -1)} className="text-slate-400 disabled:opacity-30" aria-label="Move up"><ArrowUp size={15} /></button>
            <button disabled={i === list.length - 1} onClick={() => move(c, 1)} className="text-slate-400 disabled:opacity-30" aria-label="Move down"><ArrowDown size={15} /></button>
            {!c.is_default && <button onClick={() => remove(c)} className="text-red-400" aria-label="Delete column"><Trash2 size={15} /></button>}
          </li>
        ))}
      </ul>
      <div className="mt-4 flex gap-2">
        <input className={inputCls} placeholder="New column name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <select className={`${inputCls} !w-28`} value={type} onChange={(e) => setType(e.target.value)}>
          <option value="text">Text</option><option value="number">Number</option><option value="date">Date</option>
        </select>
        <button className={btnGhost} onClick={add}><Plus size={16} /></button>
      </div>
    </Modal>
  );
}
