// Single source of truth for roles, statuses and styling used across the app.

export const ROLE_HOME = {
  admin: "/admin",
  hr: "/hr",
  project_manager: "/project-manager",
  team_lead: "/team-lead",
  employee: "/employee",
  client: "/client/projects",
  qc: "/qc",
};

export const ROLE_LABEL = {
  admin: "Admin",
  hr: "HR",
  project_manager: "Project Manager",
  team_lead: "Team Lead",
  employee: "Employee",
  client: "Client",
  qc: "QC",
};

// Route prefix per role (used to build links such as /team-lead/projects/:id)
export const ROLE_BASE = {
  admin: "/admin",
  hr: "/hr",
  project_manager: "/project-manager",
  team_lead: "/team-lead",
  employee: "/employee",
  client: "/client",
  qc: "/qc",
};

export const TASK_STATUSES = [
  { key: "pending", label: "Not Started" },
  { key: "in_progress", label: "Working on It" },
  { key: "on_hold", label: "Blocked" },
  { key: "review", label: "Ready for Review" },
  { key: "completed", label: "Done" },
];
export const statusLabel = (key) => TASK_STATUSES.find((s) => s.key === key)?.label;

export const PRIORITIES = ["low", "medium", "high", "urgent"];
export const PRIORITY_LABEL = { low: "Low", medium: "Normal", high: "High", urgent: "Urgent" };
export const priorityLabel = (key) => PRIORITY_LABEL[key] || "Normal";


// Check-in after this local time is recorded as "late".
// Check in at or before this time (Indian time) = Present; after it = Late.
export const LATE_AFTER = "08:30";
// true: check-in / check-out needs the location. false: it still tries, but saves the attendance without it if blocked.
export const REQUIRE_LOCATION = true;

export const STATUS_STYLE = {
  completed: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",
  approved: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",
  present: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",
  in_progress: "border-blue-500/20 bg-blue-500/10 text-blue-400",
  review: "border-violet-500/20 bg-violet-500/10 text-violet-300",
  planned: "border-slate-500/20 bg-slate-500/10 text-slate-400",
  pending: "border-slate-500/20 bg-slate-500/10 text-slate-300",
  on_hold: "border-amber-500/20 bg-amber-500/10 text-amber-400",
  late: "border-amber-500/20 bg-amber-500/10 text-amber-400",
  cancelled: "border-red-500/20 bg-red-500/10 text-red-400",
  rejected: "border-red-500/20 bg-red-500/10 text-red-400",
  absent: "border-red-500/20 bg-red-500/10 text-red-400",
};

export const PRIORITY_STYLE = {
  low: "text-slate-400",
  medium: "text-blue-400",
  high: "text-orange-400",
  urgent: "text-red-400",
};

// Where "My Profile" lives for each role (client home is /client/projects, so it is special-cased).
export const profilePath = (role) => (role === "client" ? "/client/profile" : `${ROLE_HOME[role] || ""}/profile`);
// Roles that may use a profile photo (the photo storage is for company members).
export const PHOTO_ROLES = ["admin", "hr", "project_manager", "team_lead", "employee"];
