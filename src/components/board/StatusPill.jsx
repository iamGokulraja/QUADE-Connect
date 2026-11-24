import { useState } from "react";
import { PRIORITIES, PRIORITY_LABEL, TASK_STATUSES } from "../../lib/constants";
import { PRIORITY_COLORS, STATUS_COLORS } from "../../lib/board";

// Monday-style coloured label. Click it and a menu of every label opens; pick one to change it.
function LabelMenu({ options, value, onChange, disabled, block }) {
  const [pos, setPos] = useState(null);
  const current = options.find((o) => o.key === value) || options[0];

  const open = (e) => {
    if (disabled) return;
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    const menuHeight = options.length * 40 + 12;
    const top = r.bottom + menuHeight > window.innerHeight ? Math.max(r.top - menuHeight, 8) : r.bottom + 4;
    setPos({ top, left: Math.min(r.left, window.innerWidth - 190), width: Math.max(r.width, 170) });
  };

  return (
    <>
      <button type="button" onClick={open} disabled={disabled}
        style={{ background: current.color }}
        className={`${block ? "w-full" : "min-w-[120px]"} truncate rounded-md px-3 py-1.5 text-center text-xs font-semibold text-white ${disabled ? "cursor-default" : "hover:brightness-110"}`}>
        {current.label}
      </button>
      {pos && (
        <>
          <div className="fixed inset-0 z-[80]" onClick={(e) => { e.stopPropagation(); setPos(null); }} />
          <ul style={{ top: pos.top, left: pos.left, width: pos.width }} className="fixed z-[81] space-y-1.5 rounded-xl border border-slate-700 bg-[#0D172A] p-2 shadow-2xl">
            {options.map((o) => (
              <li key={o.key}>
                <button type="button" style={{ background: o.color }}
                  onClick={(e) => { e.stopPropagation(); setPos(null); if (o.key !== value) onChange(o.key); }}
                  className={`w-full rounded-md px-3 py-2 text-center text-xs font-semibold text-white hover:brightness-110 ${o.key === value ? "ring-2 ring-white/70" : ""}`}>
                  {o.label}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

const STATUS_OPTIONS = TASK_STATUSES.map((s) => ({ ...s, color: STATUS_COLORS[s.key] }));
const PRIORITY_OPTIONS = PRIORITIES.map((p) => ({ key: p, label: PRIORITY_LABEL[p], color: PRIORITY_COLORS[p] }));

export const StatusPill = (props) => <LabelMenu options={STATUS_OPTIONS} {...props} />;
export const PriorityPill = (props) => <LabelMenu options={PRIORITY_OPTIONS} {...props} />;
