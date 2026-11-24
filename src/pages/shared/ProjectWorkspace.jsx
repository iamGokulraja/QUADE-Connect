import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChartPie, Columns3, ChartGantt, MessageCircle, Plus, Search, Table2, UserRound } from "lucide-react";

import { supabase } from "../../lib/supabaseClient";
import { ROLE_BASE } from "../../lib/constants";
import { boardOwnerIds, boardPerms, taskOwnerIds, taskPerms } from "../../lib/board";
import { fmtDate, fmtHours, isDueTomorrow, isOverdue, taskStats, topLevel } from "../../lib/utils";
import { personName, useMe, useWorkData } from "../../hooks/queries";
import { useAttachmentCounts, useBoardColumns, useBoards, useGroups } from "../../hooks/boards";
import { useScope } from "../../hooks/scope";
import BoardSwitcher, { BoardForm, CreateBoardModal } from "../../components/board/BoardSwitcher";
import BoardTable from "../../components/board/BoardTable";
import BoardKanban from "../../components/board/BoardKanban";
import BoardGantt from "../../components/board/BoardGantt";
import BoardDashboard from "../../components/board/BoardDashboard";
import BoardChat from "../../components/board/BoardChat";
import BoardOwner from "../../components/board/BoardOwner";
import BoardMenu from "../../components/board/BoardMenu";
import ColumnsModal from "../../components/board/ColumnsModal";
import { AvatarStack } from "../../components/board/Avatars";
import TaskModal from "../../components/board/TaskModal";
import { Badge, Card, Empty, ErrorBox, Loading, Page, Priority, btnPrimary, inputCls } from "../../components/ui";

const VIEWS = [
  { key: "table", label: "Table", icon: Table2 },
  { key: "kanban", label: "Kanban", icon: Columns3 },
  { key: "gantt", label: "Gantt", icon: ChartGantt },
  { key: "dashboard", label: "Dashboard", icon: ChartPie },
  { key: "chat", label: "Discussion", icon: MessageCircle },
];

