import { useState } from "react";
import { Link } from "react-router-dom";
import { Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { supabase } from "../../lib/supabaseClient";

import { fmtDate, groupBy, isLate, isOverdue, label, taskStats, todayStr, topLevel } from "../../lib/utils";
import { personName, useWorkData } from "../../hooks/queries";
import AdminRollup from "../../components/AdminRollup";
import { Badge, Card, Empty, ErrorBox, Loading, Page, StatCard, StatGrid } from "../../components/ui";

// Risk is derived from real data: late project, overdue tasks, or a deadline close with low progress.
function risk(project, stats) {
  if (project.status === "completed" || project.status === "cancelled") return null;
  const daysLeft = project.due_date ? (new Date(project.due_date) - new Date(todayStr())) / 864e5 : null;
  if (isLate(project)) return "high";
  if (stats.overdue > 0 || (daysLeft !== null && daysLeft <= 14 && stats.completed < stats.total / 2)) return "medium";
  return null;
}

const RISK_STYLE = { high: "border-red-500/20 bg-red-500/10 text-red-400", medium: "border-amber-500/20 bg-amber-500/10 text-amber-400" };

// Admin: organization-wide project monitoring.
export default function Portfolio() {
  const d = useWorkData();
  const client = useQueryClient();
  const [deleteError, setDeleteError] = useState("");
  const removeProject = async (p) => {
    if (!window.confirm(`Delete "${p.name}"? This also removes its team assignments (Project Manager, Team Leads, employees), boards and tasks.`)) return;
    const { error } = await supabase.from("projects").delete().eq("id", p.id);
    if (error) return setDeleteError(error.message);
    setDeleteError("");
    ["projects", "assignments", "tasks", "boards", "groups", "reporting"].forEach((k) => client.invalidateQueries({ queryKey: [k] }));
  };
  const { projects, tasks, teams, assignments } = d;

  const rows = projects.map((p) => {
    const stats = taskStats(tasks.filter((t) => t.project_id === p.id));
    return { p, stats, risk: risk(p, stats) };
  });

  const overall = taskStats(tasks);
  const byStatus = groupBy(projects, "status");
  const upcoming = rows
    .filter((r) => r.p.due_date && r.p.status !== "completed" && r.p.status !== "cancelled")
    .sort((a, b) => a.p.due_date.localeCompare(b.p.due_date))
    .slice(0, 6);

  const managers = Object.entries(groupBy(projects.filter((p) => p.project_manager_id), "project_manager_id")).map(([id, list]) => {
    const ts = taskStats(tasks.filter((t) => list.some((p) => p.id === t.project_id)));
    return { id, count: list.length, delayed: list.filter(isLate).length, ...ts };
  });

  const teamRows = teams.map((t) => {
    const ids = assignments.filter((a) => a.team_id === t.id).map((a) => a.project_id);
    return { t, projects: ids.length, ...taskStats(tasks.filter((x) => x.team_id === t.id)) };
  }).filter((r) => r.projects > 0);

  const th = "px-5 py-3";
  const head = "bg-[#17243D]/70 text-xs uppercase tracking-wider text-slate-400";

  return (
    <Page eyebrow="Admin" title="Project Portfolio" subtitle="Status of every project, Project Manager and team across the organization.">
      <ErrorBox error={d.error || deleteError} />
      <StatGrid>
        <StatCard label="Total projects" value={projects.length} loading={d.isLoading} />
        <StatCard label="Active" value={(byStatus.in_progress || []).length} loading={d.isLoading} tone="slate" />
        <StatCard label="Completed" value={(byStatus.completed || []).length} loading={d.isLoading} tone="green" />
        <StatCard label="Delayed" value={projects.filter(isLate).length} loading={d.isLoading} tone="red" />
        <StatCard label="Tasks done" value={`${overall.completed}/${overall.total}`} hint={`${overall.onHold} blocked · ${overall.overdue} overdue`} loading={d.isLoading} tone="amber" />
      </StatGrid>

      <AdminRollup />

      {d.isLoading ? <Loading /> : (
        <div className="space-y-6">
          <Card title="All projects" subtitle="Click a project for its full execution status.">
            {rows.length === 0 ? <Empty title="No projects yet" /> : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-left text-sm">
                  <thead><tr className={head}>
                    <th className={th}>Project</th><th className={th}>Project Manager</th><th className={th}>Status</th>
                    <th className={th}>Due</th><th className={th}>Tasks</th><th className={th}>Blocked</th><th className={th}>Risk</th><th className={th}></th>
                  </tr></thead>
                  <tbody className="divide-y divide-slate-700/50">
                    {rows.map(({ p, stats, risk: r }) => (
                      <tr key={p.id} className="hover:bg-blue-500/[0.05]">
                        <td className="px-5 py-3"><Link className="font-semibold text-white hover:text-blue-300" to={`/admin/projects/${p.id}`}>{p.name}</Link></td>
                        <td className="px-5 py-3 text-slate-300">{personName(d.people, p.project_manager_id)}</td>
                        <td className="px-5 py-3"><Badge status={p.status} /></td>
                        <td className="px-5 py-3 text-slate-400">{fmtDate(p.due_date)}</td>
                        <td className="px-5 py-3 text-slate-300">{stats.completed}/{stats.total}</td>
                        <td className={`px-5 py-3 ${stats.onHold ? "text-orange-400" : "text-slate-500"}`}>{stats.onHold}</td>
                        <td className="px-5 py-3">{r ? <span className={`rounded-full border px-3 py-1 text-xs capitalize ${RISK_STYLE[r]}`}>{r}</span> : <span className="text-xs text-slate-500">—</span>}</td>
                        <td className="px-5 py-3 text-right"><button onClick={() => removeProject(p)} aria-label="Delete project" className="text-slate-500 hover:text-red-400"><Trash2 size={16} /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card title="Project Manager performance">
              {managers.length === 0 ? <Empty title="No projects assigned to Project Managers yet" /> : (
                <table className="w-full text-left text-sm">
                  <thead><tr className={head}><th className={th}>Manager</th><th className={th}>Projects</th><th className={th}>Delayed</th><th className={th}>Done / total</th></tr></thead>
                  <tbody className="divide-y divide-slate-700/50">
                    {managers.map((m) => (
                      <tr key={m.id}>
                        <td className="px-5 py-3 text-white">{personName(d.people, m.id)}</td>
                        <td className="px-5 py-3 text-slate-300">{m.count}</td>
                        <td className={`px-5 py-3 ${m.delayed ? "text-red-400" : "text-slate-500"}`}>{m.delayed}</td>
                        <td className="px-5 py-3 text-slate-300">{m.completed ?? 0}/{m.total ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>

            <Card title="Team workload">
              {teamRows.length === 0 ? <Empty title="No teams are working on projects yet" /> : (
                <table className="w-full text-left text-sm">
                  <thead><tr className={head}><th className={th}>Team</th><th className={th}>Projects</th><th className={th}>Delayed tasks</th><th className={th}>Done / total</th></tr></thead>
                  <tbody className="divide-y divide-slate-700/50">
                    {teamRows.map((r) => (
                      <tr key={r.t.id}>
                        <td className="px-5 py-3 text-white">{r.t.name}</td>
                        <td className="px-5 py-3 text-slate-300">{r.projects}</td>
                        <td className={`px-5 py-3 ${r.overdue ? "text-red-400" : "text-slate-500"}`}>{r.overdue}</td>
                        <td className="px-5 py-3 text-slate-300">{r.completed ?? 0}/{r.total ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>

            <Card title="Upcoming deadlines" subtitle="Open projects by due date.">
              {upcoming.length === 0 ? <Empty title="No upcoming deadlines" /> : (
                <ul className="divide-y divide-slate-700/50">
                  {upcoming.map(({ p }) => (
                    <li key={p.id} className="flex justify-between gap-3 p-4 text-sm">
                      <Link to={`/admin/projects/${p.id}`} className="text-white hover:text-blue-300">{p.name}</Link>
                      <span className={isLate(p) ? "text-red-400" : "text-slate-400"}>{fmtDate(p.due_date)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title="Projects by status">
              {projects.length === 0 ? <Empty title="No projects yet" /> : (
                <ul className="divide-y divide-slate-700/50">
                  {Object.entries(byStatus).map(([status, list]) => (
                    <li key={status} className="flex items-center justify-between p-4 text-sm">
                      <span className="capitalize text-slate-300">{label(status) || "not set"}</span>
                      <span className="font-semibold text-white">{list.length}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}
    </Page>
  );
}
