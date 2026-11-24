import { useState } from "react";
import { Check } from "lucide-react";

import { personName } from "../../hooks/queries";
import { AvatarStack, Avatar } from "./Avatars";

// Owners of a task: avatars + names. When `onChange` is given, clicking opens a list of the board's owners to tick.
export default function OwnerPicker({ value = [], options = [], people, onChange, up = false }) {
  const [pos, setPos] = useState(null);
  const names = value.map((id) => personName(people, id).split(" ")[0]).join(", ");
  const face = (
    <span className="inline-flex items-center gap-2">
      <AvatarStack ids={value} people={people} size={24} />
      <span className="max-w-[130px] truncate text-slate-300">{names}</span>
    </span>
  );
  if (!onChange) return face;

  const open = (e) => {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    const h = options.length * 44 + 56;
    const top = up || r.bottom + h > window.innerHeight ? Math.max(r.top - h - 4, 8) : r.bottom + 4;
    setPos({ top, left: Math.min(r.left, window.innerWidth - 270) });
  };
  const toggle = (id) => {
    const next = value.includes(id) ? value.filter((x) => x !== id) : [...value, id];
    if (next.length) onChange(next);
  };

  return (
    <>
      <button type="button" onClick={open} title="Change owners" className="rounded-lg px-1.5 py-1 hover:bg-slate-700/60">{face}</button>
      {pos && (
        <>
          <div className="fixed inset-0 z-[80]" onClick={(e) => { e.stopPropagation(); setPos(null); }} />
          <div style={{ top: pos.top, left: pos.left }} className="fixed z-[81] w-64 rounded-xl border border-slate-700 bg-[#0D172A] p-2 shadow-2xl">
            <p className="px-2 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Task owners (board owners only)</p>
            {options.map((id) => {
              const on = value.includes(id);
              return (
                <button key={id} type="button" onClick={() => toggle(id)} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm hover:bg-slate-800">
                  <Avatar id={id} people={people} size={26} />
                  <span className="min-w-0 flex-1 truncate text-slate-200">{personName(people, id)}</span>
                  <span className={`grid h-5 w-5 place-items-center rounded border ${on ? "border-blue-500 bg-blue-600 text-white" : "border-slate-600"}`}>{on && <Check size={13} />}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
