import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Plus, Trash2 } from "lucide-react";
import { boardOwnerIds, taskOwnerIds } from "../../lib/board";
import { saveTaskOwners } from "../../lib/taskOwners";

import { supabase } from "../../lib/supabaseClient";
import { PRIORITIES, TASK_STATUSES, priorityLabel } from "../../lib/constants";
import { fmtDate, todayStr } from "../../lib/utils";
import { personName } from "../../hooks/queries";
import { ErrorBox, Field, Modal, btnGhost, btnPrimary, inputCls } from "../ui";
import TaskTimer from "./TaskTimer";
import OwnerPicker from "./OwnerPicker";
import Attachments from "./Attachments";

// Edit / work on one task. Tasks are created in the board table ("Add task").
//  canManage : the board creator – may edit every field and delete
//  assignee  : the employee the task belongs to – may change status, sub-tasks and time logs
//  everyone else who can open it (e.g. the Project Manager) gets a read-only view plus comments.
export default function TaskModal({
  task,
  project,
  allTasks = [],
  me,
  people,
  canManage,
  board = null,      // board the task is on (optional for legacy project tasks)
  groups = [],       // groups of that board
  readOnly = false,  // Team Lead / Project Manager looking at an employee's board
  onClose,
}) {
  const queryClient = useQueryClient();
  const isAssignee = taskOwnerIds(task).includes(me.id);
  const canWork = !readOnly && (canManage || isAssignee);
  const boardGroups = groups.filter((g) => g.board_id === task.board_id);

  const [form, setForm] = useState({
    title: task.title || "",
    description: task.description || "",
    team_id: task.team_id || "",
    group_id: task.group_id || "",
    start_date: task.start_date || "",
    priority: task.priority || "medium",
    due_date: task.due_date || "",
    estimated_hours: task.estimated_hours ?? "",
    status: task.status || "pending",
  });
  const [owners, setOwners] = useState(taskOwnerIds(task));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const refresh = (...keys) => keys.forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
  const run = async (fn) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };
  const check = ({ error: err }) => {
    if (err) throw err;
  };

  const changeStatus = (e) => setForm((f) => ({ ...f, status: e.target.value }));

  const save = () =>
    run(async () => {
      if (!form.title.trim()) throw new Error("Task title is required.");

      const patch = { status: form.status };
      if (canManage) {
        Object.assign(patch, {
          title: form.title.trim(),
          description: form.description.trim() || null,
          priority: form.priority,
          group_id: form.group_id || null,
          start_date: form.start_date || null,
          due_date: form.due_date || null,
          estimated_hours: form.estimated_hours === "" ? null : Number(form.estimated_hours),
        });
      }
      check(await supabase.from("tasks").update(patch).eq("id", task.id));
      if (canManage && boardOwnerIds(board).length > 1) {
        const before = taskOwnerIds(task);
        if (owners.length !== before.length || owners.some((id) => !before.includes(id))) await saveTaskOwners({ ...task, assigned_to: task.assigned_to }, owners);
      }
      refresh("tasks");
      onClose();
    });

  const remove = () =>
    run(async () => {
      if (!window.confirm("Delete this task and its sub-tasks?")) return;
      check(await supabase.from("tasks").delete().eq("id", task.id));
      refresh("tasks");
      onClose();
    });

  return (
    <Modal
      wide
      title={task.title}
      subtitle={[board?.name, project?.name, readOnly ? "read-only" : ""].filter(Boolean).join(" · ")}
      onClose={onClose}
      footer={
        <>
          {canManage && (
            <button className={`${btnGhost} mr-auto text-red-400`} onClick={remove} disabled={busy}>
              <Trash2 size={15} /> Delete
            </button>
          )}
          <button className={btnGhost} onClick={onClose}>
            Close
          </button>
          {canWork && (
            <button className={btnPrimary} onClick={save} disabled={busy}>
              <Check size={16} /> {busy ? "Saving..." : "Save changes"}
            </button>
          )}
        </>
      }
    >
      <ErrorBox error={error} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Title">
            <input className={inputCls} value={form.title} onChange={set("title")} disabled={!canManage} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Description">
            <textarea
              rows={3}
              className={inputCls}
              value={form.description}
              onChange={set("description")}
              disabled={!canManage}
            />
          </Field>
        </div>

        {boardGroups.length > 0 && (
          <Field label="Group">
            <select className={inputCls} value={form.group_id} onChange={set("group_id")} disabled={!canManage}>
              <option value="">No group</option>
              {boardGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </Field>
        )}

        <Field label={owners.length > 1 ? "Owners (board owners)" : "Owner (board owner)"}>
          <div className="flex min-h-[42px] items-center rounded-xl border border-slate-700 bg-[#0D172A] px-2">
            <OwnerPicker value={owners} options={boardOwnerIds(board)} people={people}
              onChange={canManage && !readOnly && boardOwnerIds(board).length > 1 ? setOwners : undefined} />
          </div>
        </Field>

        <Field label="Start date">
          <input type="date" className={inputCls} value={form.start_date || ""} onChange={set("start_date")} disabled={!canManage} />
        </Field>

        <Field label="Priority">
          <select className={inputCls} value={form.priority} onChange={set("priority")} disabled={!canManage}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {priorityLabel(p)}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Due date">
          <input type="date" className={inputCls} value={form.due_date || ""} onChange={set("due_date")} disabled={!canManage} />
        </Field>

        <Field label="Estimated hours">
          <input
            type="number"
            min="0"
            step="0.5"
            className={inputCls}
            value={form.estimated_hours}
            onChange={set("estimated_hours")}
            disabled={!canManage}
          />
        </Field>

        <Field label="Status">
          <select className={inputCls} value={form.status} onChange={changeStatus} disabled={!canWork}>
            {TASK_STATUSES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <>
          {!task.parent_task_id && <Subtasks task={task} allTasks={allTasks} me={me} canManage={canManage} canWork={canWork} refresh={refresh} />}
          {isAssignee && !readOnly && task.status !== "completed" && (
            <Section title="Timer"><TaskTimer task={task} /></Section>
          )}
          <Worklogs task={task} me={me} people={people} canWork={canWork} refresh={refresh} />
          <Section title="Attachments"><Attachments task={task} me={me} canUpload={canWork} /></Section>
          <Comments task={task} me={me} people={people} canPost={!readOnly} />
          <Activity task={task} people={people} />
      </>
    </Modal>
  );
}

const Section = ({ title, children }) => (
  <div className="border-t border-slate-700/60 pt-4">
    <h3 className="mb-3 text-sm font-semibold text-white">{title}</h3>
    {children}
  </div>
);

function Subtasks({ task, allTasks, me, canManage, canWork, refresh }) {
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const subtasks = allTasks.filter((t) => t.parent_task_id === task.id);

  const add = async () => {
    if (!title.trim()) return;
    const { error: err } = await supabase.from("tasks").insert({
      parent_task_id: task.id,
      project_id: task.project_id,
      team_id: task.team_id,
      title: title.trim(),
      assigned_to: canManage ? task.assigned_to : me.id,
      priority: task.priority,
      created_by: me.id,
    });
    if (err) return setError(err.message);
    setTitle("");
    setError("");
    refresh("tasks");
  };

  const toggle = async (sub) => {
    const done = sub.status !== "completed";
    const { error: err } = await supabase
      .from("tasks")
      .update({ status: done ? "completed" : "pending" })
      .eq("id", sub.id);
    if (err) return setError(err.message);
    refresh("tasks");
  };

  return (
    <Section title={`Sub-tasks (${subtasks.filter((s) => s.status === "completed").length}/${subtasks.length})`}>
      <ErrorBox error={error} />
      <ul className="space-y-2">
        {subtasks.map((s) => (
          <li key={s.id} className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={s.status === "completed"}
              disabled={!(canManage || taskOwnerIds(s).includes(me.id))}
              onChange={() => toggle(s)}
            />
            <span className={s.status === "completed" ? "text-slate-500 line-through" : "text-slate-200"}>
              {s.title}
            </span>
          </li>
        ))}
        {subtasks.length === 0 && <li className="text-xs text-slate-500">No sub-tasks yet.</li>}
      </ul>
      {canWork && (
        <div className="mt-3 flex gap-2">
          <input
            className={inputCls}
            placeholder="Add a sub-task"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
          <button className={btnGhost} onClick={add}>
            <Plus size={16} />
          </button>
        </div>
      )}
    </Section>
  );
}

function Activity({ task, people }) {
  const { data = [] } = useQuery({
    queryKey: ["task-activity", task.id],
    queryFn: async () => {
      const { data: rows, error } = await supabase.from("task_activity").select("*").eq("task_id", task.id).order("created_at", { ascending: false }).limit(30);
      if (error) throw error;
      return rows || [];
    },
  });
  const pretty = (text) => TASK_STATUSES.reduce((t, s) => t.replaceAll(s.key, s.label), text || "").replace("medium", "Normal");
  return (
    <Section title="Activity history">
      {data.length === 0 ? <p className="text-xs text-slate-500">No activity yet.</p> : (
        <ul className="max-h-48 space-y-2 overflow-y-auto text-xs text-slate-300">
          {data.map((a) => (
            <li key={a.id} className="flex gap-3">
              <span className="w-32 shrink-0 text-slate-500">{new Date(a.created_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
              <span><strong className="text-slate-200">{personName(people, a.actor_id)}</strong> · {pretty(a.detail)}</span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function Worklogs({ task, me, people, canWork, refresh }) {
  const [hours, setHours] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const queryClient = useQueryClient();

  const { data: logs = [] } = useQuery({
    queryKey: ["task-worklogs", task.id],
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from("task_worklogs")
        .select("*")
        .eq("task_id", task.id)
        .order("log_date", { ascending: false });
      if (err) throw err;
      return data || [];
    },
  });

  const add = async () => {
    const value = Number(hours);
    if (!value || value <= 0) return setError("Enter the hours worked.");
    const { error: err } = await supabase.from("task_worklogs").insert({
      task_id: task.id,
      user_id: me.id,
      hours: value,
      note: note.trim() || null,
      log_date: todayStr(),
    });
    if (err) return setError(err.message);
    setHours("");
    setNote("");
    setError("");
    queryClient.invalidateQueries({ queryKey: ["task-worklogs", task.id] });
    refresh("tasks");
  };

  const total = logs.reduce((sum, l) => sum + Number(l.hours), 0);

  return (
    <Section title={`Time logged: ${Math.round(total * 100) / 100}h${task.estimated_hours ? ` of ${task.estimated_hours}h estimated · ${Math.max(Math.round((task.estimated_hours - total) * 100) / 100, 0)}h remaining` : ""}`}>
      <ErrorBox error={error} />
      <ul className="space-y-1.5 text-sm text-slate-300">
        {logs.map((l) => (
          <li key={l.id}>
            <span className="text-slate-500">{fmtDate(l.log_date)}</span> · {personName(people, l.user_id)} ·{" "}
            <strong>{l.hours}h</strong>
            {l.started_at && <span className="text-slate-500"> ({new Date(l.started_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}–{new Date(l.ended_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })})</span>}
            {l.note && <span className="text-slate-400"> — {l.note}</span>}
          </li>
        ))}
        {logs.length === 0 && <li className="text-xs text-slate-500">No time logged yet.</li>}
      </ul>
      {canWork && (
        <div className="mt-3 grid grid-cols-[90px_1fr_auto] gap-2">
          <input type="number" min="0" step="0.25" className={inputCls} placeholder="Hours" value={hours} onChange={(e) => setHours(e.target.value)} />
          <input className={inputCls} placeholder="What did you work on?" value={note} onChange={(e) => setNote(e.target.value)} />
          <button className={btnGhost} onClick={add}>
            <Plus size={16} />
          </button>
        </div>
      )}
    </Section>
  );
}

function Comments({ task, me, people, canPost }) {
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const queryClient = useQueryClient();

  const { data: comments = [] } = useQuery({
    queryKey: ["task-comments", task.id],
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from("task_comments")
        .select("*")
        .eq("task_id", task.id)
        .order("created_at");
      if (err) throw err;
      return data || [];
    },
  });

  const add = async () => {
    if (!body.trim()) return;
    const { error: err } = await supabase
      .from("task_comments")
      .insert({ task_id: task.id, author_id: me.id, body: body.trim() });
    if (err) return setError(err.message);
    setBody("");
    setError("");
    queryClient.invalidateQueries({ queryKey: ["task-comments", task.id] });
  };

  return (
    <Section title={`Comments (${comments.length})`}>
      <ErrorBox error={error} />
      <ul className="space-y-3">
        {comments.map((c) => (
          <li key={c.id} className="rounded-xl bg-[#17243D] p-3 text-sm">
            <p className="mb-1 text-xs text-slate-400">
              {personName(people, c.author_id)} · {new Date(c.created_at).toLocaleString("en-IN")}
            </p>
            <p className="whitespace-pre-wrap text-slate-200">{c.body}</p>
          </li>
        ))}
        {comments.length === 0 && <li className="text-xs text-slate-500">No comments yet.</li>}
      </ul>
      {canPost && <div className="mt-3 flex gap-2">
        <input
          className={inputCls}
          placeholder="Write a comment"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <button className={btnPrimary} onClick={add}>
          Send
        </button>
      </div>}
    </Section>
  );
}
