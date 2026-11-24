
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabaseClient";

function ProjectsAllocation() {

  // Fetch Client Project Submissions
  const {
    data: projects = [],
    isLoading: loading,
    error: projectsError,
  } = useQuery({
    queryKey: ["client-project-requests"],

    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_project_requests")
        .select(`
          *,
          client:profiles!client_project_requests_created_by_fkey (
            id,
            full_name,
            email
          )
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;

      return data || [];
    },
  });

  // Status badge styles
  const getStatusStyle = (status) => {
    const styles = {
      submitted:
        "border-blue-500/20 bg-blue-500/10 text-blue-400",

      under_review:
        "border-amber-500/20 bg-amber-500/10 text-amber-400",

      accepted:
        "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",

      rejected:
        "border-red-500/20 bg-red-500/10 text-red-400",
    };

    return styles[status] || styles.submitted;
  };

  // Priority badge styles
  const getPriorityStyle = (priority) => {
    const styles = {
      low: "border-slate-500/20 bg-slate-500/10 text-slate-400",
      medium: "border-blue-500/20 bg-blue-500/10 text-blue-400",
      high: "border-orange-500/20 bg-orange-500/10 text-orange-400",
      urgent: "border-red-500/20 bg-red-500/10 text-red-400",
    };

    return styles[priority] || styles.medium;
  };

  const submittedCount = projects.filter(
    (project) => project.status === "submitted"
  ).length;

  const reviewCount = projects.filter(
    (project) => project.status === "under_review"
  ).length;

  const acceptedCount = projects.filter(
    (project) => project.status === "accepted"
  ).length;

  return (
    <>
      <main className="min-h-screen min-w-0 bg-[#0B1120] p-5 text-slate-100 transition-colors duration-300 md:p-8">

        {/* Page Header */}
        <header className="mb-9">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.25em] text-blue-400">
            Workspace Management
          </p>

          <h1 className="bg-gradient-to-r from-white via-blue-100 to-blue-400 bg-clip-text text-3xl font-bold tracking-tight text-transparent md:text-4xl">
            Client Project Submissions
          </h1>

          <p className="mt-2 text-sm text-slate-400">
            Review and monitor projects submitted by your clients.
          </p>
        </header>

        {/* Summary Cards */}
        <section className="mb-7 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">

          {/* Total Requests */}
          <div className="rounded-2xl border border-blue-500/20 bg-gradient-to-br from-[#172B4D] to-[#111C32] p-5">
            <p className="text-sm text-slate-400">
              Total Requests
            </p>

            <h2 className="mt-5 text-3xl font-bold text-white">
              {loading ? "..." : projects.length}
            </h2>

            <p className="mt-2 text-xs text-slate-400">
              All client submissions
            </p>
          </div>

          {/* Submitted */}
          <div className="rounded-2xl border border-blue-500/20 bg-[#111C32] p-5">
            <p className="text-sm text-slate-400">
              Submitted
            </p>

            <h2 className="mt-5 text-3xl font-bold text-blue-400">
              {loading ? "..." : submittedCount}
            </h2>

            <p className="mt-2 text-xs text-slate-400">
              Awaiting review
            </p>
          </div>

          {/* Under Review */}
          <div className="rounded-2xl border border-amber-500/20 bg-[#111C32] p-5">
            <p className="text-sm text-slate-400">
              Under Review
            </p>

            <h2 className="mt-5 text-3xl font-bold text-amber-400">
              {loading ? "..." : reviewCount}
            </h2>

            <p className="mt-2 text-xs text-slate-400">
              Currently being reviewed
            </p>
          </div>

          {/* Accepted */}
          <div className="rounded-2xl border border-emerald-500/20 bg-[#111C32] p-5">
            <p className="text-sm text-slate-400">
              Accepted
            </p>

            <h2 className="mt-5 text-3xl font-bold text-emerald-400">
              {loading ? "..." : acceptedCount}
            </h2>

            <p className="mt-2 text-xs text-slate-400">
              Approved submissions
            </p>
          </div>

        </section>

        {/* Error Message */}
        {projectsError && (
          <div
            role="alert"
            className="mb-6 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400"
          >
            {projectsError.message}
          </div>
        )}

        {/* Client Submissions Table */}
        <section className="overflow-hidden rounded-2xl border border-slate-700/70 bg-[#111C32] shadow-xl shadow-black/10">

          {/* Table Header */}
          <div className="flex flex-col justify-between gap-4 border-b border-slate-700/70 p-5 md:flex-row md:items-center md:p-6">

            <div className="flex items-center gap-3">
              <div className="h-8 w-1 rounded-full bg-blue-500" />

              <div>
                <h2 className="text-lg font-semibold text-white">
                  Client Submissions
                </h2>

                <p className="mt-1 text-sm text-slate-400">
                  Original project details submitted by clients.
                </p>
              </div>
            </div>

            <span className="rounded-full border border-blue-500/20 bg-blue-500/10 px-4 py-2 text-xs font-medium text-blue-400">
              {loading ? "Loading..." : `${projects.length} Requests`}
            </span>

          </div>

          {/* Table */}
          <div className="w-full overflow-x-auto">

            <table className="w-full min-w-[1050px] border-collapse text-left">

              <thead>
                <tr className="bg-[#17243D]/70 text-xs font-semibold uppercase tracking-wider text-slate-400">

                  <th className="px-5 py-5">
                    Project Name
                  </th>

                  <th className="px-5 py-5">
                    Client
                  </th>

                  <th className="px-5 py-5">
                    Priority
                  </th>

                  <th className="px-5 py-5">
                    Status
                  </th>

                  <th className="px-5 py-5">
                    Start Date
                  </th>

                  <th className="px-5 py-5">
                    Due Date
                  </th>

                  <th className="px-5 py-5">
                    Submitted On
                  </th>

                </tr>
              </thead>

              <tbody className="divide-y divide-slate-700/50 text-sm text-slate-300">

                {loading ? (

                  <tr>
                    <td
                      colSpan={7}
                      className="px-5 py-12 text-center text-slate-400"
                    >
                      <span className="inline-block animate-spin text-xl text-blue-400">
                        ◌
                      </span>

                      <p className="mt-3">
                        Loading client submissions...
                      </p>
                    </td>
                  </tr>

                ) : projects.length === 0 ? (

                  <tr>
                    <td
                      colSpan={7}
                      className="px-5 py-14 text-center"
                    >
                      <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-xl bg-slate-800 text-2xl text-slate-500">
                        ▣
                      </div>

                      <p className="font-medium text-slate-300">
                        No client submissions available.
                      </p>

                      <p className="mt-1 text-xs text-slate-500">
                        Projects submitted by clients will appear here.
                      </p>
                    </td>
                  </tr>

                ) : (

                  projects.map((project) => (

                    <tr
                      key={project.id}
                      className="transition duration-200 hover:bg-blue-500/[0.06]"
                    >

                      {/* Project Name */}
                      <td className="px-5 py-5">
                        <div>
                          <p className="font-medium text-slate-200">
                            {project.name}
                          </p>

                          {project.description && (
                            <p className="mt-1 max-w-[220px] truncate text-xs text-slate-500">
                              {project.description}
                            </p>
                          )}
                        </div>
                      </td>

                      {/* Client */}
                      <td className="px-5 py-5">
                        <div>
                          <p className="font-medium text-slate-200">
                            {project.client?.full_name || "Unknown Client"}
                          </p>

                          <p className="mt-1 text-xs text-slate-500">
                            {project.client?.email || "No email available"}
                          </p>
                        </div>
                      </td>

                      {/* Priority */}
                      <td className="px-5 py-5">
                        <span
                          className={`inline-flex rounded-full border px-3 py-1.5 text-xs font-medium capitalize ${getPriorityStyle(project.priority)}`}
                        >
                          {project.priority || "Not set"}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-5 py-5">
                        <span
                          className={`inline-flex rounded-full border px-3 py-1.5 text-xs font-medium capitalize ${getStatusStyle(project.status)}`}
                        >
                          {project.status?.replace(/_/g, " ") || "Submitted"}
                        </span>
                      </td>

                      {/* Start Date */}
                      <td className="px-5 py-5 text-slate-400">
                        {project.start_date || "Not set"}
                      </td>

                      {/* Due Date */}
                      <td className="px-5 py-5 text-slate-400">
                        {project.due_date || "Not set"}
                      </td>

                      {/* Submission Date */}
                      <td className="px-5 py-5 text-slate-400">
                        {project.created_at
                          ? new Date(project.created_at).toLocaleDateString()
                          : "Not available"}
                      </td>

                    </tr>

                  ))

                )}

              </tbody>

            </table>

          </div>

          {/* Table Footer */}
          {!loading && projects.length > 0 && (
            <div className="border-t border-slate-700/70 px-6 py-4">
              <p className="text-xs text-slate-500">
                Showing {projects.length} client submissions
              </p>
            </div>
          )}

        </section>

        {/* Footer */}
        <footer className="mt-8 flex flex-col justify-between gap-2 border-t border-slate-800 pt-5 text-xs text-slate-500 sm:flex-row">
          <p>QUADE Connect Workspace</p>
          <p>Client Project Monitoring</p>
        </footer>

      </main>
    </>
  );
}

export default ProjectsAllocation;
