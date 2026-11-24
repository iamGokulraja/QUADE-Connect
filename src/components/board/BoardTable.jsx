import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, CornerDownRight, Plus, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { supabase } from "../../lib/supabaseClient";
import { fmtHours, isDueTomorrow, isOverdue, taskStats } from "../../lib/utils";
import { DEFAULT_COLUMNS, boardOwnerIds, boardPerms, groupColor, taskOwnerIds, taskPerms } from "../../lib/board";
import { saveTaskOwners } from "../../lib/taskOwners";
import { personName } from "../../hooks/queries";
import { ErrorBox, inputCls } from "../ui";
import AttachCell from "./AttachCell";
import OwnerPicker from "./OwnerPicker";
import { PriorityPill, StatusPill } from "./StatusPill";
import { PRIORITIES, priorityLabel } from "../../lib/constants";


// Monday-style table: groups (collapsible), tasks, sub-tasks, inline status / priority labels and quick add.
//  board    : the selected board (null = all boards, read-only listing split by board)
//  sections : optional custom sections for non-board listings (e.g. "All my tasks" split by project)
export default function BoardTable({ tasks, groups = [], boards = [], board, projects = [], sectionBy = "group", columns, attachCounts = {}, me, teams, people, onOpen }) {
  const client = useQueryClient();
  const [collapsed, setCollapsed] = useState({});
  const [open, setOpen] = useState({});      // expanded parents
  const [error, setError] = useState("");
  const cols = (board && columns?.length ? columns : DEFAULT_COLUMNS).filter((c) => c.is_visible !== false);
  const fmtD = (v) => (v ? new Date(v).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—");
  const perms = boardPerms(board, me);
  const refresh = () => ["tasks", "groups", "boards"].forEach((k) => client.invalidateQueries({ queryKey: [k] }));
  const run = async (promise) => {
    const { error: err } = await promise;
    if (err) setError(err.message); else { setError(""); refresh(); }
  };

  const boardById = useMemo(() => Object.fromEntries(boards.map((b) => [b.id, b])), [boards]);
  const tasksFor = (t) => taskPerms(t, me, boardById[t.board_id] || board, teams);
  const parents = tasks.filter((t) => !t.parent_task_id);
  const subs = useMemo(() => {
    const map = {};
    tasks.filter((t) => t.parent_task_id).forEach((t) => (map[t.parent_task_id] ||= []).push(t));
    return map;
  }, [tasks]);

  let sections;
  if (sectionBy === "project") {
    sections = projects.map((p, i) => ({ id: p.id, name: p.name, color: groupColor(i), items: parents.filter((t) => t.project_id === p.id) })).filter((s) => s.items.length);
  } else if (!board) {
    sections = boards.map((b, i) => ({ id: b.id, name: `${b.name}${b.owner_id !== me.id ? ` · ${personName(people, b.owner_id)}` : ""}`, color: groupColor(i), items: parents.filter((t) => t.board_id === b.id) }));
    const loose = parents.filter((t) => !boardById[t.board_id]);
    if (loose.length) sections.push({ id: "loose", name: "No board", color: "#797E93", items: loose });
    sections = sections.filter((s) => s.items.length);
  } else {
    sections = groups.map((g, i) => ({ id: g.id, name: g.name, color: groupColor(i), group: g, items: parents.filter((t) => t.group_id === g.id) }));
    const none = parents.filter((t) => !groups.some((g) => g.id === t.group_id));
    if (none.length || groups.length === 0) sections.push({ id: "none", name: groups.length ? "No group" : "Tasks", color: "#797E93", items: none });
  }

  // ----- writes -----
  const patch = (t, values) => run(supabase.from("tasks").update(values).eq("id", t.id));
  // a task on the selected board: the creator picks its owners (default: themselves when they own the board), an owner adds for themselves
  const addTask = async (group, { title, owners, due_date, priority }) => {
    const { data, error: err } = await supabase.from("tasks").insert({
      project_id: board.project_id, team_id: board.team_id, board_id: board.id,
      group_id: group && group.id !== "none" ? group.id : null,
      assigned_to: owners[0], title, due_date, priority, created_by: me.id,
    }).select().single();
    if (err) return setError(err.message);
    if (owners.length > 1) {
      const { error: e2 } = await supabase.from("task_assignees").insert(owners.slice(1).map((user_id) => ({ task_id: data.id, user_id })));
      if (e2) return setError(e2.message);
    }
    setError(""); refresh();
  };
  const addSub = async (title, parent) => {
    await run(supabase.from("tasks").insert({ parent_task_id: parent.id, assigned_to: perms.manage ? parent.assigned_to : me.id, title, created_by: me.id }));
  };
  const ownersOf = (t) => taskOwnerIds(t);
  const changeOwners = async (t, ids) => {
    try { await saveTaskOwners(t, ids); setError(""); refresh(); } catch (e) { setError(e.message); }
  };
  const renameGroup = (g) => {
    const name = window.prompt("Group name", g.name);
    if (name?.trim()) run(supabase.from("task_groups").update({ name: name.trim() }).eq("id", g.id));
  };
  const removeGroup = (g) => {
    if (window.confirm(`Delete group "${g.name}"? Its tasks stay on the board without a group.`)) run(supabase.from("task_groups").delete().eq("id", g.id));
  };
  const addGroup = () => {
    const name = window.prompt("New group name");
    if (name?.trim()) run(supabase.from("task_groups").insert({ board_id: board.id, name: name.trim(), position: groups.length }));
  };

  const nameCell = (t, p, isSub) => (
    <td key="name" className="min-w-[260px] px-3 py-2">
      <div className={`flex items-center gap-2 ${isSub ? "pl-8" : ""}`}>
        {!isSub && (
          <button onClick={() => setOpen((o) => ({ ...o, [t.id]: !o[t.id] }))} aria-label="Sub-tasks" className="text-slate-500 hover:text-white">
            {open[t.id] ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          </button>
        )}
        {isSub && <CornerDownRight size={13} className="text-slate-600" />}
        <button onClick={() => onOpen(t)} className="min-w-0 truncate text-left font-medium text-white hover:text-blue-300">{t.title}</button>
        {!isSub && subs[t.id] && <span className="shrink-0 text-xs text-slate-500">{subs[t.id].filter((x) => x.status === "completed").length}/{subs[t.id].length}</span>}
      </div>
    </td>
  );

  const cell = (col, t, p, isSub) => {
    const td = "whitespace-nowrap px-3 py-2";
    const late = isOverdue(t) || isDueTomorrow(t);
    switch (col.column_key) {
      case "name": return nameCell(t, p, isSub);
      case "owner": {
        const tb = boardById[t.board_id] || board;
        const options = boardOwnerIds(tb);
        const editable = !isSub && boardPerms(tb, me).manage && options.length > 1;
        return (
          <td key={col.id} className={`${td} min-w-[170px]`}>
            <OwnerPicker value={ownersOf(t)} options={options} people={people} onChange={editable ? (ids) => changeOwners(t, ids) : undefined} />
          </td>
        );
      }
      case "status": return <td key={col.id} className={td}><StatusPill value={t.status} disabled={!p.status} onChange={(status) => patch(t, { status })} /></td>;
      case "priority": return <td key={col.id} className={td}><PriorityPill value={t.priority} disabled={!p.edit} onChange={(priority) => patch(t, { priority })} /></td>;
      case "due_date":
        return (
          <td key={col.id} className={`${td} ${late ? "text-red-400" : "text-slate-300"}`}>
            {p.edit ? <input type="date" value={t.due_date || ""} onChange={(e) => patch(t, { due_date: e.target.value || null })} className="rounded-md bg-transparent py-1 text-sm hover:bg-slate-800" /> : t.due_date ? fmtD(`${t.due_date}T00:00:00`) : "—"}
            {isOverdue(t) && <span className="ml-2 rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-semibold">Overdue</span>}
            {isDueTomorrow(t) && <span className="ml-2 rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-semibold">Tomorrow</span>}
          </td>
        );
      case "timeline":
        return (
          <td key={col.id} className={`${td} text-slate-300`}>
            {p.edit ? <input type="date" title="Start date" value={t.start_date || ""} onChange={(e) => patch(t, { start_date: e.target.value || null })} className="rounded-md bg-transparent py-1 text-sm hover:bg-slate-800" />
              : t.start_date ? fmtD(`${t.start_date}T00:00:00`) : "—"}
            <span className="text-slate-500"> → {t.due_date ? fmtD(`${t.due_date}T00:00:00`) : "—"}</span>
          </td>
        );
      case "time_tracking": return <td key={col.id} className={`${td} text-slate-300`}>{fmtHours(t.actual_hours)} <span className="text-slate-500">/ {t.estimated_hours ? fmtHours(t.estimated_hours) : "—"}</span></td>;
      case "attachments": return <td key={col.id} className={td}><AttachCell task={t} count={attachCounts[t.id] || 0} canUpload={p.status} me={me} /></td>;
      case "created_by": return <td key={col.id} className={`${td} text-slate-300`}>{personName(people, t.created_by)}</td>;
      case "created_date": return <td key={col.id} className={`${td} text-slate-400`}>{fmtD(t.created_at)}</td>;
      case "last_updated": return <td key={col.id} className={`${td} text-slate-400`}>{fmtD(t.updated_at)}</td>;
      default: { // custom column
        const value = t.custom?.[col.id] ?? "";
        const save = (v) => patch(t, { custom: { ...(t.custom || {}), [col.id]: v } });
        return (
          <td key={col.id} className={`${td} text-slate-300`}>
            {p.edit && !isSub ? (
              <input type={col.column_type === "number" ? "number" : col.column_type === "date" ? "date" : "text"} defaultValue={value} key={`${t.id}-${value}`}
                onBlur={(e) => e.target.value !== String(value) && save(e.target.value)} className="w-full rounded-md bg-transparent py-1 text-sm hover:bg-slate-800" />
            ) : (value || "—")}
          </td>
        );
      }
    }
  };

  const rowCells = (t, p, isSub) => (
    <>
      {cols.map((c) => cell(c, t, p, isSub))}
    </>
  );

  const AddSubRow = ({ onAdd }) => (
    <tr><td colSpan={cols.length} className="px-3 py-1.5 pl-12">
      <input className={`${inputCls} !border-dashed !bg-transparent !py-1.5 !text-xs`} placeholder="+ Add sub-task"
        onKeyDown={(e) => { if (e.key === "Enter" && e.currentTarget.value.trim()) { onAdd(e.currentTarget.value.trim()); e.currentTarget.value = ""; } }} />
    </td></tr>
  );

  return (
    <div className="overflow-x-auto pb-2">
      <ErrorBox error={error} />
      <table className="w-full text-left text-sm">
        {sections.map((s) => {
          const st = taskStats(s.items);
          return (
            <tbody key={s.id} className="border-t-8 border-[#0B1120]">
              <tr style={{ borderLeft: `4px solid ${s.color}` }} className="bg-[#17243D]/60">
                <td colSpan={cols.length} className="px-3 py-2.5">
                  <div className="flex items-center gap-3">
                    <button onClick={() => setCollapsed((c) => ({ ...c, [s.id]: !c[s.id] }))} style={{ color: s.color }}>{collapsed[s.id] ? <ChevronRight size={17} /> : <ChevronDown size={17} />}</button>
                    <button onClick={() => s.group && perms.manage && renameGroup(s.group)} style={{ color: s.color }} className="font-semibold">{s.name}</button>
                    <span className="text-xs text-slate-500">{s.items.length} item{s.items.length === 1 ? "" : "s"} · {st.completed} done</span>
                    {s.group && perms.manage && <button onClick={() => removeGroup(s.group)} aria-label="Delete group" className="ml-auto text-slate-600 hover:text-red-400"><Trash2 size={14} /></button>}
                  </div>
                </td>
              </tr>
              {!collapsed[s.id] && (
                <>
                  <tr className="text-[11px] uppercase tracking-wider text-slate-500" style={{ borderLeft: `4px solid ${s.color}` }}>
                    {cols.map((c) => <th key={c.id || c.column_key} className="whitespace-nowrap px-3 py-2 font-medium">{c.name}</th>)}
                  </tr>
                  {s.items.map((t) => {
                    const p = tasksFor(t);
                    return (
                      <Fragment key={t.id}>
                        <tr style={{ borderLeft: `4px solid ${s.color}` }} className="border-t border-slate-700/40 hover:bg-blue-500/[0.04]">{rowCells(t, p, false)}</tr>
                        {open[t.id] && (subs[t.id] || []).map((sub) => (
                          <tr key={sub.id} style={{ borderLeft: `4px solid ${s.color}` }} className="border-t border-slate-800 bg-[#0D172A]/60 text-[13px]">{rowCells(sub, tasksFor(sub), true)}</tr>
                        ))}
                        {open[t.id] && p.status && <AddSubRow onAdd={(title) => addSub(title, t)} />}
                      </Fragment>
                    );
                  })}
                  {board && perms.canAdd && <AddTaskRow colSpan={cols.length} board={board} me={me} people={people} perms={perms} onAdd={(v) => addTask(s.group || { id: "none" }, v)} />}
                </>
              )}
            </tbody>
          );
        })}
      </table>
      {board && perms.manage && (
        <button onClick={addGroup} className="m-3 inline-flex items-center gap-2 rounded-lg border border-dashed border-blue-500/50 px-3 py-2 text-sm text-blue-300 hover:bg-blue-500/10">
          <Plus size={15} /> Add new group
        </button>
      )}
      {sections.length === 0 && <p className="p-8 text-center text-sm text-slate-500">Nothing here yet.</p>}
    </div>
  );
}

// "+ Add task" row of a group. Type a name and press Enter; the extra options appear while you type.
function AddTaskRow({ colSpan, board, me, people, perms, onAdd }) {
  const options = boardOwnerIds(board);
  const defaultOwner = perms.manage ? (options.includes(me.id) ? me.id : options[0]) : me.id;
  const [title, setTitle] = useState("");
  const [owners, setOwners] = useState(null);
  const [due, setDue] = useState("");
  const [priority, setPriority] = useState("medium");
  const [busy, setBusy] = useState(false);
  const chosen = owners || [defaultOwner];

  const submit = async () => {
    if (!title.trim() || busy) return;
    setBusy(true);
    await onAdd({ title: title.trim(), owners: chosen, due_date: due || null, priority });
    setBusy(false); setTitle(""); setOwners(null); setDue(""); setPriority("medium");
  };
  const small = "rounded-lg border border-slate-700 bg-[#0D172A] px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-blue-500";

  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <Plus size={15} className="shrink-0 text-blue-400" />
          <input value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="Add task"
            className="min-w-[200px] flex-1 rounded-lg border border-dashed border-slate-600 bg-transparent px-3 py-1.5 text-sm text-white outline-none placeholder:text-slate-500 focus:border-blue-500 focus:bg-[#0D172A]" />
          {title.trim() && (
            <>
              {perms.manage && options.length > 1 && <OwnerPicker value={chosen} options={options} people={people} onChange={setOwners} up />}
              <input type="date" value={due} onChange={(e) => setDue(e.target.value)} title="Due date" className={small} />
              <select value={priority} onChange={(e) => setPriority(e.target.value)} className={small}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{priorityLabel(p)}</option>)}
              </select>
              <button onClick={submit} disabled={busy} className="rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{busy ? "Adding…" : "Add"}</button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}
