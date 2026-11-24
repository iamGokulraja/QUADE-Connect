import { useMemo, useState } from "react";
import { ArrowRightLeft, Crown, FolderKanban, GripVertical, Info, Search, Shield, UserRoundCog, Users } from "lucide-react";

import toast from "../../lib/toast";
import { isCurrentProject, useDirectory, useOrgMoves } from "../../hooks/hierarchy";
import { useAssignments, useProjects, useReporting, useTeamMembers, useTeams } from "../../hooks/queries";
import { ErrorBox, Loading, Modal, Page, btnGhost, btnPrimary, inputCls } from "../../components/ui";

// Reporting Hierarchy as a tree:  Admin -> (HR, QC, Project Managers) -> Team Leads -> Teams -> Employees.
// HR / Admin can drag an Employee onto another team, or a Team Lead onto another Project Manager.
// Every change is confirmed first. Moving people never removes the projects and boards they already worked on.

const ROLE_TONE = {
  admin: "from-fuchsia-500 to-violet-600",
  hr: "from-amber-500 to-orange-600",
  qc: "from-emerald-500 to-teal-600",
  project_manager: "from-blue-500 to-indigo-600",
  team_lead: "from-cyan-500 to-sky-600",
  employee: "from-slate-500 to-slate-600",
};
const first = (p) => p?.full_name || p?.email || "Unnamed";

function Dot({ person, size = 28 }) {
  return (
    <span style={{ width: size, height: size }} className={`grid shrink-0 place-items-center rounded-full bg-gradient-to-br ${ROLE_TONE[person?.role] || ROLE_TONE.employee} text-[11px] font-bold text-white`}>
      {first(person).charAt(0).toUpperCase()}
    </span>
  );
}

// A person that can be dragged (or moved with the small button, which also works on phones and tablets).
function Chip({ person, drag, dim, onStart, onEnd, onMove, hint }) {
  return (
    <div draggable onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", person.id); onStart(); }} onDragEnd={onEnd}
      title={person.email || ""}
      className={`group flex cursor-grab items-center gap-2 rounded-xl border bg-[#0D172A] px-2 py-1.5 text-left active:cursor-grabbing ${drag ? "opacity-40" : ""} ${dim ? "opacity-30" : ""} border-slate-700 hover:border-blue-500/60`}>
      <GripVertical size={14} className="shrink-0 text-slate-600 group-hover:text-slate-400" />
      <Dot person={person} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-white">{first(person)}</span>
        {hint ? <span className="block truncate text-[10px] text-slate-500">{hint}</span> : null}
      </span>
      <button type="button" onClick={onMove} aria-label={`Move ${first(person)}`} title="Move to another place"
        className="rounded-lg p-1 text-slate-500 hover:bg-slate-700 hover:text-white"><ArrowRightLeft size={14} /></button>
    </div>
  );
}

function Node({ person, label, tone, children, over, droppable, onDragOver, onDragLeave, onDrop, dim, stats }) {
  return (
    <div onDragOver={droppable ? onDragOver : undefined} onDragLeave={droppable ? onDragLeave : undefined} onDrop={droppable ? onDrop : undefined}
      className={`w-60 rounded-2xl border bg-[#101B35] p-3 text-left shadow-lg shadow-black/20 transition ${dim ? "opacity-30" : ""} ${over ? "border-blue-400 ring-2 ring-blue-400/50" : "border-slate-700/80"}`}>
      <div className="flex items-center gap-3">
        <Dot person={person} size={38} />
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-white">{first(person)}</p>
          <p className={`text-[11px] font-semibold uppercase tracking-wider ${tone}`}>{label}</p>
        </div>
      </div>
      {stats ? <p className="mt-2 text-[11px] text-slate-400">{stats}</p> : null}
      {children}
    </div>
  );
}

