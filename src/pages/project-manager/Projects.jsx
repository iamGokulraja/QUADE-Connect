import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarDays, FolderKanban, Plus, Users } from "lucide-react";

import AssignTeams from "./AssignTeams";
import { CreateBoardModal } from "../../components/board/BoardSwitcher";
import MyTeamLeads from "../shared/MyTeamLeads";
import { fmtDate, isDueTomorrow, isLate, taskStats } from "../../lib/utils";
import { personName, useMe, useWorkData } from "../../hooks/queries";
import { useScope } from "../../hooks/scope";
import { Badge, Card, Empty, ErrorBox, Loading, Page, Priority, StatCard, StatGrid } from "../../components/ui";

const Num = ({ label, value, tone = "text-white" }) => (
  <div className="rounded-xl bg-[#0D172A] px-3 py-2 text-center">
    <p className={`text-lg font-bold ${tone}`}>{value}</p>
    <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
  </div>
);

// Project Manager: "Projects & Tasks". A project stays here after teams are assigned; the card shows its teams,
// Team Leads, task counts and live task status. Team Leads reporting to the PM are on the second tab.
export default function Projects() {
  const { data: me } = useMe();
  const d = useWorkData();
  const scope = useScope(me, d);
  const client = useQueryClient();
  const [tab, setTab] = useState("projects");
  const [assigning, setAssigning] = useState(null);
  const [boardFor, setBoardFor] = useState(null); // project a board is being created in
  const navigate = useNavigate();
  const teamPeople = Object.fromEntries(d.teams.map((t) => [t.id, [t.team_lead_id, ...d.members.filter((m) => m.team_id === t.id).map((m) => m.employee_id)].filter(Boolean)]));

  const refresh = () => ["assignments", "projects", "tasks", "team-members"].forEach((k) => client.invalidateQueries({ queryKey: [k] }));
  const all = taskStats(scope.tasks);
  const tabCls = (on) => `rounded-lg px-4 py-2 text-sm font-medium ${on ? "bg-blue-600 text-white" : "bg-[#17243D] text-slate-300 hover:bg-slate-700"}`;

  return (
    <Page eyebrow="Workspace" title="Projects & Tasks" subtitle="Your projects, the teams and Team Leads working on them, and live task progress.">
      <ErrorBox error={d.error} />

      <StatGrid>
        <StatCard label="Projects" value={scope.projects.length} loading={d.isLoading} />
        <StatCard label="In progress" value={scope.projects.filter((p) => p.status === "in_progress").length} tone="blue" loading={d.isLoading} />
        <StatCard label="Completed" value={scope.projects.filter((p) => p.status === "completed").length} tone="green" loading={d.isLoading} />
        <StatCard label="Total tasks" value={all.total} tone="slate" loading={d.isLoading} />
        <StatCard label="Overdue tasks" value={all.overdue} tone="red" loading={d.isLoading} />
      </StatGrid>

      <div className="mb-5 flex gap-2">
        <button className={tabCls(tab === "projects")} onClick={() => setTab("projects")}>Projects</button>
        <button className={tabCls(tab === "leads")} onClick={() => setTab("leads")}>Team Leads</button>
      </div>

      {tab === "leads" ? <MyTeamLeads /> : d.isLoading ? <Loading text="Loading projects..." /> : scope.projects.length === 0 ? (
        <Card><Empty icon={FolderKanban} title="No projects assigned yet" text="Projects assigned to you by Admin will appear here." /></Card>
      ) : (
        <div className="space-y-5">
          {scope.projects.map((p) => {
            const teamIds = d.assignments.filter((a) => a.project_id === p.id).map((a) => a.team_id);
            const teams = d.teams.filter((t) => teamIds.includes(t.id));
            const employees = new Set(d.members.filter((m) => teamIds.includes(m.team_id) && d.people[m.employee_id]?.role !== "team_lead").map((m) => m.employee_id));
            const s = taskStats(scope.tasks.filter((t) => t.project_id === p.id));
            return (
              <Card key={p.id}>
                <div className="space-y-4 p-5">
                  {(isDueTomorrow(p) || isLate(p)) && (
                    <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300">
                      {isLate(p) ? "This project is past its due date." : "This project is due tomorrow."}
                    </p>
                  )}
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link to={`/project-manager/projects/${p.id}`} className="text-lg font-semibold text-white hover:text-blue-300">{p.name}</Link>
                      {p.description && <p className="mt-1 line-clamp-2 max-w-3xl text-sm text-slate-400">{p.description}</p>}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      <Priority value={p.priority} />
                      <Badge status={p.status} />
                      <span className="flex items-center gap-1.5 text-slate-400"><CalendarDays size={14} />{p.start_date ? `${fmtDate(p.start_date)} → ` : ""}{fmtDate(p.due_date)}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 text-xs">
                    {teams.length === 0 && <span className="text-slate-500">No team assigned yet.</span>}
                    {teams.map((t) => (
                      <span key={t.id} className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1.5 text-blue-200">
                        <Users size={12} /> {t.name} · Lead: {personName(d.people, t.team_lead_id)}
                      </span>
                    ))}
                  </div>

                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-7">
                    <Num label="Employees" value={employees.size} />
                    <Num label="Tasks" value={s.total} />
                    <Num label="Done" value={s.completed} tone="text-emerald-400" />
                    <Num label="Working / review" value={s.inProgress} tone="text-blue-400" />
                    <Num label="Not started" value={s.pending} tone="text-amber-400" />
                    <Num label="Blocked" value={s.onHold} tone="text-orange-400" />
                    <Num label="Overdue" value={s.overdue} tone={s.overdue ? "text-red-400" : "text-slate-500"} />
                  </div>

                  <div className="flex flex-wrap items-center gap-4">
                    <div className="min-w-[200px] flex-1 text-xs text-slate-400">{s.completed} of {s.total} tasks done{s.onHold ? ` · ${s.onHold} blocked` : ""}</div>
                    <button onClick={() => setAssigning(p)} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-700"><Plus size={15} /> Assign Teams</button>
                    {teams.length > 0 && <button onClick={() => setBoardFor(p)} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-emerald-700"><Plus size={15} /> Create board</button>}
                    <Link to={`/project-manager/projects/${p.id}`} className="rounded-lg border border-slate-600 px-4 py-2.5 text-xs font-semibold text-slate-200 hover:bg-slate-800">Open workspace</Link>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {boardFor && (
        <CreateBoardModal project={boardFor} teamOptions={d.teams.filter((t) => d.assignments.some((a) => a.project_id === boardFor.id && a.team_id === t.id))}
          teamPeople={teamPeople} people={d.people} me={me} onClose={() => setBoardFor(null)}
          onCreated={(b) => { const id = boardFor.id; setBoardFor(null); navigate(`/project-manager/projects/${id}?board=${b.id}`); }} />
      )}
      {assigning && <AssignTeams project={assigning} onClose={() => setAssigning(null)} onUpdated={refresh} />}
    </Page>
  );
}
