import { useQuery } from "@tanstack/react-query";

import { supabase } from "../../lib/supabaseClient";
import { fmtDate, fmtTime, todayStr } from "../../lib/utils";
import { useLeaveRequests, useStaff } from "../../hooks/leave";
import { Place } from "../shared/Attendance";
import { Badge, Card, Empty, ErrorBox, Loading, StatCard } from "../../components/ui";

const STAFF = ["employee", "team_lead", "project_manager", "hr", "qc"];

// HR / Admin: today's attendance. Only APPROVED leave counts as "on leave".
export default function AttendanceToday() {
  const today = todayStr();
  const staff = (useStaff().data || []).filter((p) => STAFF.includes(p.role) && p.is_active);
  const leaves = useLeaveRequests().data || [];
  const att = useQuery({
    queryKey: ["attendance-today"],
    queryFn: async () => {
      const { data, error } = await supabase.from("attendance").select("*").eq("attendance_date", today);
      if (error) throw error;
      return data || [];
    },
  });

  const byPerson = Object.fromEntries((att.data || []).map((a) => [a.employee_id, a]));
  const onLeave = new Set(leaves.filter((l) => l.status === "approved" && l.start_date <= today && l.end_date >= today).map((l) => l.employee_id));

  return (
    <div className="space-y-6">
      <ErrorBox error={att.error} />
      <section className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Active staff" value={staff.length} tone="slate" />
        <StatCard label="Present today" value={staff.filter((p) => byPerson[p.id]).length} tone="green" />
        <StatCard label="On approved leave" value={staff.filter((p) => onLeave.has(p.id)).length} tone="amber" />
      </section>
      <Card title="Today's attendance" subtitle={fmtDate(today)}>
        {att.isLoading ? <Loading /> : staff.length === 0 ? <Empty title="No active staff" /> : (
          <div className="overflow-x-auto"><table className="min-w-[900px] w-full text-left text-sm">
            <thead><tr className="bg-[#17243D]/70 text-xs uppercase tracking-wider text-slate-400">
              <th className="px-5 py-3">Name</th><th className="px-5 py-3">In</th><th className="px-5 py-3">Check-in location</th><th className="px-5 py-3">Out</th><th className="px-5 py-3">Check-out location</th><th className="px-5 py-3">Status</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-700/50">
              {staff.map((p) => {
                const a = byPerson[p.id];
                return (
                  <tr key={p.id}>
                    <td className="px-5 py-3 text-white">{p.full_name || p.email}</td>
                    <td className="px-5 py-3 text-slate-300">{fmtTime(a?.check_in)}</td>
                    <td className="px-5 py-3"><Place text={a?.check_in_location} lat={a?.check_in_lat} lng={a?.check_in_lng} /></td>
                    <td className="px-5 py-3 text-slate-300">{fmtTime(a?.check_out)}</td>
                    <td className="px-5 py-3"><Place text={a?.check_out_location} lat={a?.check_out_lat} lng={a?.check_out_lng} /></td>
                    <td className="px-5 py-3">{a ? <Badge status={a.status} /> : onLeave.has(p.id) ? <span className="text-xs text-amber-400">On leave</span> : <span className="text-xs text-slate-500">Not checked in</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        )}
      </Card>
    </div>
  );
}
