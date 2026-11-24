import { UserRound } from "lucide-react";

import { taskStats } from "../../lib/utils";
import { personName, useMe, useReporting, useWorkData } from "../../hooks/queries";
import { useScope } from "../../hooks/scope";
import { Card, Empty, ErrorBox, Loading } from "../../components/ui";

// Project Manager: Team Leads who report to me and how their teams perform on my projects.
// Shown inside Projects & Tasks (the separate "My Team Leads" menu item was merged into it).
export default function MyTeamLeads() {
  const { data: me } = useMe();
  const d = useWorkData();
  const reporting = useReporting();
  const scope = useScope(me, d);
  const leadIds = (reporting.data || []).filter((r) => r.project_manager_id === me.id).map((r) => r.team_lead_id);

  return (
    <>
      <ErrorBox error={d.error || reporting.error} />
      <Card title="My Team Leads" subtitle="Team Leads reporting to you and their work on your projects.">
        {d.isLoading || reporting.isLoading ? <Loading /> : leadIds.length === 0 ? (
          <Empty icon={UserRound} title="No Team Leads report to you yet" text="HR sets the reporting hierarchy." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="bg-[#17243D]/70 text-xs uppercase tracking-wider text-slate-400">
                  <th className="px-5 py-3">Team Lead</th><th className="px-5 py-3">Team</th><th className="px-5 py-3">Employees</th>
                  <th className="px-5 py-3">Open</th><th className="px-5 py-3">Delayed</th><th className="px-5 py-3">Blocked</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {leadIds.map((id) => {
                  const teams = d.teams.filter((t) => t.team_lead_id === id);
                  const ids = teams.map((t) => t.id);
                  const s = taskStats(scope.tasks.filter((t) => ids.includes(t.team_id)));
                  return (
                    <tr key={id}>
                      <td className="px-5 py-3 font-medium text-white">{personName(d.people, id)}</td>
                      <td className="px-5 py-3 text-slate-300">{teams.map((t) => t.name).join(", ") || "—"}</td>
                      <td className="px-5 py-3 text-slate-300">{d.members.filter((m) => ids.includes(m.team_id)).length}</td>
                      <td className="px-5 py-3 text-slate-300">{s.pending + s.inProgress + s.onHold}</td>
                      <td className={`px-5 py-3 ${s.overdue ? "text-red-400" : "text-slate-500"}`}>{s.overdue}</td>
                      <td className={`px-5 py-3 ${s.onHold ? "text-orange-400" : "text-slate-500"}`}>{s.onHold}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
