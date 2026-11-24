import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { BriefcaseBusiness, CalendarDays, FolderKanban, Mail, RefreshCw, Search, UserRound, Users } from "lucide-react";

import { isCurrentProject, useDirectory } from "../../hooks/hierarchy";
import { useAssignments, useProjects, useReporting, useTeamMembers, useTeams } from "../../hooks/queries";
import { ErrorBox, Loading, Page, inputCls } from "../../components/ui";

// One page for Project Managers, Team Leads and Employees, with the projects each person is working on right now
// (project names only, not boards). Everything is read from the live records the signed-in HR / Admin may see.

const TABS = [
  { key: "all", label: "Everyone", roles: ["project_manager", "team_lead", "employee"], icon: Users },
  { key: "pm", label: "Project Managers", roles: ["project_manager"], icon: BriefcaseBusiness },
  { key: "tl", label: "Team Leads", roles: ["team_lead"], icon: UserRound },
  { key: "emp", label: "Employees", roles: ["employee"], icon: Users },
];
const ROLE_PILL = {
  project_manager: ["Project Manager", "border-blue-500/30 bg-blue-500/10 text-blue-300"],
  team_lead: ["Team Lead", "border-cyan-500/30 bg-cyan-500/10 text-cyan-300"],
  employee: ["Employee", "border-slate-500/30 bg-slate-500/10 text-slate-300"],
};
const AVATAR = { project_manager: "from-blue-500 to-indigo-600", team_lead: "from-cyan-500 to-sky-600", employee: "from-slate-500 to-slate-600" };
const name = (p) => p?.full_name || p?.email || "Name not provided";
const joined = (d) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "Not available");

