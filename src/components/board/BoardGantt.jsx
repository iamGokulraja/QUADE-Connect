import { useMemo } from "react";
import { STATUS_COLORS, addDays, dayDiff, groupColor, taskOwnerIds, taskSpan } from "../../lib/board";
import { todayStr, topLevel } from "../../lib/utils";
import { personName } from "../../hooks/queries";

const DAY = 34;       // pixel width of one day
const LABEL = 250;    // width of the sticky task-name column
const ROW = 40;

// Gantt view: a bar for every task from its start date to its due date, coloured by status.
export default function BoardGantt({ tasks, groups = [], boards = [], people, onOpen }) {
  const today = todayStr();
  const list = topLevel(tasks);
  const dated = list.filter((t) => taskSpan(t));
  const undated = list.filter((t) => !taskSpan(t));

  const { first, days, months } = useMemo(() => {
    const spans = dated.map(taskSpan);
    const lo = [today, ...spans.map((s) => s.start)].sort()[0];
    const hi = [today, ...spans.map((s) => s.end)].sort().slice(-1)[0];
    const start = addDays(lo, -3);
    const count = Math.max(dayDiff(addDays(hi, 7), start), 21);
    const dayList = Array.from({ length: count }, (_, i) => addDays(start, i));
    const monthList = [];
    dayList.forEach((d, i) => {
      const label = new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
      const last = monthList[monthList.length - 1];
      if (last && last.label === label) last.span += 1; else monthList.push({ label, span: 1, index: i });
    });
    return { first: start, days: dayList, months: monthList };
  }, [dated, today]);

  // sections: by group when the list is one board, otherwise by board
  const sections = groups.length
    ? [...groups.map((g, i) => ({ id: g.id, name: g.name, color: groupColor(i), items: dated.filter((t) => t.group_id === g.id) })),
       { id: "none", name: "No group", color: "#797E93", items: dated.filter((t) => !groups.some((g) => g.id === t.group_id)) }]
    : boards.length > 1
      ? boards.map((b, i) => ({ id: b.id, name: b.name, color: groupColor(i), items: dated.filter((t) => t.board_id === b.id) }))
      : [{ id: "all", name: "", color: "#579BFC", items: dated }];
  const shown = sections.filter((s) => s.items.length);

  if (dated.length === 0) return <p className="p-10 text-center text-sm text-slate-500">Add a start or due date to tasks to see them on the timeline.</p>;
  const width = days.length * DAY;
  const todayX = dayDiff(today, first) * DAY + DAY / 2;

  return (
    <div className="overflow-x-auto">
      <div style={{ width: LABEL + width }} className="relative">
        {/* header */}
        <div className="sticky top-0 z-20 flex bg-[#111C32]">
          <div style={{ width: LABEL }} className="sticky left-0 z-30 shrink-0 border-b border-r border-slate-700 bg-[#111C32] px-4 py-3 text-xs uppercase tracking-wider text-slate-400">Task</div>
          <div style={{ width }} className="border-b border-slate-700">
            <div className="flex">{months.map((m) => <div key={m.index} style={{ width: m.span * DAY }} className="border-r border-slate-700/60 px-2 py-1 text-xs font-semibold text-slate-300">{m.label}</div>)}</div>
            <div className="flex">{days.map((d) => {
              const dt = new Date(`${d}T00:00:00`);
              return <div key={d} style={{ width: DAY }} className={`py-1 text-center text-[10px] ${d === today ? "bg-red-500/20 font-bold text-red-300" : [0, 6].includes(dt.getDay()) ? "bg-slate-800/60 text-slate-500" : "text-slate-500"}`}>{dt.getDate()}</div>;
            })}</div>
          </div>
        </div>

        {/* today line */}
        <div style={{ left: LABEL + todayX, top: 56, bottom: 0 }} className="pointer-events-none absolute z-10 w-px bg-red-500/70" />

        {shown.map((s) => (
          <div key={s.id}>
            {s.name && (
              <div className="flex">
                <div style={{ width: LABEL, color: s.color, borderLeft: `4px solid ${s.color}` }} className="sticky left-0 z-10 shrink-0 bg-[#17243D] px-3 py-2 text-sm font-semibold">{s.name}</div>
                <div style={{ width }} className="bg-[#17243D]/60" />
              </div>
            )}
            {s.items.map((t) => {
              const sp = taskSpan(t);
              const left = dayDiff(sp.start, first) * DAY;
              const w = (dayDiff(sp.end, sp.start) + 1) * DAY;
              const color = STATUS_COLORS[t.status];
              return (
                <div key={t.id} style={{ height: ROW }} className="flex border-b border-slate-800">
                  <button onClick={() => onOpen(t)} style={{ width: LABEL }} className="sticky left-0 z-10 flex shrink-0 items-center gap-2 border-r border-slate-700 bg-[#111C32] px-3 text-left hover:bg-[#17243D]">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
                    <span className="min-w-0 flex-1 truncate text-sm text-white">{t.title}</span>
                    <span className="shrink-0 text-[11px] text-slate-500">{taskOwnerIds(t).map((id) => personName(people, id).split(" ")[0]).join(", ")}</span>
                  </button>
                  <div style={{ width }} className="relative"
                    >
                    <div style={{ backgroundImage: `repeating-linear-gradient(90deg, transparent 0, transparent ${DAY - 1}px, rgba(148,163,184,.08) ${DAY - 1}px, rgba(148,163,184,.08) ${DAY}px)` }} className="absolute inset-0" />
                    <button onClick={() => onOpen(t)} title={t.title}
                      style={{ left, width: Math.max(w - 4, 14), background: color, borderColor: color }}
                      className="absolute top-2 h-6 overflow-hidden rounded-md border text-left">
                      <span className="relative truncate px-2 text-[11px] font-semibold text-white">{w > 90 ? t.title : ""}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {undated.length > 0 && <p className="border-t border-slate-700 p-4 text-xs text-slate-500">{undated.length} task(s) have no dates and are not shown: {undated.slice(0, 6).map((t) => t.title).join(", ")}{undated.length > 6 ? "…" : ""}</p>}
    </div>
  );
}