// One workspace per project, used by every role:
//  Employee        : creates boards for themselves inside the project and adds tasks to them
//  Team Lead       : creates boards and chooses their owners; sees every board of the team
//  Project Manager : creates boards for the project's teams and sees every board of the project
//  Admin           : read-only
export default function ProjectWorkspace() {
  const { projectId } = useParams();
  const [params, setParams] = useSearchParams();
  const client = useQueryClient();
  const { data: me } = useMe();
  const d = useWorkData();
  const boardsQ = useBoards();
  const groups = useGroups().data || [];
  const allColumns = useBoardColumns().data || [];
  const attachCounts = useAttachmentCounts().data || {};
  const scope = useScope(me, d);
  const [showOwner, setShowOwner] = useState(false);
  const [editingBoard, setEditingBoard] = useState(false);
  const [editingCols, setEditingCols] = useState(false);
  const [open, setOpen] = useState(null); // the task being viewed
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const [who, setWho] = useState("");
  const [error, setError] = useState("");

  const view = params.get("view") || "table";
  const selected = params.get("board") || "all";
  const setView = (v) => setParams((p) => { p.set("view", v); return p; }, { replace: true });
  const setSelected = (b) => setParams((p) => { b === "all" ? p.delete("board") : p.set("board", b); return p; }, { replace: true });

  const base = ROLE_BASE[me.role];
  const backTo = me.role === "admin" ? "/admin/portfolio" : `${base}/projects`;
  const isLead = me.role === "team_lead";
  const isEmployee = me.role === "employee";
  const isPM = me.role === "project_manager";
  const project = scope.projects.find((p) => p.id === projectId);

  const data = useMemo(() => {
    if (!project) return null;
    const teamIds = d.assignments.filter((a) => a.project_id === project.id).map((a) => a.team_id);
    let teams = d.teams.filter((t) => teamIds.includes(t.id));
    if (isLead) teams = teams.filter((t) => scope.ledIds.includes(t.id) || scope.historyTeamIds.has(t.id));
    if (isEmployee) teams = teams.filter((t) => scope.memberIds.includes(t.id) || scope.historyTeamIds.has(t.id));
    const tasks = scope.tasks.filter((t) => t.project_id === project.id);
    // the database decides which boards you may see
    const boards = (boardsQ.data || []).filter((b) => b.board_type === "project" && b.project_id === project.id && teams.some((t) => t.id === b.team_id));
    // people a board can belong to: the Team Lead and the employees of the team
    const members = {};
    d.teams.forEach((t) => { members[t.id] = [t.team_lead_id, ...d.members.filter((m) => m.team_id === t.id).map((m) => m.employee_id)].filter(Boolean); });
    return { teams, tasks, boards, members };
  }, [project, d, scope, boardsQ.data, isLead, isEmployee]);

  if (d.isLoading) return <Loading text="Loading project..." />;
  if (!project) {
    return (
      <Page title="Project not found">
        <Empty title="This project does not exist or you do not have access to it." />
        <Link to={backTo} className="text-sm text-blue-400">← Back to projects</Link>
      </Page>
    );
  }

  const { teams, tasks, boards, members } = data;
  const board = boards.find((b) => b.id === selected);
  const perms = boardPerms(board, me);
  const mine = (t) => taskOwnerIds(t).includes(me.id) || t.created_by === me.id;
  const stats = taskStats(isEmployee ? tasks.filter(mine) : tasks);
  const canCreateBoard = (isLead || isEmployee || isPM) && teams.length > 0 && !scope.legacyIds.has(project.id);   // a project from a previous team is view-only for new boards
  const owners = board ? boardOwnerIds(board) : [];
  const canOwners = !!board && perms.manage && board.created_by_role !== "employee";

  let shown = tasks.filter((t) => selected === "all" || t.board_id === selected);
  if (who) shown = shown.filter((t) => taskOwnerIds(t).includes(who));
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    const hit = new Set(shown.filter((t) => t.title.toLowerCase().includes(q)).map((t) => t.parent_task_id || t.id));
    shown = shown.filter((t) => hit.has(t.id) || hit.has(t.parent_task_id));
  }
  const peopleInView = [...new Set(tasks.flatMap(taskOwnerIds))];
  const leads = [...new Set(teams.map((t) => t.team_lead_id).filter(Boolean))];

  const removeBoard = async () => {
    const count = tasks.filter((t) => t.board_id === board.id).length;
    if (!window.confirm(`Delete board "${board.name}"${count ? ` and its ${count} task(s) and sub-tasks` : ""}? This cannot be undone.`)) return;
    const { error: err } = await supabase.from("task_boards").delete().eq("id", board.id);
    if (err) return setError(err.message);
    setError(""); setSelected("all");
    ["boards", "groups", "tasks"].forEach((k) => client.invalidateQueries({ queryKey: [k] }));
  };

  const openTask = open || null;
  const taskBoard = boards.find((b) => b.id === openTask?.board_id);
  const tbPerms = boardPerms(taskBoard, me);
  const boardColumns = board ? allColumns.filter((c) => c.board_id === board.id) : [];
  const ownerLabel = owners.length === 1 ? personName(d.people, owners[0]).split(" ")[0] : `${owners.length} owners`;

  return (
    <Page
      eyebrow={<Link to={backTo} className="inline-flex items-center gap-1"><ArrowLeft size={13} /> {isEmployee ? "My Work" : me.role === "admin" ? "Portfolio" : "Projects & Tasks"}</Link>}
      title={project.name}
      subtitle={project.description}
    >
      <ErrorBox error={error || d.error || boardsQ.error} />

      {isDueTomorrow(project) && (
        <p className="mb-5 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-300">This project is due tomorrow. Please check the status of its tasks.</p>
      )}

      <div className="mb-6 flex flex-wrap items-center gap-x-8 gap-y-3 rounded-2xl border border-slate-700/70 bg-[#111C32] px-5 py-4 text-sm">
        <div className="flex items-center gap-2"><Badge status={project.status} /><Priority value={project.priority} /></div>
        <Info label="Timeline"><span className={isOverdue(project) ? "text-red-400" : ""}>{project.start_date ? `${fmtDate(project.start_date)} → ` : "Due "}{fmtDate(project.due_date)}</span></Info>
        <Info label="Project Manager">{personName(d.people, project.project_manager_id)}</Info>
        <Info label="Team Lead">{leads.map((id) => personName(d.people, id)).join(", ") || "—"}</Info>
        <Info label={isEmployee ? "My tasks" : "Tasks"}>
          {stats.completed} done · {stats.total - stats.completed} open
          {stats.onHold ? <span className="text-orange-400"> · {stats.onHold} blocked</span> : null}
          {stats.overdue ? <span className="text-red-400"> · {stats.overdue} overdue</span> : null}
          <span className="text-slate-500"> · {fmtHours(topLevel(tasks).reduce((a, t) => a + Number(t.actual_hours || 0), 0))} logged</span>
        </Info>
      </div>

      <Card className="mb-7">
        <BoardSwitcher boards={boards} selected={selected} onSelect={setSelected} canCreate={canCreateBoard} onCreate={() => setCreating(true)} me={me} people={d.people} />

        <div className="flex flex-wrap items-center gap-3 border-b border-slate-700/70 px-4 py-3">
          <div className="flex gap-1 rounded-lg bg-[#0D172A] p-1">
            {VIEWS.map((v) => (
              <button key={v.key} onClick={() => setView(v.key)}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm ${view === v.key ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"}`}>
                <v.icon size={14} /> {v.label}
              </button>
            ))}
          </div>
          {board && (
            <button onClick={() => setShowOwner(true)} title="Board owners" className="inline-flex items-center gap-2 rounded-lg border border-slate-600 py-1 pl-2 pr-3 text-sm text-slate-200 hover:bg-slate-800">
              <UserRound size={14} className="text-blue-300" />
              <AvatarStack ids={owners} people={d.people} size={22} max={3} />
              <span className="max-w-[120px] truncate">{ownerLabel}</span>
            </button>
          )}
          {view !== "dashboard" && view !== "chat" && (
            <>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tasks" className={`${inputCls} !w-48 !py-1.5 !pl-8 !text-sm`} />
              </div>
              {!isEmployee && peopleInView.length > 1 && (
                <select value={who} onChange={(e) => setWho(e.target.value)} className={`${inputCls} !w-44 !py-1.5 !text-sm`}>
                  <option value="">Everyone</option>
                  {peopleInView.map((id) => <option key={id} value={id}>{personName(d.people, id)}</option>)}
                </select>
              )}
            </>
          )}
          {board && (
            <div className="ml-auto">
              <BoardMenu board={board} project={project} team={d.teams.find((t) => t.id === board.team_id)} people={d.people}
                taskCount={tasks.filter((t) => t.board_id === board.id && !t.parent_task_id).length} perms={perms} canOwners={canOwners}
                onEdit={() => setEditingBoard(true)} onOwners={() => setShowOwner(true)} onColumns={() => setEditingCols(true)} onDelete={removeBoard} />
            </div>
          )}
        </div>

        {boards.length === 0 && (
          <div className="p-12 text-center">
            <p className="text-lg font-semibold text-white">No boards in this project yet</p>
            <p className="mt-1 text-sm text-slate-400">{canCreateBoard ? "Create a board, then add tasks and sub-tasks to it." : "Boards created by the team will appear here."}</p>
            {canCreateBoard && <button className={`${btnPrimary} mt-5`} onClick={() => setCreating(true)}><Plus size={16} /> Create board</button>}
          </div>
        )}
        {boards.length > 0 && !board && view === "table" && canCreateBoard && <p className="px-5 pt-4 text-xs text-slate-500">Select a board above to add tasks.</p>}
        {view === "table" && (
          <BoardTable attachCounts={attachCounts} columns={boardColumns} tasks={shown} groups={board ? groups.filter((g) => g.board_id === board.id) : []} boards={boards} board={board}
            me={me} teams={d.teams} people={d.people} onOpen={setOpen} />
        )}
        {view === "kanban" && <BoardKanban tasks={shown} boards={boards} me={me} teams={d.teams} people={d.people} onOpen={setOpen} />}
        {view === "gantt" && <BoardGantt tasks={shown} groups={board ? groups.filter((g) => g.board_id === board.id) : []} boards={boards} people={d.people} onOpen={setOpen} />}
        {view === "chat" && (board
          ? <BoardChat board={board} me={me} people={d.people} />
          : <p className="p-10 text-center text-sm text-slate-500">Select a board to open its discussion.</p>)}
        {view === "dashboard" && <BoardDashboard tasks={shown} boards={board ? [board] : boards} teams={board ? [] : teams} people={d.people} showTeams={!isEmployee && !board} />}
      </Card>

      {creating && (
        <CreateBoardModal project={project} teamOptions={teams} teamPeople={members} people={d.people} me={me} onClose={() => setCreating(false)}
          onCreated={(b) => { setCreating(false); setSelected(b.id); }} />
      )}
      {editingBoard && board && (
        <BoardForm title="Edit board" project={project} board={board} people={d.people} me={me} onClose={() => setEditingBoard(false)}
          onSaved={() => { setEditingBoard(false); client.invalidateQueries({ queryKey: ["boards"] }); }} />
      )}
      {editingCols && board && <ColumnsModal board={board} columns={boardColumns} onClose={() => setEditingCols(false)} />}
      {showOwner && board && (
        <BoardOwner board={board} canChange={canOwners} teamPeople={members[board.team_id] || []} people={d.people} onClose={() => setShowOwner(false)} />
      )}
      {openTask && (
        <TaskModal task={openTask} project={project} board={taskBoard} groups={groups} allTasks={d.tasks} me={me} people={d.people}
          canManage={taskPerms(openTask, me, taskBoard).edit} readOnly={!!taskBoard && !tbPerms.canAdd} onClose={() => setOpen(null)} />
      )}
    </Page>
  );
}

const Info = ({ label, children }) => (
  <div><p className="text-[11px] uppercase tracking-wider text-slate-500">{label}</p><p className="mt-0.5 text-white">{children}</p></div>
);
