
import { useRef, useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { supabase } from "../../lib/supabaseClient";

function ClientSubmissions() {
  const queryClient = useQueryClient();
  const internalProjectsRef = useRef(null);

  const [selectedRequest, setSelectedRequest] = useState(null);
  const [selectedManager, setSelectedManager] = useState("");
  const [editingProject, setEditingProject] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [message, setMessage] = useState("");

  // Fetch client submissions
  const {
    data: requests = [],
    isLoading: requestsLoading,
    error: requestsError,
  } = useQuery({
    queryKey: ["admin-client-requests"],
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

  // Fetch Project Managers
  const {
    data: managers = [],
    isLoading: managersLoading,
  } = useQuery({
    queryKey: ["active-project-managers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, is_active")
        .eq("role", "project_manager")
        .order("full_name");

      if (error) throw error;
      return data || [];
    },
  });

  // Fetch internal projects and their related details
  const {
    data: internalProjects = [],
    isLoading: internalProjectsLoading,
    error: internalProjectsError,
  } = useQuery({
    queryKey: ["admin-internal-projects"],
    queryFn: async () => {
      const { data: projects, error: projectError } = await supabase
        .from("projects")
        .select("*")
        .not("source_request_id", "is", null)
        .order("created_at", { ascending: false });

      if (projectError) throw projectError;

      if (!projects?.length) return [];

      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select("id, full_name, email");

      if (profileError) throw profileError;

      const { data: submissions, error: submissionError } = await supabase
        .from("client_project_requests")
        .select(`
          id,
          name,
          client:profiles!client_project_requests_created_by_fkey (
            id,
            full_name,
            email
          )
        `);

      if (submissionError) throw submissionError;

      const profileMap = Object.fromEntries(
        (profiles || []).map((profile) => [profile.id, profile])
      );

      const submissionMap = Object.fromEntries(
        (submissions || []).map((submission) => [
          submission.id,
          submission,
        ])
      );

      return projects.map((project) => ({
        ...project,
        manager: profileMap[project.project_manager_id] || null,
        submission: submissionMap[project.source_request_id] || null,
      }));
    },
  });

  const convertedRequestIds = internalProjects.map(
    (project) => project.source_request_id
  );

  const isConverted = (requestId) =>
    convertedRequestIds.includes(requestId);

  // Refresh related data after changes
  const refreshProjectData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["admin-internal-projects"],
      }),
      queryClient.invalidateQueries({
        queryKey: ["converted-client-requests"],
      }),
      queryClient.invalidateQueries({
        queryKey: ["admin-client-requests"],
      }),
      queryClient.invalidateQueries({
        queryKey: ["project-manager-projects"],
      }),
    ]);
  };

  // Create internal project
  const createProjectMutation = useMutation({
    mutationFn: async () => {
      if (!selectedRequest) {
        throw new Error("Please select a client submission.");
      }

      if (!selectedManager) {
        throw new Error("Please select a Project Manager.");
      }

      if (isConverted(selectedRequest.id)) {
        throw new Error("This submission has already been converted.");
      }

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;
      if (!user) throw new Error("Admin session not found.");

      const { data, error } = await supabase
        .from("projects")
        .insert({
          name: selectedRequest.name,
          description: selectedRequest.description,
          priority: selectedRequest.priority,
          start_date: selectedRequest.start_date,
          due_date: selectedRequest.due_date,
          status: "planned",
          created_by: user.id,
          project_manager_id: selectedManager,
          source_request_id: selectedRequest.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },

    onSuccess: async () => {
      setMessage("Internal project created and assigned successfully.");
      setSelectedRequest(null);
      setSelectedManager("");
      await refreshProjectData();
    },

    onError: (error) => {
      setMessage(error.message);
    },
  });

  // Update internal project
  const updateProjectMutation = useMutation({
    mutationFn: async () => {
      if (!editForm.name?.trim()) {
        throw new Error("Project name is required.");
      }

      if (!editForm.project_manager_id) {
        throw new Error("Please select a Project Manager.");
      }

      const { data, error } = await supabase
        .from("projects")
        .update({
          name: editForm.name.trim(),
          description: editForm.description?.trim() || null,
          priority: editForm.priority,
          start_date: editForm.start_date || null,
          due_date: editForm.due_date || null,
          project_manager_id: editForm.project_manager_id,
        })
        .eq("id", editingProject.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },

    onSuccess: async () => {
      setMessage("Internal project updated successfully.");
      setEditingProject(null);
      setEditForm({});
      await refreshProjectData();
    },

    onError: (error) => {
      setMessage(error.message);
    },
  });

  // Delete internal project safely
  const deleteProjectMutation = useMutation({
    mutationFn: async (project) => {
      // Check whether tasks are linked to this project
      const { data: linkedTasks, error: taskError } = await supabase
        .from("tasks")
        .select("id")
        .eq("project_id", project.id)
        .limit(1);

      if (taskError) throw taskError;

      if (linkedTasks?.length) {
        throw new Error(
          "This project has tasks assigned to it. Reassign or remove those tasks before deleting the project."
        );
      }

      const { error } = await supabase
        .from("projects")
        .delete()
        .eq("id", project.id);

      if (error) throw error;
    },

    onSuccess: async () => {
      setMessage(
        "Internal project deleted. The original client submission is unchanged."
      );
      await refreshProjectData();
    },

    onError: (error) => {
      setMessage(error.message);
    },
  });

  const openEditForm = (project) => {
    setMessage("");
    setEditingProject(project);

    setEditForm({
      name: project.name || "",
      description: project.description || "",
      priority: project.priority || "medium",
      start_date: project.start_date || "",
      due_date: project.due_date || "",
      project_manager_id: project.project_manager_id || "",
    });
  };

  const handleDelete = (project) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${project.name}"? The original client submission will remain unchanged.`
    );

    if (confirmed) {
      setMessage("");
      deleteProjectMutation.mutate(project);
    }
  };

  return (
    <>
      <main className="min-h-screen bg-slate-950 p-6 text-white">
        {/* Header */}
        <header className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-blue-400">
            Workspace Management
          </p>

          <h1 className="mt-2 text-3xl font-bold">
            Team Management
          </h1>

          <p className="mt-2 text-slate-400">
            Review client submissions and manage internal project assignments.
          </p>
        </header>

        {/* Message */}
        {message && (
          <div className="mb-5 flex items-center justify-between rounded-lg border border-blue-500/30 bg-blue-500/10 p-4 text-sm text-blue-300">
            <span>{message}</span>
            <button
              onClick={() => setMessage("")}
              className="ml-4 font-semibold underline"
            >
              Close
            </button>
          </div>
        )}

        {/* Summary Cards */}
        <section className="mb-7 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
            <p className="text-sm text-slate-400">
              Client Submissions
            </p>
            <h2 className="mt-2 text-3xl font-bold">
              {requests.length}
            </h2>
          </div>

          <button
            type="button"
            onClick={() =>
              internalProjectsRef.current?.scrollIntoView({
                behavior: "smooth",
                block: "start",
              })
            }
            className="rounded-xl border border-emerald-500/30 bg-slate-900 p-5 text-left transition hover:border-emerald-400 hover:bg-slate-800"
          >
            <p className="text-sm text-slate-400">
              Converted Projects
            </p>
            <h2 className="mt-2 text-3xl font-bold text-emerald-400">
              {internalProjects.length}
            </h2>
            <p className="mt-2 text-xs text-emerald-400">
              Click to view internal projects ↓
            </p>
          </button>

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
            <p className="text-sm text-slate-400">
              Available Project Managers
            </p>
            <h2 className="mt-2 text-3xl font-bold text-blue-400">
              {managers.filter((manager) => manager.is_active).length}
            </h2>
          </div>
        </section>

        {/* Client Submissions */}
        <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
          <div className="border-b border-slate-800 p-5">
            <h2 className="text-lg font-semibold">
              Client Project Submissions
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Select a submission to create its internal project.
            </p>
          </div>

          {requestsLoading ? (
            <p className="p-6 text-slate-400">
              Loading submissions...
            </p>
          ) : requestsError ? (
            <p className="p-6 text-red-400">
              {requestsError.message}
            </p>
          ) : requests.length === 0 ? (
            <p className="p-6 text-slate-400">
              No client submissions found.
            </p>
          ) : (
            <div className="divide-y divide-slate-800">
              {requests.map((request) => {
                const converted = isConverted(request.id);

                return (
                  <div
                    key={request.id}
                    className="flex flex-col justify-between gap-4 p-5 md:flex-row md:items-center"
                  >
                    <div>
                      <h3 className="font-semibold">
                        {request.name}
                      </h3>

                      <p className="mt-1 text-sm text-slate-400">
                        Client: {request.client?.full_name || "Unknown"}
                      </p>

                      <p className="mt-1 text-xs text-slate-500">
                        {request.client?.email || ""}
                      </p>

                      <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-400">
                        <span>Priority: {request.priority}</span>
                        <span>
                          Status: {request.status?.replace(/_/g, " ")}
                        </span>
                        <span>
                          Due: {request.due_date || "Not specified"}
                        </span>
                      </div>
                    </div>

                    {converted ? (
                      <span className="rounded-full bg-emerald-500/10 px-4 py-2 text-xs font-medium text-emerald-400">
                        Internal Project Created
                      </span>
                    ) : (
                      <button
                        onClick={() => {
                          setMessage("");
                          setSelectedRequest(request);
                          setSelectedManager("");
                          setEditingProject(null);
                        }}
                        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500"
                      >
                        Select Project
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Create Internal Project Form */}
        {selectedRequest && (
          <section className="mt-7 rounded-xl border border-blue-500/30 bg-slate-900 p-6">
            <h2 className="text-xl font-semibold">
              Create Internal Project
            </h2>

            <p className="mt-2 text-sm text-slate-400">
              Project: {selectedRequest.name}
            </p>

            <label className="mb-2 mt-6 block text-sm font-medium">
              Assign Project Manager
            </label>

            <select
              value={selectedManager}
              onChange={(e) => setSelectedManager(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-white"
              disabled={managersLoading}
            >
              <option value="">Select a Project Manager</option>

              {managers
                .filter((manager) => manager.is_active)
                .map((manager) => (
                  <option key={manager.id} value={manager.id}>
                    {manager.full_name || manager.email}
                  </option>
                ))}
            </select>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                onClick={() => createProjectMutation.mutate()}
                disabled={
                  !selectedManager ||
                  createProjectMutation.isPending
                }
                className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold disabled:opacity-50"
              >
                {createProjectMutation.isPending
                  ? "Creating..."
                  : "Create & Assign Project"}
              </button>

              <button
                onClick={() => {
                  setSelectedRequest(null);
                  setSelectedManager("");
                }}
                className="rounded-lg border border-slate-700 px-5 py-3 text-sm"
              >
                Cancel
              </button>
            </div>
          </section>
        )}

        {/* Internal Projects */}
        <section
          ref={internalProjectsRef}
          className="mt-9 scroll-mt-6 overflow-hidden rounded-xl border border-emerald-500/20 bg-slate-900"
        >
          <div className="flex flex-col justify-between gap-3 border-b border-slate-800 p-5 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-xl font-semibold">
                Internal Projects
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                Manage converted projects and their Project Manager assignments.
              </p>
            </div>

            <span className="rounded-full bg-emerald-500/10 px-4 py-2 text-xs font-medium text-emerald-400">
              {internalProjects.length} Projects
            </span>
          </div>

          {internalProjectsLoading ? (
            <p className="p-6 text-slate-400">
              Loading internal projects...
            </p>
          ) : internalProjectsError ? (
            <p className="p-6 text-red-400">
              {internalProjectsError.message}
            </p>
          ) : internalProjects.length === 0 ? (
            <p className="p-6 text-slate-400">
              No internal projects have been created yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1050px] text-left text-sm">
                <thead className="bg-slate-800/70 text-xs uppercase text-slate-400">
                  <tr>
                    <th className="p-4">Project</th>
                    <th className="p-4">Client</th>
                    <th className="p-4">Assigned Project Manager</th>
                    <th className="p-4">Priority</th>
                    <th className="p-4">Status</th>
                    <th className="p-4">Due Date</th>
                    <th className="p-4">Actions</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-800">
                  {internalProjects.map((project) => (
                    <tr
                      key={project.id}
                      className="transition hover:bg-slate-800/40"
                    >
                      <td className="p-4">
                        <p className="font-semibold text-white">
                          {project.name}
                        </p>
                        <p className="mt-1 max-w-[200px] truncate text-xs text-slate-500">
                          {project.description || "No description"}
                        </p>
                      </td>

                      <td className="p-4">
                        <p className="text-slate-200">
                          {project.submission?.client?.full_name || "Unknown"}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {project.submission?.client?.email || ""}
                        </p>
                      </td>

                      <td className="p-4">
                        <p className="text-slate-200">
                          {project.manager?.full_name || "Not assigned"}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {project.manager?.email || ""}
                        </p>
                      </td>

                      <td className="p-4 capitalize text-slate-300">
                        {project.priority}
                      </td>

                      <td className="p-4">
                        <span className="rounded-full bg-blue-500/10 px-3 py-1.5 text-xs capitalize text-blue-400">
                          {project.status?.replace(/_/g, " ")}
                        </span>
                      </td>

                      <td className="p-4 text-slate-400">
                        {project.due_date || "Not set"}
                      </td>

                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => openEditForm(project)}
                            className="rounded-lg border border-blue-500/30 px-3 py-2 text-xs text-blue-400 hover:bg-blue-500/10"
                          >
                            Edit
                          </button>

                          <button
                            onClick={() => handleDelete(project)}
                            disabled={deleteProjectMutation.isPending}
                            className="rounded-lg border border-red-500/30 px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Edit Project Modal */}
        {editingProject && (
          <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4">
            <div className="my-auto w-full max-w-2xl rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold">
                    Edit Internal Project
                  </h2>
                  <p className="mt-1 text-sm text-slate-400">
                    Update project details and assignment.
                  </p>
                </div>

                <button
                  onClick={() => setEditingProject(null)}
                  className="text-xl text-slate-400 hover:text-white"
                >
                  ×
                </button>
              </div>

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="mb-2 block text-sm text-slate-400">
                    Project Name
                  </label>
                  <input
                    value={editForm.name}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        name: e.target.value,
                      })
                    }
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-blue-500"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="mb-2 block text-sm text-slate-400">
                    Description
                  </label>
                  <textarea
                    rows={3}
                    value={editForm.description}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        description: e.target.value,
                      })
                    }
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-slate-400">
                    Priority
                  </label>
                  <select
                    value={editForm.priority}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        priority: e.target.value,
                      })
                    }
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm text-slate-400">
                    Assign Project Manager
                  </label>
                  <select
                    value={editForm.project_manager_id}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        project_manager_id: e.target.value,
                      })
                    }
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                  >
                    <option value="">Select Project Manager</option>

                    {managers.map((manager) => (
                      <option
                        key={manager.id}
                        value={manager.id}
                        disabled={!manager.is_active}
                      >
                        {manager.full_name || manager.email}
                        {!manager.is_active ? " (Inactive)" : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm text-slate-400">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={editForm.start_date}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        start_date: e.target.value,
                      })
                    }
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-slate-400">
                    Due Date
                  </label>
                  <input
                    type="date"
                    value={editForm.due_date}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        due_date: e.target.value,
                      })
                    }
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                  />
                </div>
              </div>

              <div className="mt-7 flex flex-wrap justify-end gap-3">
                <button
                  onClick={() => setEditingProject(null)}
                  className="rounded-lg border border-slate-700 px-5 py-3 text-sm text-slate-300 hover:bg-slate-800"
                >
                  Cancel
                </button>

                <button
                  onClick={() => updateProjectMutation.mutate()}
                  disabled={updateProjectMutation.isPending}
                  className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold hover:bg-blue-500 disabled:opacity-50"
                >
                  {updateProjectMutation.isPending
                    ? "Saving..."
                    : "Save Changes"}
                </button>
              </div>
            </div>
          </div>
        )}

        <footer className="mt-8 border-t border-slate-800 pt-5 text-xs text-slate-500">
          QUADE Connect Workspace
        </footer>
      </main>
    </>
  );
}

export default ClientSubmissions;
