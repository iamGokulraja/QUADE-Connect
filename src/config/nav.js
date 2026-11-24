import {
  LayoutDashboard,
  FolderKanban,
  Users,
  UsersRound,
  UserPlus,
  MessageCircle,
  FileText,
  CalendarDays,
  CalendarClock,
  Clock,
  ChartNoAxesCombined,
  ChartBar,
  Trophy,
  Building2,
  ClipboardCheck,
  MessagesSquare,
  Newspaper,
  Medal,
  Camera,
  ShieldCheck,
  Network,
  Contact,
} from "lucide-react";

// Navigation per role. `soon: true` items are roadmap modules that are not built yet.
// Keep this file as the only place where menus are defined.
const item = (label, to, icon, extra = {}) => ({ label, to, icon, ...extra });

export const NAV = {
  admin: [
    {
      title: "Workspace",
      items: [
        item("Overview Dashboard", "/admin", LayoutDashboard, { end: true }),
        item("Project Portfolio", "/admin/portfolio", ChartNoAxesCombined),
        item("Projects & Allocation", "/admin/projects", FolderKanban),
        item("Client Submissions", "/admin/team-management", Users),
        item("People", "/admin/people", Contact),
        item("Reporting Hierarchy", "/admin/hierarchy", Network),
        item("Documents", "/admin/documents", FileText),
        item("QC Grade Reports", "/admin/qc-grades", Medal),
        item("Attendance & Leave", "/admin/leave", CalendarClock),
        item("Team Connect", "/admin/chat", MessageCircle, { badge: "chat" }),
      ],
    },
    {
      title: "Performance",
      items: [
        item("KPI Monitoring", "/admin/kpi", Trophy, { soon: true }),
        item("Reports & Analytics", "/admin/reports", ChartBar, { soon: true }),
        item("Project Costs", "/admin/costs", ChartNoAxesCombined, { soon: true }),
        item("QUADE Spotlight", "/admin/spotlight", Newspaper),
        item("My Moments", "/admin/moments", Camera),
      ],
    },
  ],
  hr: [
    {
      title: "People",
      items: [
        item("Overview Dashboard", "/hr", LayoutDashboard, { end: true }),
        item("People", "/hr/people", Contact),
        item("QC Users", "/hr/qc-users", ShieldCheck),
        item("Create User", "/hr/create-user", UserPlus),
        item("Teams", "/hr/teams", UsersRound),
        item("Reporting Hierarchy", "/hr/hierarchy", Network),
      ],
    },
    {
      title: "Operations",
      items: [
        item("My Attendance", "/hr/attendance", Clock),
        item("Attendance & Leave", "/hr/leave", CalendarClock),
        item("Team Connect", "/hr/chat", MessageCircle, { badge: "chat" }),
        item("QC Grade Reports", "/hr/qc-grades", Medal),
        item("HR Reports", "/hr/reports", ChartBar),
        item("QUADE Spotlight", "/hr/spotlight", Newspaper),
        item("My Moments", "/hr/moments", Camera),
      ],
    },
  ],
  project_manager: [
    {
      title: "Workspace",
      items: [
        item("Overview Dashboard", "/project-manager", LayoutDashboard, { end: true }),
        item("Projects & Tasks", "/project-manager/projects", FolderKanban),
        item("Documents", "/project-manager/documents", FileText),
        item("My Attendance", "/project-manager/attendance", Clock),
        item("Leave", "/project-manager/leave", CalendarClock),
        item("Team Connect", "/project-manager/chat", MessageCircle, { badge: "chat" }),
      ],
    },
    {
      title: "Performance",
      items: [
        item("KPI Monitoring", "/project-manager/kpi", Trophy, { soon: true }),
        item("Reports & Analytics", "/project-manager/reports", ChartBar, { soon: true }),
        item("QUADE Spotlight", "/project-manager/spotlight", Newspaper),
        item("My Moments", "/project-manager/moments", Camera),
      ],
    },
  ],
  team_lead: [
    {
      title: "Workspace",
      items: [
        item("Overview", "/team-lead", LayoutDashboard, { end: true }),
        item("Projects & Tasks", "/team-lead/projects", FolderKanban),
        item("My Team", "/team-lead/team", Users),
        item("My Attendance", "/team-lead/attendance", Clock),
        item("Leave", "/team-lead/leave", CalendarClock),
        item("Team Connect", "/team-lead/chat", MessageCircle, { badge: "chat" }),
        item("Documents", "/team-lead/documents", FileText),
      ],
    },
    {
      title: "Performance",
      items: [
        item("Team Performance", "/team-lead/performance", ChartNoAxesCombined, { soon: true }),
        item("QUADE Spotlight", "/team-lead/spotlight", Newspaper),
        item("My Moments", "/team-lead/moments", Camera),
      ],
    },
  ],
  employee: [
    {
      title: "Workspace",
      items: [
        item("Overview", "/employee", LayoutDashboard, { end: true }),
        item("My Work", "/employee/work", FolderKanban),
        item("My Attendance", "/employee/attendance", Clock),
        item("Leave", "/employee/leave", CalendarClock),
        item("Team Connect", "/employee/chat", MessageCircle, { badge: "chat" }),
        item("Documents", "/employee/documents", FileText),
        item("QUADE Spotlight", "/employee/spotlight", Newspaper),
        item("My Moments", "/employee/moments", Camera),
      ],
    },
    {
      title: "Performance",
      items: [item("KPI Monitoring", "/employee/performance", Trophy, { soon: true })],
    },
  ],
  qc: [
    {
      title: "Quality Control",
      items: [
        item("QC Dashboard", "/qc", LayoutDashboard, { end: true }),
        item("Documents", "/qc/documents", FileText),
        item("My Attendance", "/qc/attendance", Clock),
        item("Team Connect", "/qc/chat", MessageCircle, { badge: "chat" }),
        item("QC Grade", "/qc/grades", Medal),
        item("QUADE Spotlight", "/qc/spotlight", Newspaper),
        item("My Moments", "/qc/moments", Camera),
      ],
    },
  ],
  client: [
    {
      title: "Workspace",
      items: [
        item("My Projects", "/client/projects", FolderKanban),
        item("Project Progress", "/client/progress", ChartNoAxesCombined, { soon: true }),
        item("Shared Documents", "/client/documents", FileText, { soon: true }),
        item("Project Schedule", "/client/schedule", CalendarDays, { soon: true }),
        item("Queries & Requests", "/client/queries", MessagesSquare, { soon: true }),
        item("Deliverable Approvals", "/client/approvals", ClipboardCheck, { soon: true }),
        item("My Organization", "/client/organization", Building2, { soon: true }),
      ],
    },
  ],
};
