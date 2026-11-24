import { useState } from "react";
import { Download } from "lucide-react";

import { fmtDate, todayStr } from "../../lib/utils";
import { personName, usePeople } from "../../hooks/queries";
import { useLeaveApprovals, useLeaveBalances, useLeaveRequests, useLeaveTypes, useStaff } from "../../hooks/leave";
import { Card, Empty, ErrorBox, Loading, StatCard, btnGhost, inputCls } from "../../components/ui";
import LeaveBadge from "./LeaveBadge";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// HR / Admin: every request, statistics, balances, upcoming absences, overlaps and CSV export.
// Monitoring only: approval still follows the hierarchy.
export default function LeaveMonitor() {
  const reqs = useLeaveRequests();
  const approvals = useLeaveApprovals().data || [];
  const balances = useLeaveBalances().data || [];
  const types = useLeaveTypes().data || [];
  const staff = useStaff().data || [];
  const { map: people } = usePeople();
  const [year, setYear] = useState(new Date().getFullYear());
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");

  const profile = Object.fromEntries(staff.map((p) => [p.id, p]));
  const typeName = (r) => types.find((t) => t.id === r.leave_type_id)?.name || r.leave_type;
  const all = (reqs.data || []).filter((r) => r.start_date.startsWith(String(year)));
  const rows = all.filter((r) => (status === "all" || r.status === status) &&
    (!search || personName(people, r.employee_id).toLowerCase().includes(search.toLowerCase())));
  const approved = all.filter((r) => r.status === "approved");

  const monthly = MONTHS.map((_, i) => approved.filter((r) => Number(r.start_date.slice(5, 7)) === i + 1).reduce((s, r) => s + r.total_days, 0));
  const maxMonth = Math.max(1, ...monthly);
  const byDept = {};
  approved.forEach((r) => { const d = profile[r.employee_id]?.department || "No department"; byDept[d] = (byDept[d] || 0) + r.total_days; });

  const today = todayStr();
  const soon = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  const upcoming = (reqs.data || []).filter((r) => r.status === "approved" && r.end_date >= today && r.start_date <= soon).sort((a, b) => a.start_date.localeCompare(b.start_date));
  const live = (reqs.data || []).filter((r) => ["pending", "approved"].includes(r.status) && r.end_date >= today);
  const clashes = [];
  live.forEach((a, i) => live.slice(i + 1).forEach((b) => {
    const sameDept = profile[a.employee_id]?.department && profile[a.employee_id]?.department === profile[b.employee_id]?.department;
    if (sameDept && a.employee_id !== b.employee_id && a.start_date <= b.end_date && b.start_date <= a.end_date) clashes.push([a, b]);
  }));

  const decider = (r) => [...approvals].reverse().find((a) => a.leave_request_id === r.id && a.decision !== "cancelled");
  const exportCsv = () => {
    const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const head = ["Employee", "Employee ID", "Department", "Leave type", "From", "To", "Days", "Status", "Decided by", "Comment", "Submitted"];
    const lines = rows.map((r) => [personName(people, r.employee_id), profile[r.employee_id]?.employee_code, profile[r.employee_id]?.department, typeName(r), r.start_date, r.end_date, r.total_days, r.status, decider(r)?.approver_name || r.approver_name, decider(r)?.comments, r.submitted_at?.slice(0, 10)].map(cell).join(","));
    const url = URL.createObjectURL(new Blob([[head.map(cell).join(","), ...lines].join("\n")], { type: "text/csv" }));
    Object.assign(document.createElement("a"), { href: url, download: `leave-report-${year}.csv` }).click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <ErrorBox error={reqs.error} />
      <div className="flex flex-wrap gap-3">
        <select className={`${inputCls} w-auto`} value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {[0, 1, 2].map((i) => <option key={i}>{new Date().getFullYear() - i}</option>)}
        </select>
        <select className={`${inputCls} w-auto`} value={status} onChange={(e) => setStatus(e.target.value)}>
          {["all", "pending", "approved", "rejected", "cancelled"].map((s) => <option key={s} value={s}>{s === "all" ? "All statuses" : s}</option>)}
        </select>
        <input className={`${inputCls} w-auto`} placeholder="Search employee" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button className={`${btnGhost} ml-auto`} onClick={exportCsv} disabled={!rows.length}><Download size={15} /> Export CSV</button>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={`Requests in ${year}`} value={all.length} loading={reqs.isLoading} tone="slate" />
        <StatCard label="Pending Approval" value={all.filter((r) => r.status === "pending").length} loading={reqs.isLoading} tone="amber" />
        <StatCard label="Approved days" value={approved.reduce((s, r) => s + r.total_days, 0)} loading={reqs.isLoading} tone="green" />
        <StatCard label="Rejected" value={all.filter((r) => r.status === "rejected").length} loading={reqs.isLoading} tone="red" />
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title={`Approved leave days by month, ${year}`}>
          <div className="flex h-40 items-end gap-2 p-5">
            {monthly.map((v, i) => (
              <div key={MONTHS[i]} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-[10px] text-slate-400">{v || ""}</span>
                <div className="w-full rounded-t bg-blue-500" style={{ height: `${(v / maxMonth) * 100}%`, minHeight: v ? 4 : 0 }} />
                <span className="text-[10px] text-slate-500">{MONTHS[i]}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Approved days by department">
          {Object.keys(byDept).length === 0 ? <Empty title="No approved leave yet" /> : (
            <ul className="divide-y divide-slate-700/50 text-sm">
              {Object.entries(byDept).sort((a, b) => b[1] - a[1]).map(([d, n]) => <li key={d} className="flex justify-between p-4"><span className="text-slate-300">{d}</span><span className="font-semibold text-white">{n}</span></li>)}
            </ul>
          )}
        </Card>
        <Card title="Upcoming absences (30 days)">
          {upcoming.length === 0 ? <Empty title="No upcoming absences" /> : (
            <ul className="divide-y divide-slate-700/50 text-sm">
              {upcoming.slice(0, 10).map((r) => <li key={r.id} className="flex justify-between p-4"><span className="text-white">{personName(people, r.employee_id)}</span><span className="text-slate-400">{fmtDate(r.start_date)} – {fmtDate(r.end_date)}</span></li>)}
            </ul>
          )}
        </Card>
        <Card title="Overlapping leave in the same department">
          {clashes.length === 0 ? <Empty title="No overlaps found" /> : (
            <ul className="divide-y divide-slate-700/50 text-sm">
              {clashes.slice(0, 10).map(([a, b]) => <li key={a.id + b.id} className="p-4 text-slate-300">{personName(people, a.employee_id)} & {personName(people, b.employee_id)} <span className="text-xs text-slate-500">({profile[a.employee_id]?.department})</span></li>)}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Leave balances" subtitle={`Allocated and used days for ${year}. Types without a yearly limit are not tracked.`}>
        {balances.filter((b) => b.year === year).length === 0 ? <Empty title="No balances recorded yet" text="A balance row is created when the first leave of a limited type is approved." /> : (
          <table className="w-full text-left text-sm">
            <thead><tr className="bg-[#17243D]/70 text-xs uppercase tracking-wider text-slate-400"><th className="px-5 py-3">Employee</th><th className="px-5 py-3">Type</th><th className="px-5 py-3">Allocated</th><th className="px-5 py-3">Used</th><th className="px-5 py-3">Remaining</th></tr></thead>
            <tbody className="divide-y divide-slate-700/50">
              {balances.filter((b) => b.year === year).map((b) => (
                <tr key={b.id}><td className="px-5 py-3 text-white">{personName(people, b.employee_id)}</td><td className="px-5 py-3 text-slate-300">{types.find((t) => t.id === b.leave_type_id)?.name}</td><td className="px-5 py-3 text-slate-300">{b.total_allocated}</td><td className="px-5 py-3 text-slate-300">{b.used_days}</td><td className="px-5 py-3 text-white">{b.remaining_days}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card title="All leave requests">
        {reqs.isLoading ? <Loading /> : rows.length === 0 ? <Empty title="No requests match" /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead><tr className="bg-[#17243D]/70 text-xs uppercase tracking-wider text-slate-400">
                {["Employee", "Department", "Type", "Dates", "Days", "Status", "Approver / decided by"].map((h) => <th key={h} className="px-4 py-3">{h}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-slate-700/50">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-3 text-white">{personName(people, r.employee_id)}</td>
                    <td className="px-4 py-3 text-slate-400">{profile[r.employee_id]?.department || "—"}</td>
                    <td className="px-4 py-3 text-slate-300">{typeName(r)}</td>
                    <td className="px-4 py-3 text-slate-400">{fmtDate(r.start_date)} – {fmtDate(r.end_date)}</td>
                    <td className="px-4 py-3 text-slate-300">{r.total_days}</td>
                    <td className="px-4 py-3"><LeaveBadge status={r.status} /></td>
                    <td className="px-4 py-3 text-slate-300">{r.status === "pending" ? r.approver_name : decider(r)?.approver_name || r.approver_name || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
