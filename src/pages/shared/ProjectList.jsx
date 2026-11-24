import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FolderKanban, Plus } from "lucide-react";

import { ROLE_BASE } from "../../lib/constants";
import { fmtDate, taskStats } from "../../lib/utils";
import { useMe, useWorkData } from "../../hooks/queries";
import { useBoards, useGroups } from "../../hooks/boards";
import { boardPerms, taskPerms } from "../../lib/board";
import { useScope } from "../../hooks/scope";
import BoardTable from "../../components/board/BoardTable";
import TaskModal from "../../components/board/TaskModal";
import { CreateBoardModal } from "../../components/board/BoardSwitcher";
import { Badge, Card, Empty, ErrorBox, Loading, Page, Priority } from "../../components/ui";

// Team Lead: "Projects & Tasks".  Employee: "My Work" = assigned projects + all my tasks in one place.
// Boards and tasks are created inside a project (see ProjectWorkspace).
export default function ProjectList() {
  const { data: me } = useMe();
  const d = useWorkData();
  const boards = useBoards().data || [];
  const groups = useGroups().data || [];
  const scope = useScope(me, d);
  const isLead = me.role === "team_lead";
  const [tab, setTab] = useState("projects");
  const [open, setOpen] = useState(null);
  const [creating, setCreating] = useState(null); // project to create a board in
  const navigate = useNavigate();
  const teamsFor = (p) => {
    const onProject = d.assignments.filter((a) => a.project_id === p.id).map((a) => a.team_id);
    const mine = isLead ? scope.ledIds : scope.memberIds;
    return d.teams.filter((t) => onProject.includes(t.id) && mine.includes(t.id));
  };
  const base = ROLE_BASE[me.role];

  const teamPeople = Object.fromEntries(d.teams.map((t) => [t.id, [t.team_lead_id, ...d.members.filter((m) => m.team_id === t.id).map((m) => m.employee_id)].filter(Boolean)]));
  const openProject = open && scope.projects.find((p) => p.id === open.project_id);

  return (
    <Page
      eyebrow="Workspace"
      title={isLead ? "Projects & Tasks" : "My Work"}
      subtitle={isLead ? "Projects assigned to the teams you lead. Open a project to manage boards and see who is working on what." : "Open an assigned project, create a board inside it and add tasks. Tasks and sub-tasks you add stay in the project, so your Team Lead and Project Manager can follow your work."}
    >
      <ErrorBox error={d.error} />

      {!isLead && (
        <div className="mb-5 flex w-fit gap-1 rounded-lg bg-[#0D172A] p-1">
          {[["projects", "Projects"], ["tasks", "All my tasks"]].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={`rounded-md px-4 py-1.5 text-sm ${tab === k ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"}`}>{l}</button>
          ))}
        </div>
      )}

      <Card>
        {d.isLoading ? (
          <Loading />
        ) : scope.projects.length === 0 ? (
          <Empty icon={FolderKanban} title="No projects assigned yet" text="When a Project Manager assigns your team to a project it will appear here." />
        ) : tab === "tasks" && !isLead ? (
          <BoardTable tasks={scope.own} boards={boards} projects={scope.projects} sectionBy="project" me={me} teams={d.teams} people={d.people} onOpen={setOpen} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead>
                <tr className="bg-[#17243D]/70 text-xs uppercase tracking-wider text-slate-400">
                  <th className="px-5 py-4">Project</th><th className="px-5 py-4">Priority</th><th className="px-5 py-4">Status</th><th className="px-5 py-4">Due</th>
                  <th className="px-5 py-4">Boards</th><th className="px-5 py-4">Tasks</th><th className="px-5 py-4">Blocked</th><th className="px-5 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {scope.projects.map((p) => {
                  const s = taskStats(scope.own.filter((t) => t.project_id === p.id));
                  const count = boards.filter((b) => b.board_type === "project" && b.project_id === p.id).length;
                  return (
                    <tr key={p.id} className="hover:bg-blue-500/[0.05]">
                      <td className="px-5 py-4"><Link to={`${base}/projects/${p.id}`} className="font-semibold text-white hover:text-blue-300">{p.name}</Link>
                        {scope.legacyIds.has(p.id) && <span title="You moved to another team. You keep this project and your boards here." className="ml-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300">Previous team</span>}</td>
                      <td className="px-5 py-4"><Priority value={p.priority} /></td>
                      <td className="px-5 py-4"><Badge status={p.status} /></td>
                      <td className="px-5 py-4 text-slate-400">{fmtDate(p.due_date)}</td>
                      <td className="px-5 py-4 text-slate-300">{count}</td>
                      <td className="px-5 py-4 text-slate-300">{s.completed}/{s.total} done</td>
                      <td className={`px-5 py-4 ${s.onHold ? "font-medium text-orange-400" : "text-slate-500"}`}>{s.onHold}</td>
                      <td className="whitespace-nowrap px-5 py-4 text-right">
                        {!scope.legacyIds.has(p.id) && <button onClick={() => setCreating(p)} className="mr-2 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"><Plus size={14} /> Create board</button>}
                        <Link to={`${base}/projects/${p.id}`} className="rounded-lg border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800">Open</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {creating && (
        <CreateBoardModal project={creating} teamOptions={teamsFor(creating)} teamPeople={teamPeople} people={d.people} me={me} onClose={() => setCreating(null)}
          onCreated={(b) => { const id = creating.id; setCreating(null); navigate(`${base}/projects/${id}?board=${b.id}`); }} />
      )}

      {open && openProject && (
        <TaskModal task={open} project={openProject} board={boards.find((b) => b.id === open.board_id)} groups={groups}
          allTasks={d.tasks} me={me} people={d.people}
          canManage={taskPerms(open, me, boards.find((b) => b.id === open.board_id)).edit}
          readOnly={!boardPerms(boards.find((b) => b.id === open.board_id), me).canAdd} onClose={() => setOpen(null)} />
      )}
    </Page>
  );
}
