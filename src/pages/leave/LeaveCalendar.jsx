import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { fmtDate, todayStr } from "../../lib/utils";
import { personName, useTeamMembers, useTeams, usePeople } from "../../hooks/queries";
import { useLeaveCalendar, useStaff } from "../../hooks/leave";
import { Card, ErrorBox, Loading, inputCls } from "../../components/ui";

const CHIP = {
  approved: "bg-emerald-500/20 text-emerald-300",
  pending: "bg-amber-500/20 text-amber-300",
  rejected: "bg-red-500/10 text-red-300 line-through",
};
const ymd = (y, m, d) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

// Month view of leave. Pending, approved and rejected requests use different colours.
export default function LeaveCalendar() {
  const cal = useLeaveCalendar();
  const { map: people } = usePeople();
  const teams = useTeams().data || [];
  const members = useTeamMembers().data || [];
  const staff = useStaff().data || [];
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [team, setTeam] = useState("all");
  const [dept, setDept] = useState("all");
  const [show, setShow] = useState({ approved: true, pending: true, rejected: false });

  const deptOf = Object.fromEntries(staff.map((p) => [p.id, p.department]));
  const depts = [...new Set(staff.map((p) => p.department).filter(Boolean))].sort();
  const inTeam = (id) => {
    if (team === "all") return true;
    const t = teams.find((x) => x.id === team);
    return t?.team_lead_id === id || members.some((m) => m.team_id === team && m.employee_id === id);
  };
  const events = (cal.data || []).filter((e) => show[e.status] && inTeam(e.employee_id) && (dept === "all" || deptOf[e.employee_id] === dept));

  const y = month.getFullYear();
  const m = month.getMonth();
  const lead = (new Date(y, m, 1).getDay() + 6) % 7; // week starts Monday
  const count = new Date(y, m + 1, 0).getDate();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: count }, (_, i) => i + 1)];
  const on = (day) => events.filter((e) => e.start_date <= day && e.end_date >= day);
  const today = todayStr();

  // overlapping (pending or approved) leave of different people inside this month
  const live = events.filter((e) => e.status !== "rejected" && e.end_date >= ymd(y, m, 1) && e.start_date <= ymd(y, m, count));
  const overlaps = [];
  live.forEach((a, i) => live.slice(i + 1).forEach((b) => {
    if (a.employee_id !== b.employee_id && a.start_date <= b.end_date && b.start_date <= a.end_date) overlaps.push([a, b]);
  }));
  const upcoming = events.filter((e) => e.status === "approved" && e.end_date >= today && e.start_date <= new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10)).slice(0, 8);
  const name = (id) => personName(people, id).replace("Unknown user", "Colleague");

  return (
    <div className="space-y-6">
      <ErrorBox error={cal.error} />
      <Card
        title={month.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <select className={`${inputCls} w-auto`} value={team} onChange={(e) => setTeam(e.target.value)}>
              <option value="all">All teams</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            {depts.length > 0 && (
              <select className={`${inputCls} w-auto`} value={dept} onChange={(e) => setDept(e.target.value)}>
                <option value="all">All departments</option>
                {depts.map((d) => <option key={d}>{d}</option>)}
              </select>
            )}
            {Object.keys(show).map((s) => (
              <label key={s} className="flex items-center gap-1 text-xs capitalize text-slate-300">
                <input type="checkbox" checked={show[s]} onChange={() => setShow({ ...show, [s]: !show[s] })} /> {s}
              </label>
            ))}
            <button aria-label="Previous month" className="rounded-lg border border-slate-600 p-2 text-slate-300" onClick={() => setMonth(new Date(y, m - 1, 1))}><ChevronLeft size={16} /></button>
            <button aria-label="Next month" className="rounded-lg border border-slate-600 p-2 text-slate-300" onClick={() => setMonth(new Date(y, m + 1, 1))}><ChevronRight size={16} /></button>
          </div>
        }
      >
        {cal.isLoading ? <Loading /> : (
          <div className="overflow-x-auto p-3">
            <div className="grid min-w-[720px] grid-cols-7 gap-1 text-xs">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="px-2 py-1 font-semibold text-slate-400">{d}</div>)}
              {cells.map((d, i) => {
                if (!d) return <div key={`b${i}`} />;
                const day = ymd(y, m, d);
                const list = on(day);
                const clash = list.filter((e) => e.status !== "rejected").length >= 2;
                return (
                  <div key={day} className={`min-h-[84px] rounded-lg border p-1.5 ${day === today ? "border-blue-500" : clash ? "border-amber-500/60" : "border-slate-700/60"} bg-[#0D172A]`}>
                    <p className={`mb-1 ${day === today ? "font-bold text-blue-400" : "text-slate-500"}`}>{d}</p>
                    {list.slice(0, 3).map((e) => <p key={e.id} className={`mb-0.5 truncate rounded px-1 ${CHIP[e.status]}`} title={`${name(e.employee_id)} · ${e.status}`}>{name(e.employee_id)}</p>)}
                    {list.length > 3 && <p className="text-slate-500">+{list.length - 3} more</p>}
                  </div>
                );
              })}
            </div>
            <p className="mt-3 flex flex-wrap gap-4 text-xs text-slate-400">
              <span><b className="text-emerald-300">■</b> Approved</span><span><b className="text-amber-300">■</b> Pending</span>
              <span><b className="text-red-300">■</b> Rejected</span><span><b className="text-amber-500">▢</b> Overlapping leave</span>
            </p>
          </div>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Upcoming leave (next 14 days)">
          {upcoming.length === 0 ? <p className="p-5 text-sm text-slate-500">No approved leave coming up.</p> : (
            <ul className="divide-y divide-slate-700/50 text-sm">
              {upcoming.map((e) => <li key={e.id} className="flex justify-between p-4"><span className="text-white">{name(e.employee_id)}</span><span className="text-slate-400">{fmtDate(e.start_date)} – {fmtDate(e.end_date)}</span></li>)}
            </ul>
          )}
        </Card>
        <Card title="Overlapping leave this month">
          {overlaps.length === 0 ? <p className="p-5 text-sm text-slate-500">No overlapping leave.</p> : (
            <ul className="divide-y divide-slate-700/50 text-sm">
              {overlaps.slice(0, 8).map(([a, b]) => <li key={a.id + b.id} className="p-4 text-slate-300">{name(a.employee_id)} <span className="text-slate-500">&</span> {name(b.employee_id)}</li>)}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
