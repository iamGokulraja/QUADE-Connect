
import { useEffect, useState } from "react";
import {
  Users,
  BriefcaseBusiness,
  UserRoundCheck,
  Building2,
  RefreshCw,
} from "lucide-react";

import { supabase } from "../../lib/supabaseClient";
import AttendanceToday from "../leave/AttendanceToday";

function Dashboard() {
  const [stats, setStats] = useState({
    employees: 0,
    projectManagers: 0,
    teamLeads: 0,
    clients: 0,
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchHRStats = async () => {
    setLoading(true);
    setError("");

    try {
      const countProfiles = async (role) => {
        const { count, error } = await supabase
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("role", role)
          .eq("is_active", true);

        if (error) throw error;

        return count ?? 0;
      };

      const [
        employees,
        projectManagers,
        teamLeads,
        clients,
      ] = await Promise.all([
        countProfiles("employee"),
        countProfiles("project_manager"),
        countProfiles("team_lead"),
        countProfiles("client"),
      ]);

      setStats({
        employees,
        projectManagers,
        teamLeads,
        clients,
      });
    } catch (err) {
      setError(err.message || "Unable to load HR dashboard data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHRStats();
  }, []);

  const statCards = [
    {
      title: "Total Employees",
      value: stats.employees,
      icon: Users,
      description: "Employee accounts",
    },
    {
      title: "Project Managers",
      value: stats.projectManagers,
      icon: BriefcaseBusiness,
      description: "Project Manager accounts",
    },
    {
      title: "Team Leads",
      value: stats.teamLeads,
      icon: UserRoundCheck,
      description: "Team Lead accounts",
    },
    {
      title: "Clients",
      value: stats.clients,
      icon: Building2,
      description: "Client accounts",
    },
  ];

  return (
    <>
      <div className="min-h-screen p-5 sm:p-8">

        {/* HEADER */}
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="mb-2 text-sm font-medium text-blue-400">
              QUADE CONNECT / HR WORKSPACE
            </p>

            <h1 className="text-2xl font-bold text-white sm:text-3xl">
              HR Dashboard
            </h1>

            <p className="mt-2 text-sm text-slate-400">
              Manage employees, teams and workforce operations.
            </p>
          </div>

          <button
            type="button"
            onClick={fetchHRStats}
            disabled={loading}
            className="
              flex items-center gap-2 rounded-xl
              border border-slate-700 bg-[#17243D]
              px-4 py-3 text-sm font-medium text-slate-300
              transition hover:border-blue-500/50
              hover:text-white disabled:opacity-50
            "
          >
            <RefreshCw
              size={16}
              className={loading ? "animate-spin" : ""}
            />
            Refresh
          </button>
        </div>

        {/* ERROR */}
        {error && (
          <div
            role="alert"
            className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300"
          >
            {error}
          </div>
        )}

        {/* ACCOUNT SUMMARY */}
        <div className="mb-8">
          <h2 className="mb-4 text-lg font-semibold text-white">
            Workforce Overview
          </h2>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {statCards.map((card) => {
              const Icon = card.icon;

              return (
                <div
                  key={card.title}
                  className="
                    rounded-2xl border border-blue-900/40
                    bg-[#101B35] p-6
                    transition duration-300
                    hover:border-blue-500/40
                  "
                >
                  <div className="mb-5 flex items-center justify-between">
                    <div className="rounded-xl bg-blue-500/10 p-3 text-blue-400">
                      <Icon size={23} />
                    </div>

                  </div>

                  <p className="text-sm text-slate-400">
                    {card.title}
                  </p>

                  <h3 className="mt-2 text-3xl font-bold text-white">
                    {loading ? "..." : card.value}
                  </h3>

                  <p className="mt-2 text-xs text-slate-500">
                    {card.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* HR RESPONSIBILITIES */}
        <div className="rounded-2xl border border-blue-900/40 bg-[#101B35] p-6 sm:p-8">
          <h2 className="text-lg font-semibold text-white">
            HR Responsibilities
          </h2>

          <p className="mt-2 text-sm text-slate-400">
            Manage workforce information and employee operations
            from one workspace.
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[
              {
                title: "Employee Management",
                description:
                  "Manage employee profiles and account information.",
              },
              {
                title: "Team Management",
                description:
                  "Manage Project Managers and Team Leads.",
              },
              {
                title: "Client Management",
                description:
                  "Create and maintain client accounts.",
              },
              {
                title: "Attendance Management",
                description:
                  "Monitor employee attendance and working hours.",
              },
              {
                title: "Leave Management",
                description:
                  "Review employee leave requests.",
              },
              {
                title: "HR Reports",
                description:
                  "Review workforce and HR-related information.",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-xl border border-slate-700/70 bg-[#0B1428] p-5"
              >
                <h3 className="font-semibold text-slate-200">
                  {item.title}
                </h3>

                <p className="mt-2 text-sm leading-6 text-slate-400">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>

        <AttendanceToday />
      </div>
    </>
  );
}

export default Dashboard;
