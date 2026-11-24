import { TASK_STATUSES } from "../../lib/constants";
import { PRIORITY_COLORS, STATUS_COLORS, addDays, boardOwnerIds, taskOwnerIds } from "../../lib/board";
import { fmtDate, fmtHours, isOverdue, taskStats, todayStr, topLevel } from "../../lib/utils";
import { personName } from "../../hooks/queries";
import { Card, StatCard, StatGrid } from "../ui";
import { Columns, Donut, HBars } from "./charts";

// Dashboard view of a project (or one board): KPIs, status / priority / workload charts and task tables.
export default function BoardDashboard({ tasks, boards = [], teams = [], people, showTeams = true }) {
  const list = topLevel(tasks);
  const s = taskStats(list);
  const hours = list.reduce((a, t) => ({ est: a.est + Number(t.estimated_hours || 0), act: a.act + Number(t.actual_hours || 0) }), { est: 0, act: 0 });

  const byStatus = TASK_STATUSES.map((x) => ({ label: x.label, color: STATUS_COLORS[x.key], value: list.filter((t) => t.status === x.key).length }));
  const byPriority = ["urgent", "high", "medium", "low"].map((p) => ({ label: p[0].toUpperCase() + p.slice(1), color: PRIORITY_COLORS[p], value: list.filter((t) => t.priority === p).length }));

  const ownerIds = [...new Set(list.flatMap(taskOwnerIds))];
  const people_ = ownerIds.map((id) => {
    const mine = list.filter((t) => taskOwnerIds(t).includes(id));
    return { label: personName(people, id), value: taskStats(mine).completed, note: `${taskStats(mine).completed}/${mine.length} done${taskStats(mine).onHold ? ` · ${taskStats(mine).onHold} blocked` : ""}`, color: "#00C875", max: mine.length };
  });

  // tasks due in the next 6 weeks
  const monday = (() => { const t = todayStr(); const d = new Date(`${t}T00:00:00`); return addDays(t, -((d.getDay() + 6) % 7)); })();
  const weeks = Array.from({ length: 6 }, (_, i) => {
    const from = addDays(monday, i * 7), to = addDays(from, 6);
    return { label: new Date(`${from}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }), value: list.filter((t) => t.due_date && t.due_date >= from && t.due_date <= to && t.status !== "completed").length, color: i === 0 ? "#FDAB3D" : "#579BFC" };
  });

  const overdue = list.filter(isOverdue).sort((a, b) => a.due_date.localeCompare(b.due_date));
  const boardRows = boards.map((b) => {
    const bs = taskStats(list.filter((t) => t.board_id === b.id));
    return { b, ...bs };
  }).filter((r) => r.total > 0 || true);
  const teamRows = teams.map((t) => ({ t, ...taskStats(list.filter((x) => x.team_id === t.id)) }));

  return (
    <div className="space-y-6 p-4">
      <StatGrid>
        <StatCard label="Total tasks" value={s.total} />
        <StatCard label="Done" value={s.completed} tone="green" />
        <StatCard label="Working / review" value={s.inProgress} tone="blue" />
        <StatCard label="Blocked" value={s.onHold} tone="red" />
        <StatCard label="Overdue" value={s.overdue} tone="red" />
        <StatCard label="Hours (actual / est.)" value={`${fmtHours(hours.act)} / ${fmtHours(hours.est)}`} tone="slate" />
      </StatGrid>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Status"><div className="p-5"><Donut data={byStatus} center={s.total} /></div></Card>
        <Card title="Priority"><div className="p-5"><HBars rows={byPriority.map((r) => ({ ...r }))} empty="No tasks yet." /></div></Card>
        <Card title="Due per week (open tasks)"><div className="p-5"><Columns rows={weeks} /></div></Card>
        <Card title="Tasks done by person"><div className="p-5"><HBars rows={people_} empty="No assigned tasks yet." /></div></Card>
        <Card title="Hours by person (actual vs estimate)">
          <div className="p-5">
            <HBars rows={ownerIds.map((id) => {
              const mine = list.filter((t) => taskOwnerIds(t).includes(id));
              const est = mine.reduce((a, t) => a + Number(t.estimated_hours || 0), 0);
              const act = mine.reduce((a, t) => a + Number(t.actual_hours || 0), 0);
              return { label: personName(people, id), value: act, max: Math.max(est, act, 1), note: `${fmtHours(act)} / ${fmtHours(est)}`, color: act > est && est ? "#E2445C" : "#579BFC" };
            })} empty="No hours logged yet." />
          </div>
        </Card>
      </div>

      {showTeams && teamRows.length > 0 && (
        <Card title="Team workload">
          <Table head={["Team lead", "Team", "Tasks", "Done", "Blocked", "Overdue"]}
            rows={teamRows.map((r) => [personName(people, r.t.team_lead_id), r.t.name, r.total, r.completed, r.onHold, r.overdue])} />
        </Card>
      )}

      <Card title="Boards" subtitle="Every board of the project, including boards created by employees.">
        <Table head={["Board", "Owners", "Tasks", "Done", "Blocked"]}
          rows={boardRows.map((r) => [r.b.name, boardOwnerIds(r.b).map((id) => personName(people, id)).join(", "), r.total, r.completed, r.onHold])} empty="No boards yet." />
      </Card>

      {overdue.length > 0 && (
        <Card title="Overdue tasks">
          <Table head={["Task", "Owner", "Due"]} rows={overdue.map((t) => [t.title, taskOwnerIds(t).map((id) => personName(people, id)).join(", "), <span key="d" className="text-red-400">{fmtDate(t.due_date)}</span>])} />
        </Card>
      )}
    </div>
  );
}

function Table({ head, rows, empty = "Nothing to show." }) {
  if (!rows.length) return <p className="p-5 text-sm text-slate-500">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-left text-sm">
        <thead><tr className="bg-[#17243D]/70 text-xs uppercase tracking-wider text-slate-400">{head.map((h) => <th key={h} className="px-5 py-3">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-700/50">
          {rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={`px-5 py-3 ${j === 0 ? "font-medium text-white" : "text-slate-300"} `}>{c}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  );
}