export default function ReportingHierarchy() {
  const dir = useDirectory();
  const teamsQ = useTeams();
  const membersQ = useTeamMembers();
  const reportingQ = useReporting();
  const projectsQ = useProjects();
  const assignQ = useAssignments();
  const moves = useOrgMoves();

  const [query, setQuery] = useState("");
  const [drag, setDrag] = useState(null);        // { kind: "emp" | "tl", id, from }
  const [over, setOver] = useState("");          // id of the drop target under the pointer
  const [plan, setPlan] = useState(null);        // the change waiting for confirmation

  const people = useMemo(() => (dir.data || []).filter((p) => p.is_active !== false), [dir.data]);
  const byId = useMemo(() => Object.fromEntries((dir.data || []).map((p) => [p.id, p])), [dir.data]);
  const role = (r) => people.filter((p) => p.role === r);
  const admins = role("admin"), hrs = role("hr"), qcs = role("qc"), pms = role("project_manager"), leads = role("team_lead");

  const teams = useMemo(() => (teamsQ.data || []).filter((t) => t.is_active !== false), [teamsQ.data]);
  const members = membersQ.data || [];
  const reporting = reportingQ.data || [];
  const projects = projectsQ.data || [];
  const assignments = assignQ.data || [];

  const pmOf = useMemo(() => Object.fromEntries(reporting.map((r) => [r.team_lead_id, r.project_manager_id])), [reporting]);
  const teamsOfLead = (id) => teams.filter((t) => t.team_lead_id === id);
  const employeesOf = (teamId) => members.filter((m) => m.team_id === teamId).map((m) => byId[m.employee_id]).filter((p) => p && p.is_active !== false && p.role === "employee");
  const projectsOfTeam = (teamId) => {
    const ids = new Set(assignments.filter((a) => a.team_id === teamId).map((a) => a.project_id));
    return projects.filter((p) => ids.has(p.id) && isCurrentProject(p));
  };
  const currentOfPm = (id) => projects.filter((p) => p.project_manager_id === id && isCurrentProject(p)).length;

  const inTeam = new Set(members.map((m) => m.employee_id));
  const freeEmployees = role("employee").filter((p) => !inTeam.has(p.id));
  const freeLeads = leads.filter((l) => !pmOf[l.id] || !byId[pmOf[l.id]] || byId[pmOf[l.id]].is_active === false);
  const leadless = teams.filter((t) => !t.team_lead_id || !byId[t.team_lead_id] || byId[t.team_lead_id].is_active === false);
  const leadlessIds = new Set(leadless.map((t) => t.id));

  const q = query.trim().toLowerCase();
  const matches = (p) => !q || first(p).toLowerCase().includes(q) || (p.email || "").toLowerCase().includes(q);
  const dimmed = (p) => !!q && !matches(p);

  const teamName = (id) => teams.find((t) => t.id === id)?.name || "No team";
  const loading = dir.isLoading || teamsQ.isLoading || membersQ.isLoading || reportingQ.isLoading;
  const error = dir.error || teamsQ.error || membersQ.error || reportingQ.error || projectsQ.error || assignQ.error;

  /* ---- drag and drop: it only prepares a change; the dialog asks before anything is saved ---- */
  const startEmp = (person, from) => setTimeout(() => setDrag({ kind: "emp", id: person.id, from }), 0);   // after the browser has begun the drag
  const startLead = (person) => setTimeout(() => setDrag({ kind: "tl", id: person.id, from: pmOf[person.id] || null }), 0);
  const end = () => { setDrag(null); setOver(""); };
  const dropOn = (target) => (e) => {
    e.preventDefault();
    const d = drag;
    end();
    if (!d) return;
    if (d.kind === "emp" && target.type === "team" && d.from !== target.id) setPlan({ kind: "emp", id: d.id, from: d.from, to: target.id });
    if (d.kind === "emp" && target.type === "free" && d.from) setPlan({ kind: "emp", id: d.id, from: d.from, to: "" });
    if (d.kind === "tl" && target.type === "pm" && d.from !== target.id) setPlan({ kind: "tl", id: d.id, from: d.from, to: target.id });
    if (d.kind === "tl" && target.type === "free" && d.from) setPlan({ kind: "tl", id: d.id, from: d.from, to: "" });
  };
  const canDrop = (type) => !!drag && ((drag.kind === "emp" && (type === "team" || type === "free")) || (drag.kind === "tl" && (type === "pm" || type === "free")));
  const zone = (type, id) => ({
    droppable: canDrop(type), over: over === id && canDrop(type),
    onDragOver: (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (over !== id) setOver(id); },
    onDragLeave: () => setOver((o) => (o === id ? "" : o)),
    onDrop: dropOn({ type, id }),
  });

  /* ---- confirmation dialog ---- */
  const confirm = () => {
    const p = plan;
    const done = (m) => () => { toast.success(m); setPlan(null); };
    const fail = (e) => toast.error(e.message || "Could not save the change.");
    if (p.kind === "emp") moves.moveEmployee.mutate({ employee: p.id, from: p.from || null, to: p.to || null }, { onSuccess: done(`${first(byId[p.id])} moved.`), onError: fail });
    else if (p.kind === "tl") moves.moveLead.mutate({ lead: p.id, pm: p.to || null }, { onSuccess: done(`${first(byId[p.id])} now reports to ${p.to ? first(byId[p.to]) : "nobody (unassigned)"}.`), onError: fail });
    else moves.setTeamLead.mutate({ team: p.id, lead: p.to || null }, { onSuccess: done("Team Lead changed."), onError: fail });
  };
  const busy = moves.moveEmployee.isPending || moves.moveLead.isPending || moves.setTeamLead.isPending;

  const renderTeam = (team) => {
    const emps = employeesOf(team.id);
    const projs = projectsOfTeam(team.id);
    const z = zone("team", team.id);
    return (
      <div onDragOver={z.droppable ? z.onDragOver : undefined} onDragLeave={z.onDragLeave} onDrop={z.droppable ? z.onDrop : undefined}
        className={`w-60 rounded-2xl border-2 border-dashed bg-[#0B1428] p-3 text-left transition ${z.over ? "border-blue-400 bg-blue-500/10" : z.droppable ? "border-blue-500/40" : "border-slate-700"}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-white">{team.name}</p>
            <p className="truncate text-[11px] text-slate-400">Lead: {team.team_lead_id && byId[team.team_lead_id] ? first(byId[team.team_lead_id]) : "none"}</p>
          </div>
          <button type="button" onClick={() => setPlan({ kind: "lead", id: team.id, from: team.team_lead_id || "", to: "" })} title="Change Team Lead"
            className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-700 hover:text-white"><UserRoundCog size={15} /></button>
        </div>
        {projs.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1" title={projs.map((p) => p.name).join(", ")}>
            {projs.slice(0, 2).map((p) => <span key={p.id} className="flex max-w-full items-center gap-1 truncate rounded-md bg-blue-500/10 px-1.5 py-0.5 text-[10px] text-blue-200"><FolderKanban size={10} className="shrink-0" />{p.name}</span>)}
            {projs.length > 2 && <span className="rounded-md bg-slate-700/60 px-1.5 py-0.5 text-[10px] text-slate-300">+{projs.length - 2} more</span>}
          </div>
        )}
        <div className="mt-3 space-y-1.5">
          {emps.map((p) => <Chip key={p.id} person={p} drag={drag?.id === p.id} dim={dimmed(p)} onStart={() => startEmp(p, team.id)} onEnd={end} onMove={() => setPlan({ kind: "emp", id: p.id, from: team.id, to: "" })} />)}
          {emps.length === 0 && <p className="rounded-xl border border-slate-800 px-3 py-4 text-center text-[11px] text-slate-500">No employees yet. Drag one here.</p>}
        </div>
      </div>
    );
  };

  const renderFree = ({ title, hint, children, type = "free", id }) => {
    const z = zone(type, id);
    return (
      <div onDragOver={z.droppable ? z.onDragOver : undefined} onDragLeave={z.onDragLeave} onDrop={z.droppable ? z.onDrop : undefined}
        className={`rounded-2xl border-2 border-dashed p-4 transition ${z.over ? "border-blue-400 bg-blue-500/10" : z.droppable ? "border-blue-500/40" : "border-slate-700"}`}>
        <p className="text-sm font-semibold text-white">{title}</p>
        <p className="mb-3 text-xs text-slate-500">{hint}</p>
        <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">{children}</div>
      </div>
    );
  };

  const needsPlacing = freeLeads.length + freeEmployees.length + leadless.length > 0;

  return (
    <Page eyebrow="Organization" title="Reporting Hierarchy" subtitle="Admin, HR, Project Managers, Team Leads and employees as one tree. Drag people to change their team or manager.">
      <ErrorBox error={error} />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a person..." className={`${inputCls} !w-64 !pl-9`} />
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-slate-300">
          {[["Project Managers", pms.length], ["Team Leads", leads.length], ["Teams", teams.length], ["Employees", role("employee").length]].map(([l, n]) => (
            <span key={l} className="rounded-full border border-slate-700 bg-[#111C32] px-3 py-1.5"><b className="text-white">{n}</b> {l}</span>
          ))}
        </div>
      </div>
      <div className="mb-6 flex items-start gap-3 rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3 text-sm text-slate-300">
        <Info size={18} className="mt-0.5 shrink-0 text-blue-400" />
        <p>
          <b className="text-white">Drag an employee</b> onto another team, or <b className="text-white">drag a Team Lead</b> onto another Project Manager. Use the <ArrowRightLeft size={13} className="inline" /> button instead on a phone or tablet, and <UserRoundCog size={13} className="inline" /> to change a team's lead.
          People keep the projects, boards and tasks they already worked on; new projects follow the new team.
        </p>
      </div>

      {loading ? <Loading /> : (
        <>
          {needsPlacing && (
            <div className="mb-6 grid gap-4 xl:grid-cols-3">
              {freeLeads.length > 0 && (
                <div key="ftl">{renderFree({ id: "free-tl", title: "Team Leads without a Project Manager", hint: "Drag onto a Project Manager below. Dropping here removes the link.", children: (<>
                  {freeLeads.map((p) => <Chip key={p.id} person={p} drag={drag?.id === p.id} dim={dimmed(p)} onStart={() => startLead(p)} onEnd={end} onMove={() => setPlan({ kind: "tl", id: p.id, from: null, to: "" })} hint={teamsOfLead(p.id).map((t) => t.name).join(", ") || "No team yet"} />)}
                </>) })}</div>
              )}
              {freeEmployees.length > 0 && (
                <div key="femp">{renderFree({ id: "free-emp", title: "Employees without a team", hint: "Drag onto a team below. Dropping here removes them from their team.", children: (<>
                  {freeEmployees.map((p) => <Chip key={p.id} person={p} drag={drag?.id === p.id} dim={dimmed(p)} onStart={() => startEmp(p, null)} onEnd={end} onMove={() => setPlan({ kind: "emp", id: p.id, from: null, to: "" })} />)}
                </>) })}</div>
              )}
              {leadless.length > 0 && (
                <div className="rounded-2xl border-2 border-dashed border-slate-700 p-4">
                  <p className="text-sm font-semibold text-white">Teams without a Team Lead</p>
                  <p className="mb-3 text-xs text-slate-500">Choose a lead with the <UserRoundCog size={12} className="inline" /> button, or drag employees into them.</p>
                  <div className="flex flex-wrap gap-3">{leadless.map((t) => <div key={t.id}>{renderTeam(t)}</div>)}</div>
                </div>
              )}
            </div>
          )}

          <div className="qc-tree overflow-x-auto rounded-2xl border border-slate-700/60 bg-[#0D1526] pb-8">
            <div className="mx-auto w-max min-w-full px-6">
              <ul>
                <li>
                  <Node person={admins[0] || { role: "admin", full_name: "Admin" }} label={admins.length > 1 ? `Admin · +${admins.length - 1} more` : "Admin"} tone="text-fuchsia-300" dim={admins[0] && dimmed(admins[0])}
                    stats="Top of the organisation" />
                  <ul>
                    {hrs.length > 0 && (
                      <li>
                        <div className="w-60 rounded-2xl border border-slate-700/80 bg-[#101B35] p-3 text-left">
                          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-amber-300"><Shield size={14} /> HR · {hrs.length}</p>
                          <div className="mt-2 space-y-1.5">{hrs.map((p) => <div key={p.id} className={`flex items-center gap-2 text-[13px] text-white ${dimmed(p) ? "opacity-30" : ""}`}><Dot person={p} size={24} />{first(p)}</div>)}</div>
                        </div>
                      </li>
                    )}
                    {qcs.length > 0 && (
                      <li>
                        <div className="w-60 rounded-2xl border border-slate-700/80 bg-[#101B35] p-3 text-left">
                          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-emerald-300"><Crown size={14} /> Quality Control · {qcs.length}</p>
                          <div className="mt-2 space-y-1.5">{qcs.map((p) => <div key={p.id} className={`flex items-center gap-2 text-[13px] text-white ${dimmed(p) ? "opacity-30" : ""}`}><Dot person={p} size={24} />{first(p)}</div>)}</div>
                        </div>
                      </li>
                    )}
                    {pms.map((pm) => {
                      const mine = leads.filter((l) => pmOf[l.id] === pm.id);
                      return (
                        <li key={pm.id}>
                          <Node person={pm} label="Project Manager" tone="text-blue-300" dim={dimmed(pm)} {...zone("pm", pm.id)}
                            stats={`${mine.length} Team Lead${mine.length === 1 ? "" : "s"} · ${currentOfPm(pm.id)} current project${currentOfPm(pm.id) === 1 ? "" : "s"}`}>
                            {canDrop("pm") && <p className="mt-2 rounded-lg border border-dashed border-blue-400/40 py-1.5 text-center text-[11px] text-blue-300">Drop a Team Lead here</p>}
                          </Node>
                          {mine.length > 0 && (
                            <ul>
                              {mine.map((tl) => (
                                <li key={tl.id}>
                                  <div className="w-60"><Chip person={tl} drag={drag?.id === tl.id} dim={dimmed(tl)} onStart={() => startLead(tl)} onEnd={end} onMove={() => setPlan({ kind: "tl", id: tl.id, from: pm.id, to: "" })} hint="Team Lead" /></div>
                                  <ul>
                                    {teamsOfLead(tl.id).length === 0 ? (
                                      <li><div className="w-60 rounded-2xl border border-dashed border-slate-700 px-3 py-4 text-center text-[11px] text-slate-500">No team yet. HR creates one in Teams.</div></li>
                                    ) : teamsOfLead(tl.id).map((t) => <li key={t.id}>{renderTeam(t)}</li>)}
                                  </ul>
                                </li>
                              ))}
                            </ul>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </li>
              </ul>
              {pms.length === 0 && <p className="mt-6 flex items-center justify-center gap-2 text-sm text-slate-500"><Users size={16} /> No active Project Managers. Create them from Create User.</p>}
            </div>
          </div>
          {leadlessIds.size === 0 && !needsPlacing && <p className="mt-3 text-xs text-slate-500">Everyone is placed in the tree.</p>}
        </>
      )}

      {plan && <MovePlan plan={plan} setPlan={setPlan} byId={byId} teams={teams} pms={pms} leads={leads} pmOf={pmOf} teamName={teamName}
        busy={busy} onConfirm={confirm} onClose={() => !busy && setPlan(null)} />}
    </Page>
  );
}

// "Are you sure?" with a plain explanation of what changes and what stays.
function MovePlan({ plan, setPlan, byId, teams, pms, leads, pmOf, teamName, busy, onConfirm, onClose }) {
  const who = byId[plan.id];
  let title, options, current, notes;
  if (plan.kind === "emp") {
    title = `Move ${first(who)}`;
    current = plan.from ? teamName(plan.from) : "No team";
    options = [{ v: "", l: "No team (unassigned)" }, ...teams.filter((t) => t.id !== plan.from).map((t) => ({ v: t.id, l: `${t.name}${t.team_lead_id && byId[t.team_lead_id] ? ` · ${first(byId[t.team_lead_id])}` : ""}` }))];
    notes = [
      "Their existing boards and tasks stay exactly as they are.",
      "Projects of the old team stay visible to them under \"Previous team\", with the same project owner.",
      "Projects of the new team (including ones assigned later) appear for them.",
    ];
  } else if (plan.kind === "tl") {
    title = `Move ${first(who)} to another Project Manager`;
    current = pmOf[plan.id] && byId[pmOf[plan.id]] ? first(byId[pmOf[plan.id]]) : "No Project Manager";
    options = [{ v: "", l: "No Project Manager (unassigned)" }, ...pms.filter((p) => p.id !== pmOf[plan.id]).map((p) => ({ v: p.id, l: first(p) }))];
    notes = [
      "Their team and employees stay together.",
      "Existing projects keep their current owner and boards; nothing is moved or deleted.",
      "The new Project Manager can give this team new projects from now on.",
    ];
  } else {
    const team = teams.find((t) => t.id === plan.id);
    title = `Change Team Lead of ${team?.name || "team"}`;
    current = plan.from && byId[plan.from] ? first(byId[plan.from]) : "No Team Lead";
    options = [{ v: "", l: "No Team Lead" }, ...leads.filter((l) => l.id !== plan.from).map((l) => ({ v: l.id, l: first(l) }))];
    notes = [
      "The employees stay in the team.",
      "The previous lead keeps seeing this team's current projects as \"Previous team\".",
      "The team now sits under the new lead's Project Manager in the tree.",
    ];
  }
  const before = plan.kind === "tl" ? pmOf[plan.id] || "" : plan.from || "";
  const unchanged = (plan.to || "") === before;
  const target = plan.kind === "emp" ? "team" : plan.kind === "tl" ? "Project Manager" : "Team Lead";
  return (
    <Modal title={title} subtitle={`Now: ${current}`} onClose={onClose}
      footer={<>
        <button className={btnGhost} onClick={onClose} disabled={busy}>Cancel</button>
        <button className={btnPrimary} onClick={onConfirm} disabled={busy || unchanged}>{busy ? "Saving..." : "Confirm change"}</button>
      </>}>
      <label className="block text-sm">
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">New {target}</span>
        <select className={inputCls} value={plan.to} onChange={(e) => setPlan({ ...plan, to: e.target.value })}>
          {options.map((o) => <option key={o.v || "none"} value={o.v}>{o.l}</option>)}
        </select>
      </label>
      <ul className="space-y-1.5 rounded-xl border border-slate-700/70 bg-[#0D172A] p-4 text-sm text-slate-300">
        {notes.map((n) => <li key={n} className="flex gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-400" />{n}</li>)}
      </ul>
    </Modal>
  );
}
