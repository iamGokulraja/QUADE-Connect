import { useState } from "react";
import { taskOwnerIds } from "../../lib/board";
import { Check, ClipboardCheck, Paperclip, X } from "lucide-react";

import { fmtDate, isOverdue, topLevel } from "../../lib/utils";
import { personName, usePeople, useProjects, useTasks } from "../../hooks/queries";
import { openAttachment, rpc, useLeaveApprovals, useLeaveCalendar, useLeaveRequests, useLeaveTypes, useRefreshLeave } from "../../hooks/leave";
import { Card, Empty, ErrorBox, Field, Loading, Modal, btnGhost, btnPrimary, inputCls } from "../../components/ui";
import LeaveBadge from "./LeaveBadge";

// Requests waiting for me, plus the decisions I can see (my team / my Team Leads / everyone for HR and Admin).
export default function Approvals({ me }) {
  const reqs = useLeaveRequests();
  const approvals = useLeaveApprovals().data || [];
  const types = useLeaveTypes().data || [];
  const calendar = useLeaveCalendar().data || [];
  const tasks = useTasks().data || [];
  const projects = useProjects().data || [];
  const { map: people } = usePeople();
  const refresh = useRefreshLeave();
  const [open, setOpen] = useState(null);
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const all = reqs.data || [];
  const pending = all.filter((r) => r.status === "pending" && r.current_approver_id === me.id);
  const history = all.filter((r) => r.employee_id !== me.id && r.status !== "pending").slice(0, 60);
  const typeName = (r) => types.find((t) => t.id === r.leave_type_id)?.name || r.leave_type;
  const commentOf = (r) => [...approvals].reverse().find((a) => a.leave_request_id === r.id && a.decision !== "cancelled");

  const workload = (emp) => {
    const open = topLevel(tasks).filter((t) => taskOwnerIds(t).includes(emp) && t.status !== "completed");
    const names = [...new Set(open.map((t) => projects.find((p) => p.id === t.project_id)?.name).filter(Boolean))];
    return { open: open.length, overdue: open.filter(isOverdue).length, names };
  };
  const overlaps = (r) =>
    calendar.filter((c) => c.employee_id !== r.employee_id && c.status === "approved" && c.start_date <= r.end_date && c.end_date >= r.start_date);

  const decide = async (decision) => {
    setBusy(true);
    setError("");
    try {
      await rpc("leave_decide", { req: open.id, decision, comments: comment });
      await refresh();
      setOpen(null);
      setComment("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const w = open ? workload(open.employee_id) : null;

  return (
    <div className="space-y-6">
      <ErrorBox error={reqs.error} />
      <Card title="Pending approvals" subtitle="Requests routed to you by the approval hierarchy.">
        {reqs.isLoading ? <Loading /> : pending.length === 0 ? (
          <Empty icon={ClipboardCheck} title="Nothing waiting for your approval" />
        ) : (
          <ul className="divide-y divide-slate-700/50">
            {pending.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
                <div>
                  <p className="font-medium text-white">{personName(people, r.employee_id)}</p>
                  <p className="text-xs text-slate-400">{typeName(r)} · {fmtDate(r.start_date)} – {fmtDate(r.end_date)} · {r.total_days} day(s)</p>
                </div>
                <button className={btnPrimary} onClick={() => { setOpen(r); setError(""); setComment(""); }}>Review</button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Approval history">
        {history.length === 0 ? <Empty title="No decisions yet" /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="bg-[#17243D]/70 text-xs uppercase tracking-wider text-slate-400">
                  {["Employee", "Type", "Dates", "Days", "Status", "Decided by", "Comment"].map((h) => <th key={h} className="px-4 py-3">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {history.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-3 text-white">{personName(people, r.employee_id)}</td>
                    <td className="px-4 py-3 text-slate-300">{typeName(r)}</td>
                    <td className="px-4 py-3 text-slate-400">{fmtDate(r.start_date)} – {fmtDate(r.end_date)}</td>
                    <td className="px-4 py-3 text-slate-300">{r.total_days}</td>
                    <td className="px-4 py-3"><LeaveBadge status={r.status} /></td>
                    <td className="px-4 py-3 text-slate-300">{commentOf(r)?.approver_name || "—"}</td>
                    <td className="max-w-[220px] px-4 py-3 text-xs text-slate-400">{commentOf(r)?.comments || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {open && (
        <Modal
          wide
          title={`Leave request: ${personName(people, open.employee_id)}`}
          subtitle={`${typeName(open)} · ${fmtDate(open.start_date)} – ${fmtDate(open.end_date)} · ${open.total_days} day(s)`}
          onClose={() => setOpen(null)}
          footer={
            <>
              <button className={btnGhost} onClick={() => setOpen(null)}>Close</button>
              <button className={`${btnGhost} text-red-400`} disabled={busy} onClick={() => decide("rejected")}><X size={15} /> Reject</button>
              <button className={btnPrimary} disabled={busy} onClick={() => decide("approved")}><Check size={15} /> Approve</button>
            </>
          }
        >
          <ErrorBox error={error} />
          <div className="rounded-xl bg-[#17243D] p-4 text-sm">
            <p className="text-xs text-slate-400">Reason</p>
            <p className="mb-3 text-white">{open.reason || "—"}</p>
            {open.attachment_url && (
              <button className="inline-flex items-center gap-1 text-blue-400" onClick={() => openAttachment(open.attachment_url).catch((e) => setError(e.message))}>
                <Paperclip size={14} /> View supporting document
              </button>
            )}
          </div>
          <div className="grid gap-3 text-sm sm:grid-cols-3">
            <div className="rounded-xl bg-[#17243D] p-3"><p className="text-xs text-slate-400">Open tasks</p><p className="text-lg font-semibold text-white">{w.open}</p></div>
            <div className="rounded-xl bg-[#17243D] p-3"><p className="text-xs text-slate-400">Overdue tasks</p><p className={`text-lg font-semibold ${w.overdue ? "text-red-400" : "text-white"}`}>{w.overdue}</p></div>
            <div className="rounded-xl bg-[#17243D] p-3"><p className="text-xs text-slate-400">Colleagues on leave then</p><p className="text-lg font-semibold text-white">{overlaps(open).length}</p></div>
          </div>
          {w.names.length > 0 && <p className="text-xs text-slate-400">Projects: {w.names.join(", ")}</p>}
          <Field label="Comment (required when rejecting)">
            <textarea rows={3} className={inputCls} value={comment} onChange={(e) => setComment(e.target.value)} />
          </Field>
        </Modal>
      )}
    </div>
  );
}
