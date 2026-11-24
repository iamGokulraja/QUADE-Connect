import { Link } from "react-router-dom";
import { taskOwnerIds } from "../../lib/board";
import { FolderKanban } from "lucide-react";

import { ROLE_BASE } from "../../lib/constants";
import { fmtDate, groupBy, isOverdue, taskStats, topLevel } from "../../lib/utils";
import { personName, useMe, useWorkData } from "../../hooks/queries";
import { useScope } from "../../hooks/scope";
import { Badge, Card, Empty, ErrorBox, Loading, Page, StatCard, StatGrid } from "../../components/ui";

const COPY = {
  project_manager: ["Project Management", "Project Manager Dashboard", "Monitor the projects assigned to you and the teams working on them."],
  team_lead: ["Team Lead Workspace", "Team Lead Dashboard", "Track your team's projects, tasks and workload."],
  employee: ["Employee Workspace", "My Dashboard", "Your assigned work and deadlines."],
};

// One dashboard for Project Manager, Team Lead and Employee. Everything is calculated from real records.
export default function WorkDashboard() {
  const { data: me } = useMe();
  const d = useWorkData();
  const scope = useScope(me, d);
  const base = ROLE_BASE[me.role];
  const [eyebrow, title, subtitle] = COPY[me.role];

  const stats = taskStats(scope.own);
  const open = topLevel(scope.own).filter((t) => t.status !== "completed");
  const week = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  const attention = open
    .filter((t) => isOverdue(t) || (t.due_date && t.due_date <= week))
    .sort((a, b) => (a.due_date || "").localeCompare(b.due_date || ""))
    .slice(0, 8);

  const workload = Object.entries(groupBy(open.flatMap((t) => taskOwnerIds(t).map((id) => ({ ...t, owner: id }))), "owner"))
    .map(([id, list]) => ({ id, open: list.length, overdue: list.filter(isOverdue).length }))
    .sort((a, b) => b.open - a.open);

  const projectStats = (id) => taskStats(scope.own.filter((t) => t.project_id === id));

  return (
    <Page eyebrow={eyebrow} title={title} subtitle={subtitle}>
      <ErrorBox error={d.error} />

      <StatGrid>
        <StatCard label="Projects" value={scope.projects.length} loading={d.isLoading} />
        <StatCard label="Total tasks" value={stats.total} loading={d.isLoading} tone="slate" />
        <StatCard label="Done" value={stats.completed} loading={d.isLoading} tone="green" />
        <StatCard label="Not started" value={stats.pending} hint={`${stats.inProgress} working / in review`} loading={d.isLoading} tone="amber" />
        <StatCard label="Overdue" value={stats.overdue} loading={d.isLoading} tone="red" />
      </StatGrid>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Projects" subtitle="Open a project to see its boards, tasks and who is working on what.">
          {d.isLoading ? (
            <Loading />
          ) : scope.projects.length === 0 ? (
            <Empty icon={FolderKanban} title="No projects yet" text="Projects appear here once a team is assigned." />
          ) : (
            <ul className="divide-y divide-slate-700/50">
              {scope.projects.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-4 p-4">
                  <div className="min-w-0 flex-1">
                    <Link to={`${base}/projects/${p.id}`} className="font-semibold text-white hover:text-blue-300">
                      {p.name}
                    </Link>
                    {scope.legacyIds.has(p.id) && <span className="ml-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300">Previous team</span>}
                    <p className="mt-1 text-xs text-slate-500">Due {fmtDate(p.due_date)}</p>
                  </div>
                  <Badge status={p.status} />
                  <span className="text-xs text-slate-400">{projectStats(p.id).completed}/{projectStats(p.id).total} done{projectStats(p.id).onHold ? ` · ${projectStats(p.id).onHold} blocked` : ""}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Needs attention" subtitle="Overdue or due within 7 days.">
          {attention.length === 0 ? (
            <Empty title="Nothing urgent" text="No overdue tasks or deadlines this week." />
          ) : (
            <ul className="divide-y divide-slate-700/50">
              {attention.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 p-4 text-sm">
                  <div className="min-w-0">
                    <Link to={`${base}/projects/${t.project_id}`} className="block truncate font-medium text-white hover:text-blue-300">
                      {t.title}
                    </Link>
                    {me.role !== "employee" && (
                      <p className="text-xs text-slate-500">{taskOwnerIds(t).map((id) => personName(d.people, id)).join(", ")}</p>
                    )}
                  </div>
                  <span className={isOverdue(t) ? "text-red-400" : "text-slate-400"}>{fmtDate(t.due_date)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {me.role !== "employee" && (
          <Card title="Workload" subtitle="Open tasks per person." className="xl:col-span-2">
            {workload.length === 0 ? (
              <Empty title="No open assigned tasks" />
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-[#17243D]/70 text-xs uppercase tracking-wider text-slate-400">
                    <th className="px-5 py-3">Person</th>
                    <th className="px-5 py-3">Open tasks</th>
                    <th className="px-5 py-3">Overdue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {workload.map((w) => (
                    <tr key={w.id}>
                      <td className="px-5 py-3 text-white">{personName(d.people, w.id)}</td>
                      <td className="px-5 py-3 text-slate-300">{w.open}</td>
                      <td className={`px-5 py-3 ${w.overdue ? "text-red-400" : "text-slate-500"}`}>{w.overdue}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        )}
      </div>
    </Page>
  );
}
