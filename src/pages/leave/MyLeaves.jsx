import { useState } from "react";
import { CalendarClock, Paperclip } from "lucide-react";

import { fmtDate } from "../../lib/utils";
import { openAttachment, rpc, useLeaveApprovals, useLeaveBalances, useLeaveRequests, useLeaveTypes, useRefreshLeave } from "../../hooks/leave";
import { Card, Empty, ErrorBox, Loading, StatCard, btnGhost } from "../../components/ui";
import LeaveBadge from "./LeaveBadge";

// Leave balances, statistics and the user's own leave history.
export default function MyLeaves({ me }) {
  const reqs = useLeaveRequests();
  const approvals = useLeaveApprovals().data || [];
  const balances = useLeaveBalances().data || [];
  const types = useLeaveTypes().data || [];
  const refresh = useRefreshLeave();
  const [error, setError] = useState("");

  const year = new Date().getFullYear();
  const rows = (reqs.data || []).filter((r) => r.employee_id === me.id);
  const typeName = (r) => types.find((t) => t.id === r.leave_type_id)?.name || r.leave_type;
  const today = new Date().toISOString().slice(0, 10);
  const cancellable = (r) => r.status === "pending" || (r.status === "approved" && r.start_date > today);

  const act = async (fn) => {
    try { setError(""); await fn(); await refresh(); } catch (err) { setError(err.message); }
  };

  const approvedDays = rows
    .filter((r) => r.status === "approved" && r.start_date.startsWith(String(year)))
    .reduce((s, r) => s + (r.total_days || 0), 0);

  return (
    <div className="space-y-6">
      <ErrorBox error={error || reqs.error} />
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={`Approved days in ${year}`} value={approvedDays} tone="green" />
        <StatCard label="Pending Approval" value={rows.filter((r) => r.status === "pending").length} tone="amber" />
        {types.filter((t) => t.is_active && t.annual_limit != null).slice(0, 2).map((t) => {
          const b = balances.find((x) => x.leave_type_id === t.id && x.year === year && x.employee_id === me.id);
          return <StatCard key={t.id} label={`${t.name} left`} value={b ? Number(b.remaining_days) : Number(t.annual_limit)} hint={`of ${b ? Number(b.total_allocated) : Number(t.annual_limit)} days`} />;
        })}
      </section>

      <Card title="My Leave History">
        {reqs.isLoading ? <Loading /> : rows.length === 0 ? (
          <Empty icon={CalendarClock} title="No leave requests yet" text="Use Apply Leave to submit your first request." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead>
                <tr className="bg-[#17243D]/70 text-xs uppercase tracking-wider text-slate-400">
                  {["Type", "From", "To", "Days", "Reason", "Submitted", "Approver", "Status", "Comments", ""].map((h) => <th key={h} className="px-4 py-3">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {rows.map((r) => {
                  const last = [...approvals].reverse().find((a) => a.leave_request_id === r.id && a.decision !== "cancelled");
                  return (
                    <tr key={r.id}>
                      <td className="px-4 py-3 text-white">{typeName(r)}</td>
                      <td className="px-4 py-3 text-slate-300">{fmtDate(r.start_date)}</td>
                      <td className="px-4 py-3 text-slate-300">{fmtDate(r.end_date)}</td>
                      <td className="px-4 py-3 text-slate-300">{r.total_days}</td>
                      <td className="max-w-[200px] truncate px-4 py-3 text-slate-400" title={r.reason}>{r.reason}</td>
                      <td className="px-4 py-3 text-slate-400">{fmtDate(r.submitted_at?.slice(0, 10))}</td>
                      <td className="px-4 py-3 text-slate-300">{r.status === "pending" ? r.approver_name || "—" : last?.approver_name || r.approver_name || "—"}</td>
                      <td className="px-4 py-3"><LeaveBadge status={r.status} /></td>
                      <td className="max-w-[200px] px-4 py-3 text-xs text-slate-400">{last?.comments || "—"}</td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {r.attachment_url && (
                          <button aria-label="View document" className="mr-2 text-slate-400 hover:text-white" onClick={() => act(() => openAttachment(r.attachment_url))}><Paperclip size={15} /></button>
                        )}
                        {cancellable(r) && (
                          <button className={`${btnGhost} !px-3 !py-1.5 text-xs`}
                            onClick={() => window.confirm("Cancel this leave request?") && act(() => rpc("leave_cancel", { req: r.id }))}>
                            Cancel
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
