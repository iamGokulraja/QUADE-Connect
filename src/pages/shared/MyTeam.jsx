import { Fragment, useState } from "react";
import { taskOwnerIds } from "../../lib/board";
import { ChevronDown, ChevronRight, Users } from "lucide-react";

import { isOverdue, taskStats, topLevel } from "../../lib/utils";
import { personName, useMe, useWorkData } from "../../hooks/queries";
import { useScope } from "../../hooks/scope";
import { Link } from "react-router-dom";
import { ROLE_BASE } from "../../lib/constants";
import { useBoards } from "../../hooks/boards";
import { Badge, Card, Empty, ErrorBox, Loading, Page } from "../../components/ui";

// Team Lead: members of the teams I lead, with live workload from the tasks table.
export default function MyTeam() {
  const { data: me } = useMe();
  const d = useWorkData();
  const scope = useScope(me, d);
  const teams = d.teams.filter((t) => scope.ledIds.includes(t.id));
  const [expanded, setExpanded] = useState(null);
  const boards = (useBoards().data || []).filter((b) => b.board_type === "project");

  return (
    <Page eyebrow="Workspace" title="My Team" subtitle="Your team members and their current workload.">
      <ErrorBox error={d.error} />
      {d.isLoading ? (
        <Loading />
      ) : teams.length === 0 ? (
        <Card><Empty icon={Users} title="You are not leading a team yet" text="HR creates teams and selects the Team Lead." /></Card>
      ) : (
        <div className="space-y-6">
          {teams.map((team) => {
            const ids = d.members.filter((m) => m.team_id === team.id).map((m) => m.employee_id);
            const projectCount = d.assignments.filter((a) => a.team_id === team.id).length;
            return (
              <Card key={team.id} title={team.name} subtitle={`${team.description || "No description"} · ${projectCount} project(s)`}>
                {ids.length === 0 ? (
                  <Empty title="No employees in this team" />
                ) : (
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="bg-[#17243D]/70 text-xs uppercase tracking-wider text-slate-400">
                        <th className="px-5 py-3">Employee</th>
                        <th className="px-5 py-3">Account</th>
                        <th className="px-5 py-3">Open</th>
                        <th className="px-5 py-3">Overdue</th>
                        <th className="px-5 py-3">Done</th>
                        <th className="px-5 py-3">Blocked</th>
                        <th className="px-5 py-3">Boards</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/50">
                      {ids.map((id) => {
                        const mine = topLevel(d.tasks).filter((t) => taskOwnerIds(t).includes(id) && t.team_id === team.id);
                        const open = mine.filter((t) => t.status !== "completed");
                        return (
                          <Fragment key={id}>
                          <tr>
                            <td className="px-5 py-3 font-medium text-white">
                              {personName(d.people, id)}
                              <p className="text-xs font-normal text-slate-500">{d.people[id]?.email}</p>
                            </td>
                            <td className="px-5 py-3"><Badge status={d.people[id]?.is_active === false ? "cancelled" : "present"} label={d.people[id]?.is_active === false ? "Inactive" : "Active"} /></td>
                            <td className="px-5 py-3 text-slate-300">{open.length}</td>
                            <td className={`px-5 py-3 ${open.some(isOverdue) ? "text-red-400" : "text-slate-500"}`}>{open.filter(isOverdue).length}</td>
                            <td className="px-5 py-3 text-slate-300">{mine.length - open.length}</td>
                            <td className={`px-5 py-3 ${mine.some((t) => t.status === "on_hold") ? "text-orange-400" : "text-slate-500"}`}>{mine.filter((t) => t.status === "on_hold").length}</td>
                            <td className="px-5 py-3">
                              <button onClick={() => setExpanded(expanded === id ? null : id)} className="inline-flex items-center gap-1 text-xs text-blue-400">
                                {expanded === id ? <ChevronDown size={14} /> : <ChevronRight size={14} />} View boards
                              </button>
                            </td>
                          </tr>
                          {expanded === id && (
                            <tr><td colSpan={7} className="bg-[#0D172A]/50 px-5 py-3">
                              {(() => {
                                const theirs = boards.filter((b) => b.owner_id === id && b.team_id === team.id);
                                if (!theirs.length) return <p className="text-sm text-slate-500">No boards created yet.</p>;
                                return (
                                  <ul className="divide-y divide-slate-700/50 text-sm">
                                    {theirs.map((b) => {
                                      const st = taskStats(d.tasks.filter((t) => t.board_id === b.id));
                                      return (
                                        <li key={b.id} className="flex flex-wrap items-center gap-4 py-2">
                                          <Link to={`${ROLE_BASE.team_lead}/projects/${b.project_id}?board=${b.id}`} className="font-medium text-blue-300 hover:underline">{b.name}</Link>
                                          <span className="text-slate-400">{d.projects.find((p) => p.id === b.project_id)?.name}</span>
                                          <span className="text-slate-400">{st.completed}/{st.total} done</span>
                                          <span className="ml-auto text-xs text-slate-500">{st.onHold ? `${st.onHold} blocked` : ""}</span>
                                        </li>
                                      );
                                    })}
                                  </ul>
                                );
                              })()}
                            </td></tr>
                          )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </Page>
  );
}
