// Small pure helpers shared by many pages.

export const todayStr = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const fmtDate = (value) =>
  value
    ? new Date(value.length === 10 ? `${value}T00:00:00` : value).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "Not set";

export const fmtTime = (value) =>
  value
    ? new Date(value).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
    : "—";

export const label = (value) => (value || "").replace(/_/g, " ");

export const topLevel = (tasks) => tasks.filter((t) => !t.parent_task_id);

export const isLate = (project) =>
  !!project.due_date && project.status !== "completed" && project.due_date < todayStr();

export const isOverdue = (task) =>
  !!task.due_date && task.status !== "completed" && task.due_date < todayStr();

// Aggregate numbers for a list of tasks (sub-tasks are ignored).
export function taskStats(tasks) {
  const list = topLevel(tasks);
  const completed = list.filter((t) => t.status === "completed").length;
  return {
    total: list.length,
    completed,
    pending: list.filter((t) => t.status === "pending").length,
    inProgress: list.filter((t) => ["in_progress", "review"].includes(t.status)).length,
    onHold: list.filter((t) => t.status === "on_hold").length,
    overdue: list.filter(isOverdue).length,
  };
}

export const groupBy = (list, key) =>
  list.reduce((acc, item) => {
    (acc[item[key]] ||= []).push(item);
    return acc;
  }, {});

export const tomorrowStr = () => todayStr(new Date(Date.now() + 864e5));
export const isDueTomorrow = (item) =>
  !!item.due_date && item.status !== "completed" && item.due_date === tomorrowStr();
export const fmtHours = (h) => `${Math.round(Number(h || 0) * 100) / 100}h`;