export default function PeopleDirectory() {
  const client = useQueryClient();
  const [params, setParams] = useSearchParams();
  const tab = TABS.find((t) => t.key === params.get("tab")) || TABS[0];
  const [search, setSearch] = useState("");
  const [project, setProject] = useState("");
  const [inactive, setInactive] = useState(false);
  const [open, setOpen] = useState({});                 // person id -> show every project

  const dir = useDirectory();
  const teamsQ = useTeams();
  const membersQ = useTeamMembers();
  const reportingQ = useReporting();
  const projectsQ = useProjects();
  const assignQ = useAssignments();

  const rows = useMemo(() => {
    const people = dir.data || [];
    const byId = Object.fromEntries(people.map((p) => [p.id, p]));
    const teams = (teamsQ.data || []).filter((t) => t.is_active !== false);
    const members = membersQ.data || [];
    const pmOf = Object.fromEntries((reportingQ.data || []).map((r) => [r.team_lead_id, r.project_manager_id]));
    const projects = (projectsQ.data || []).filter(isCurrentProject);
    const assignments = assignQ.data || [];
    const projectsOfTeam = (teamId) => {
      const ids = new Set(assignments.filter((a) => a.team_id === teamId).map((a) => a.project_id));
      return projects.filter((p) => ids.has(p.id));
    };
    const uniq = (list) => [...new Map(list.map((p) => [p.id, p])).values()];

    return people.filter((p) => ["project_manager", "team_lead", "employee"].includes(p.role)).map((p) => {
      let teamList = [];
      let projs = [];
      let reportsTo = null;
      let extra = "";
      if (p.role === "employee") {
        teamList = teams.filter((t) => members.some((m) => m.team_id === t.id && m.employee_id === p.id));
        projs = uniq(teamList.flatMap((t) => projectsOfTeam(t.id)));
        const lead = byId[teamList[0]?.team_lead_id];
        reportsTo = lead ? `Team Lead: ${name(lead)}` : null;
        const pm = lead && byId[pmOf[lead.id]];
        if (pm) extra = `PM: ${name(pm)}`;
      } else if (p.role === "team_lead") {
        teamList = teams.filter((t) => t.team_lead_id === p.id);
        projs = uniq(teamList.flatMap((t) => projectsOfTeam(t.id)));
        const pm = byId[pmOf[p.id]];
        reportsTo = pm ? `PM: ${name(pm)}` : null;
      } else {
        projs = projects.filter((x) => x.project_manager_id === p.id);
        const n = Object.entries(pmOf).filter(([, pm]) => pm === p.id).length;
        extra = `${n} Team Lead${n === 1 ? "" : "s"}`;
      }
      return { ...p, teamList, projs, reportsTo, extra };
    });
  }, [dir.data, teamsQ.data, membersQ.data, reportingQ.data, projectsQ.data, assignQ.data]);

  const counts = Object.fromEntries(TABS.map((t) => [t.key, rows.filter((r) => t.roles.includes(r.role) && (inactive || r.is_active !== false)).length]));
  const q = search.trim().toLowerCase();
  const shown = rows
    .filter((r) => tab.roles.includes(r.role) && (inactive || r.is_active !== false))
    .filter((r) => !project || r.projs.some((p) => p.id === project))
    .filter((r) => !q || [name(r), r.email, r.teamList.map((t) => t.name).join(" "), r.projs.map((p) => p.name).join(" ")].join(" ").toLowerCase().includes(q))
    .sort((a, b) => name(a).localeCompare(name(b)));

  const projectOptions = (projectsQ.data || []).filter(isCurrentProject).sort((a, b) => a.name.localeCompare(b.name));
  const loading = dir.isLoading || teamsQ.isLoading || membersQ.isLoading || projectsQ.isLoading;
  const error = dir.error || teamsQ.error || membersQ.error || reportingQ.error || projectsQ.error || assignQ.error;
  const refresh = () => ["org-directory", "teams", "team-members", "reporting", "projects", "assignments"].forEach((k) => client.invalidateQueries({ queryKey: [k] }));

  return (
    <Page eyebrow="People" title="People" subtitle="Project Managers, Team Leads and Employees in one place, with the projects each person is working on now."
      actions={<button type="button" onClick={refresh} className="flex items-center gap-2 rounded-xl border border-slate-700 bg-[#17243D] px-4 py-2.5 text-sm font-medium text-slate-300 hover:border-blue-500/50 hover:text-white">
        <RefreshCw size={16} className={dir.isFetching ? "animate-spin" : ""} /> Refresh</button>}>
      <ErrorBox error={error} />

      <div className="mb-5 flex flex-wrap gap-2" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab.key === t.key} onClick={() => setParams(t.key === "all" ? {} : { tab: t.key }, { replace: true })}
            className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition ${tab.key === t.key ? "border-blue-500 bg-blue-600/20 text-white" : "border-slate-700 bg-[#111C32] text-slate-300 hover:border-slate-500 hover:text-white"}`}>
            <t.icon size={16} /> {t.label}
            <span className={`rounded-full px-2 py-0.5 text-xs ${tab.key === t.key ? "bg-blue-500/30 text-blue-100" : "bg-slate-700/60 text-slate-300"}`}>{loading ? "…" : counts[t.key]}</span>
          </button>
        ))}
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-700/70 bg-[#101B35]">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-700/70 p-4">
          <div className="relative min-w-56 flex-1 sm:max-w-sm">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, team or project..." className={`${inputCls} !pl-9`} />
          </div>
          <select value={project} onChange={(e) => setProject(e.target.value)} className={`${inputCls} !w-auto min-w-48`} aria-label="Working on project">
            <option value="">Working on: any project</option>
            {projectOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={inactive} onChange={(e) => setInactive(e.target.checked)} className="h-4 w-4 accent-blue-500" /> Include inactive
          </label>
        </div>

        {loading ? <Loading /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left">
              <thead className="bg-[#0B1428] text-xs uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-5 py-3.5 font-semibold">Person</th>
                  <th className="px-5 py-3.5 font-semibold">Team / reports to</th>
                  <th className="px-5 py-3.5 font-semibold">Working on now</th>
                  <th className="px-5 py-3.5 font-semibold">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/60">
                {shown.length === 0 ? (
                  <tr><td colSpan="4" className="px-6 py-14 text-center">
                    <Users size={30} className="mx-auto mb-3 text-slate-600" />
                    <p className="font-medium text-slate-300">No people found</p>
                    <p className="mt-1 text-sm text-slate-500">Try another tab, search or project.</p>
                  </td></tr>
                ) : shown.map((r) => {
                  const [roleLabel, pill] = ROLE_PILL[r.role];
                  const many = r.projs.length > 3 && !open[r.id];
                  const list = many ? r.projs.slice(0, 3) : r.projs;
                  return (
                    <tr key={r.id} className={`align-top transition hover:bg-white/[0.025] ${r.is_active === false ? "opacity-60" : ""}`}>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br ${AVATAR[r.role]} font-semibold text-white`}>{name(r).charAt(0).toUpperCase()}</span>
                          <div className="min-w-0">
                            <p className="truncate font-medium text-white">{name(r)}</p>
                            <p className="flex items-center gap-1.5 truncate text-xs text-slate-500"><Mail size={12} className="shrink-0" />{r.email || "Not available"}</p>
                            <span className={`mt-1.5 inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${pill}`}>{roleLabel}</span>
                            {r.is_active === false && <span className="ml-1.5 inline-block rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-300">Inactive</span>}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-sm">
                        {r.teamList.length > 0 ? <p className="font-medium text-slate-200">{r.teamList.map((t) => t.name).join(", ")}</p> : r.role !== "project_manager" ? <p className="text-slate-500">No team yet</p> : null}
                        {r.reportsTo && <p className="mt-0.5 text-xs text-slate-400">{r.reportsTo}</p>}
                        {r.extra && <p className="mt-0.5 text-xs text-slate-500">{r.extra}</p>}
                      </td>
                      <td className="px-5 py-4">
                        {r.projs.length === 0 ? <span className="text-sm text-slate-500">No current project</span> : (
                          <div className="flex max-w-md flex-wrap gap-1.5">
                            {list.map((p) => (
                              <span key={p.id} className="flex max-w-[16rem] items-center gap-1.5 rounded-lg border border-blue-500/20 bg-blue-500/10 px-2.5 py-1 text-xs text-blue-100" title={p.name}>
                                <FolderKanban size={12} className="shrink-0 text-blue-300" /><span className="truncate">{p.name}</span>
                              </span>
                            ))}
                            {many && <button type="button" onClick={() => setOpen({ ...open, [r.id]: true })} className="rounded-lg border border-slate-600 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-700">+{r.projs.length - 3} more</button>}
                            {open[r.id] && r.projs.length > 3 && <button type="button" onClick={() => setOpen({ ...open, [r.id]: false })} className="rounded-lg px-2 py-1 text-xs text-slate-400 hover:text-white">Show less</button>}
                          </div>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-400"><span className="flex items-center gap-2"><CalendarDays size={14} />{joined(r.created_at)}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!loading && <div className="border-t border-slate-700/70 px-5 py-3 text-xs text-slate-500">Showing {shown.length} of {counts[tab.key]} {tab.label.toLowerCase()}. "Working on now" lists projects that are not completed or cancelled.</div>}
      </section>
    </Page>
  );
}
