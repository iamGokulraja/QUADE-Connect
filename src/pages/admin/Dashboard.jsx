
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";

const today = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

function Dashboard() {
  const [stats, setStats] = useState({
    employees: 0,
    activeEmployees: 0,
    totalProjects: 0,
    ongoingProjects: 0,
    completedProjects: 0,
    delayedProjects: 0,
    pendingTasks: 0,
    overdueTasks: 0,
    present: 0,
    absent: 0,
    late: 0,
    pendingLeaves: 0,
  });

  const [projects, setProjects] = useState([]);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const currentDate = today();

      const [
        employeesResult,
        activeEmployeesResult,
        projectsResult,
        tasksResult,
        attendanceResult,
        leavesResult,
        activitiesResult,
      ] = await Promise.all([
        // Total employees, project managers and team leads
        supabase
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .in("role", ["employee", "project_manager", "team_lead"]),

        // Active employees, project managers and team leads
        supabase
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .in("role", ["employee", "project_manager", "team_lead"])
          .eq("is_active", true),

        supabase
          .from("projects")
          .select("id, name, status, due_date, created_at")
          .order("created_at", { ascending: false }),

        supabase
          .from("tasks")
          .select("id, status, due_date"),

        supabase
          .from("attendance")
          .select("id, status")
          .eq("attendance_date", currentDate),

        supabase
          .from("leave_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending"),

        supabase
          .from("activity_logs")
          .select("id, action, description, created_at")
          .order("created_at", { ascending: false })
          .limit(6),
      ]);

      const results = [
        employeesResult,
        activeEmployeesResult,
        projectsResult,
        tasksResult,
        attendanceResult,
        leavesResult,
        activitiesResult,
      ];

      const failed = results.find((result) => result.error);

      if (failed) {
        throw failed.error;
      }

      const projectData = projectsResult.data || [];
      const taskData = tasksResult.data || [];
      const attendanceData = attendanceResult.data || [];

      const completedProjects = projectData.filter(
        (project) => project.status?.toLowerCase() === "completed"
      ).length;

      const ongoingProjects = projectData.filter((project) =>
        ["in_progress", "in progress"].includes(
          project.status?.toLowerCase()
        )
      ).length;

      const delayedProjects = projectData.filter((project) => {
        const status = project.status?.toLowerCase();

        return (
          project.due_date &&
          project.due_date < currentDate &&
          status !== "completed"
        );
      }).length;

      const pendingTasks = taskData.filter((task) =>
        ["pending", "in_progress", "review", "on_hold"].includes(
          task.status?.toLowerCase()
        )
      ).length;

      const overdueTasks = taskData.filter(
        (task) =>
          task.due_date &&
          task.due_date < currentDate &&
          task.status?.toLowerCase() !== "completed"
      ).length;

      setStats({
        employees: employeesResult.count || 0,
        activeEmployees: activeEmployeesResult.count || 0,
        totalProjects: projectData.length,
        ongoingProjects,
        completedProjects,
        delayedProjects,
        pendingTasks,
        overdueTasks,
        present: attendanceData.filter(
          (item) => item.status === "present"
        ).length,
        absent: attendanceData.filter(
          (item) => item.status === "absent"
        ).length,
        late: attendanceData.filter(
          (item) => item.status === "late"
        ).length,
        pendingLeaves: leavesResult.count || 0,
      });

      setProjects(projectData);
      setActivities(activitiesResult.data || []);
    } catch (err) {
      console.error("Dashboard loading error:", err);
      setError(err.message || "Unable to load dashboard data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const cards = [
    {
      title: "Total Employees",
      value: stats.employees,
      detail: "Registered employees",
      icon: "♙",
      color: "blue",
    },
    {
      title: "Active Employees",
      value: stats.activeEmployees,
      detail: "Currently active",
      icon: "✓",
      color: "emerald",
    },
    {
      title: "Total Projects",
      value: stats.totalProjects,
      detail: "Projects in workspace",
      icon: "▣",
      color: "cyan",
    },
    {
      title: "Ongoing Projects",
      value: stats.ongoingProjects,
      detail: "Currently in progress",
      icon: "◷",
      color: "indigo",
    },
    {
      title: "Completed Projects",
      value: stats.completedProjects,
      detail: "Successfully completed",
      icon: "✓",
      color: "emerald",
    },
    {
      title: "Delayed Projects",
      value: stats.delayedProjects,
      detail: "Past due date, not completed",
      icon: "!",
      color: "red",
    },
    {
      title: "Pending Tasks",
      value: stats.pendingTasks,
      detail: "Tasks not completed",
      icon: "▤",
      color: "amber",
    },
    {
      title: "Overdue Tasks",
      value: stats.overdueTasks,
      detail: "Tasks past their due date",
      icon: "◷",
      color: "red",
    },
  ];

  const colorStyles = {
    blue: "border-blue-500/20 bg-blue-500/10 text-blue-400",
    emerald: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",
    cyan: "border-cyan-500/20 bg-cyan-500/10 text-cyan-400",
    indigo: "border-indigo-500/20 bg-indigo-500/10 text-indigo-400",
    red: "border-red-500/20 bg-red-500/10 text-red-400",
    amber: "border-amber-500/20 bg-amber-500/10 text-amber-400",
  };

  const statusStyle = (status) => {
    const value = (status || "").toLowerCase();

    if (value === "completed")
      return "bg-emerald-500/10 text-emerald-400";

    if (value === "in_progress" || value === "in progress")
      return "bg-blue-500/10 text-blue-400";

    if (value === "on_hold" || value === "on hold")
      return "bg-amber-500/10 text-amber-400";

    return "bg-slate-500/10 text-slate-400";
  };

  const formatDate = (value) => {
    if (!value) return "Not available";

    return new Date(value).toLocaleDateString();
  };

  return (
    <>
      <main className="min-h-screen bg-[#0B1120] p-5 text-slate-100 md:p-8">

        {/* Header */}
        <header className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.25em] text-blue-400">
              Workspace Administration
            </p>

            <h1 className="text-3xl font-bold text-white md:text-4xl">
              QUADE Connect
            </h1>

            <p className="mt-2 text-sm text-slate-400">
              Organisation overview and business activity.
            </p>
          </div>

          <button
            onClick={fetchDashboard}
            disabled={loading}
            className="rounded-xl border border-slate-700 bg-[#17243D] px-5 py-3 text-sm text-slate-300 hover:border-blue-500 hover:text-blue-400 disabled:opacity-50"
          >
            {loading ? "Refreshing..." : "↻ Refresh Dashboard"}
          </button>
        </header>

        {error && (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
            Unable to load dashboard: {error}
          </div>
        )}

        {/* Statistics Cards */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map((card) => (
            <div
              key={card.title}
              className="rounded-2xl border border-slate-700/70 bg-gradient-to-br from-[#172B4D] to-[#111C32] p-5 shadow-lg transition hover:-translate-y-1 hover:border-blue-500/40"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-400">{card.title}</p>

                <span
                  className={`grid h-10 w-10 place-items-center rounded-xl border text-lg ${colorStyles[card.color]}`}
                >
                  {card.icon}
                </span>
              </div>

              <h2 className="mt-5 text-3xl font-bold text-white">
                {loading ? "..." : card.value}
              </h2>

              <p className="mt-2 text-xs text-slate-500">
                {card.detail}
              </p>
            </div>
          ))}
        </section>

        {/* Attendance and Leave */}
        <section className="mt-7 grid grid-cols-1 gap-5 lg:grid-cols-2">

          <div className="rounded-2xl border border-slate-700/70 bg-[#111C32] p-6">
            <h2 className="text-lg font-semibold text-white">
              Today's Attendance
            </h2>

            <p className="mt-1 text-xs text-slate-400">
              Employee attendance summary for today
            </p>

            <div className="mt-6 grid grid-cols-3 gap-3">
              {[
                { label: "Present", value: stats.present, color: "text-emerald-400" },
                { label: "Absent", value: stats.absent, color: "text-red-400" },
                { label: "Late", value: stats.late, color: "text-amber-400" },
              ].map((item) => (
                <div key={item.label} className="rounded-xl bg-[#17243D] p-4">
                  <p className="text-xs text-slate-400">{item.label}</p>
                  <p className={`mt-3 text-2xl font-bold ${item.color}`}>
                    {loading ? "..." : item.value}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-700/70 bg-[#111C32] p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">
                  Pending Leave Requests
                </h2>
                <p className="mt-1 text-xs text-slate-400">
                  Requests awaiting approval
                </p>
              </div>

              <span className="grid h-11 w-11 place-items-center rounded-xl border border-amber-500/20 bg-amber-500/10 text-xl text-amber-400">
                ◷
              </span>
            </div>

            <p className="mt-6 text-4xl font-bold text-white">
              {loading ? "..." : stats.pendingLeaves}
            </p>

            <p className="mt-2 text-xs text-slate-500">
              Pending requests across the organisation
            </p>
          </div>
        </section>

        {/* Project Status Overview */}
        <section className="mt-7 rounded-2xl border border-slate-700/70 bg-[#111C32] p-6">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-white">
              Project Status Overview
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              Current distribution of organisation projects
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {[
              { label: "Total", value: stats.totalProjects, color: "bg-blue-500" },
              { label: "Ongoing", value: stats.ongoingProjects, color: "bg-cyan-500" },
              { label: "Completed", value: stats.completedProjects, color: "bg-emerald-500" },
              { label: "Delayed", value: stats.delayedProjects, color: "bg-red-500" },
            ].map((item) => {
              const percentage = stats.totalProjects
                ? (item.value / stats.totalProjects) * 100
                : 0;

              return (
                <div key={item.label} className="rounded-xl bg-[#17243D] p-4">
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${item.color}`} />
                    <span className="text-sm text-slate-400">{item.label}</span>
                  </div>

                  <p className="mt-4 text-2xl font-bold text-white">
                    {loading ? "..." : item.value}
                  </p>

                  <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-700">
                    <div
                      className={`h-full rounded-full ${item.color}`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Project Overview Table */}
        <section className="mt-7 overflow-hidden rounded-2xl border border-slate-700/70 bg-[#111C32]">
          <div className="flex flex-col justify-between gap-4 border-b border-slate-700/70 p-5 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-lg font-semibold text-white">
                Project Overview
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                Latest projects created in your workspace.
              </p>
            </div>

            <Link
              to="/admin/projects"
              className="rounded-xl border border-blue-500/30 bg-blue-600/10 px-5 py-3 text-center text-sm font-semibold text-blue-400 hover:bg-blue-600 hover:text-white"
            >
              View All Projects →
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[650px] text-left text-sm">
              <thead className="bg-[#17243D] text-xs uppercase text-slate-400">
                <tr>
                  <th className="px-6 py-4">Project Name</th>
                  <th className="px-6 py-4">Due Date</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Created At</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-700/50">
                {loading ? (
                  <tr>
                    <td colSpan="4" className="px-6 py-10 text-center text-slate-400">
                      Loading projects...
                    </td>
                  </tr>
                ) : projects.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="px-6 py-10 text-center text-slate-400">
                      No projects available yet.
                    </td>
                  </tr>
                ) : (
                  projects.slice(0, 6).map((project) => (
                    <tr key={project.id} className="hover:bg-blue-500/[0.05]">
                      <td className="px-6 py-4 font-medium text-white">
                        {project.name}
                      </td>

                      <td className="px-6 py-4 text-slate-400">
                        {formatDate(project.due_date)}
                      </td>

                      <td className="px-6 py-4">
                        <span className={`rounded-full px-3 py-1 text-xs ${statusStyle(project.status)}`}>
                          {(project.status || "Not set").replaceAll("_", " ")}
                        </span>
                      </td>

                      <td className="px-6 py-4 text-slate-400">
                        {formatDate(project.created_at)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Recent Activities */}
        <section className="mt-7 rounded-2xl border border-slate-700/70 bg-[#111C32] p-6">
          <h2 className="text-lg font-semibold text-white">
            Recent Activities
          </h2>

          <p className="mt-1 text-xs text-slate-400">
            Latest recorded activities in the workspace
          </p>

          <div className="mt-5 space-y-3">
            {loading ? (
              <p className="text-sm text-slate-400">Loading activities...</p>
            ) : activities.length === 0 ? (
              <p className="rounded-xl bg-[#17243D] p-5 text-sm text-slate-400">
                No activities recorded yet.
              </p>
            ) : (
              activities.map((activity) => (
                <div
                  key={activity.id}
                  className="flex flex-col justify-between gap-2 rounded-xl bg-[#17243D] p-4 sm:flex-row sm:items-center"
                >
                  <div>
                    <p className="text-sm font-medium text-white">
                      {activity.action}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {activity.description}
                    </p>
                  </div>

                  <span className="shrink-0 text-xs text-slate-500">
                    {formatDate(activity.created_at)}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>

        <footer className="mt-8 border-t border-slate-800 pt-5 text-xs text-slate-500">
          QUADE Connect · Admin Workspace
        </footer>
      </main>
    </>
  );
}

export default Dashboard;
