// Shared board helpers: label colours, permissions and date maths used by every board view.
import { todayStr, topLevel } from "./utils";

// Monday-style label colours for our five statuses and four priorities.
export const STATUS_COLORS = {
  pending: "#797E93",
  in_progress: "#FDAB3D",
  on_hold: "#DF2F4A",
  review: "#A25DDC",
  completed: "#00C875",
};
export const PRIORITY_COLORS = { low: "#579BFC", medium: "#FDAB3D", high: "#E2445C", urgent: "#BB3354" };
export const GROUP_COLORS = ["#579BFC", "#00C875", "#A25DDC", "#FDAB3D", "#E2445C", "#0DA88B", "#FF642E"];
export const groupColor = (index) => GROUP_COLORS[index % GROUP_COLORS.length];

// ---------- permissions (the database enforces the same rules) ----------
// One board = one owner. The owner works on the tasks (every task on the board belongs to the owner);
// the creator (the owner, or the Team Lead who made the board for an employee) manages the board itself.
export const boardCreatorId = (board) => board?.created_by || board?.owner_id;
// A board can have several owners; a task can have several owners, all of them owners of the board.
export const boardOwnerIds = (board) => (board?.owners?.length ? board.owners : [board?.owner_id].filter(Boolean));
export const taskOwnerIds = (task) => (task?.assignees?.length ? task.assignees : [task?.assigned_to].filter(Boolean));

export function boardPerms(board, me) {
  if (!board) return { manage: false, isOwner: false, canAdd: false };
  const manage = boardCreatorId(board) === me.id;
  const isOwner = boardOwnerIds(board).includes(me.id);
  return { manage, isOwner, canAdd: manage || isOwner };
}

export function taskPerms(task, me, board) {
  const { manage } = boardPerms(board, me);
  const own = taskOwnerIds(task).includes(me.id);
  const edit = manage || (own && task.created_by === me.id);
  return { edit, status: edit || own };
}

// ---------- dates ----------
export const toDate = (s) => new Date(`${s}T00:00:00`);
export const dayDiff = (a, b) => Math.round((toDate(a) - toDate(b)) / 864e5);
export const addDays = (s, n) => todayStr(new Date(toDate(s).getTime() + n * 864e5));

// Start / end of a task for the Gantt chart (a task needs at least one date).
export function taskSpan(t) {
  const start = t.start_date || t.due_date;
  const end = t.due_date || t.start_date;
  if (!start) return null;
  return end < start ? { start: end, end: start } : { start, end };
}

// Columns every board starts with (also used for listings that span several boards).
// Only the first five are visible by default; the others can be switched on with the eye icon in "Customize columns".
export const DEFAULT_COLUMNS = [
  ["name", "Task Name"], ["owner", "Owner"], ["status", "Status"], ["priority", "Priority"], ["due_date", "Due Date"],
  ["timeline", "Timeline"], ["time_tracking", "Time Tracking"], ["attachments", "Attachments"],
  ["created_by", "Created By"], ["created_date", "Created Date"], ["last_updated", "Last Updated"],
].map(([column_key, name], position) => ({ id: column_key, column_key, name, position, is_default: true, is_visible: position < 5, column_type: "system" }));
