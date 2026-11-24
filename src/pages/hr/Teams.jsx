
import { useEffect, useState } from "react";
import {
  Users,
  UserRound,
  UserPlus,
  Plus,
  Search,
  Pencil,
  X,
  Check,
  LoaderCircle,
  AlertCircle,
  RefreshCw,
  UsersRound,
  BriefcaseBusiness,
} from "lucide-react";

import { supabase } from "../../lib/supabaseClient";

function Teams() {
  const [teams, setTeams] = useState([]);
  const [teamLeads, setTeamLeads] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [memberships, setMemberships] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [search, setSearch] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState(null);

  const [form, setForm] = useState({
    name: "",
    description: "",
    team_lead_id: "",
    employee_ids: [],
  });

  const loadData = async () => {
    setLoading(true);
    setError("");

    try {
      const [
        { data: teamData, error: teamError },
        { data: profileData, error: profileError },
        { data: memberData, error: memberError },
      ] = await Promise.all([
        supabase
          .from("teams")
          .select(
            "id, name, description, team_lead_id, is_active, created_at"
          )
          .order("created_at", { ascending: false }),

        supabase
          .from("profiles")
          .select("id, full_name, email, role, is_active")
          .in("role", ["team_lead", "employee"])
          .eq("is_active", true)
          .order("full_name"),

        supabase
          .from("team_members")
          .select("id, team_id, employee_id"),
      ]);

      if (teamError) throw teamError;
      if (profileError) throw profileError;
      if (memberError) throw memberError;

      const profiles = profileData || [];

      setTeams(teamData || []);
      setTeamLeads(
        profiles.filter((profile) => profile.role === "team_lead")
      );
      setEmployees(
        profiles.filter((profile) => profile.role === "employee")
      );
      setMemberships(memberData || []);
    } catch (err) {
      setError(err.message || "Unable to load team information.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const getProfile = (id) => {
    return [...teamLeads, ...employees].find(
      (profile) => profile.id === id
    );
  };

  const getTeamMembers = (teamId) => {
    return memberships
      .filter((membership) => membership.team_id === teamId)
      .map((membership) => getProfile(membership.employee_id))
      .filter(Boolean);
  };

  const openCreateModal = () => {
    setEditingTeam(null);
    setForm({
      name: "",
      description: "",
      team_lead_id: "",
      employee_ids: [],
    });
    setError("");
    setSuccess("");
    setModalOpen(true);
  };

  const openEditModal = (team) => {
    setEditingTeam(team);

    setForm({
      name: team.name,
      description: team.description || "",
      team_lead_id: team.team_lead_id,
      employee_ids: memberships
        .filter((membership) => membership.team_id === team.id)
        .map((membership) => membership.employee_id),
    });

    setError("");
    setSuccess("");
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setModalOpen(false);
    setEditingTeam(null);
  };

  const toggleEmployee = (employeeId) => {
    setForm((current) => ({
      ...current,
      employee_ids: current.employee_ids.includes(employeeId)
        ? current.employee_ids.filter((id) => id !== employeeId)
        : [...current.employee_ids, employeeId],
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      if (!form.name.trim()) {
        throw new Error("Please enter a team name.");
      }

      if (!form.team_lead_id) {
        throw new Error("Please select a Team Lead.");
      }

      // A Team Lead can manage only one team.
      const leadAlreadyAssigned = teams.some(
        (team) =>
          team.team_lead_id === form.team_lead_id &&
          team.id !== editingTeam?.id
      );

      if (leadAlreadyAssigned) {
        throw new Error(
          "This Team Lead is already assigned to another team."
        );
      }

      // Employees can belong to only one team.
      const employeeAlreadyAssigned = form.employee_ids.find(
        (employeeId) =>
          memberships.some(
            (membership) =>
              membership.employee_id === employeeId &&
              membership.team_id !== editingTeam?.id
          )
      );

      if (employeeAlreadyAssigned) {
        throw new Error(
          "One or more selected employees already belong to another team. Remove them from their current team first."
        );
      }

      if (!editingTeam) {
        // Create the team.
        const { data: newTeam, error: createError } = await supabase
          .from("teams")
          .insert({
            name: form.name.trim(),
            description: form.description.trim() || null,
            team_lead_id: form.team_lead_id,
            is_active: true,
          })
          .select()
          .single();

        if (createError) throw createError;

        // Add the selected employees to the new team.
        if (form.employee_ids.length > 0) {
          const memberRows = form.employee_ids.map((employeeId) => ({
            team_id: newTeam.id,
            employee_id: employeeId,
          }));

          const { error: memberError } = await supabase
            .from("team_members")
            .insert(memberRows);

          if (memberError) {
            // Clean up the team if membership creation fails.
            await supabase
              .from("teams")
              .delete()
              .eq("id", newTeam.id);

            throw memberError;
          }
        }

        setSuccess("Team created successfully.");
      } else {
        // Update team information.
        const { error: updateError } = await supabase
          .from("teams")
          .update({
            name: form.name.trim(),
            description: form.description.trim() || null,
            team_lead_id: form.team_lead_id,
          })
          .eq("id", editingTeam.id);

        if (updateError) throw updateError;

        const existingIds = memberships
          .filter((membership) => membership.team_id === editingTeam.id)
          .map((membership) => membership.employee_id);

        const employeesToAdd = form.employee_ids.filter(
          (id) => !existingIds.includes(id)
        );

        const employeesToRemove = existingIds.filter(
          (id) => !form.employee_ids.includes(id)
        );

        // Add new members first.
        if (employeesToAdd.length > 0) {
          const { error: addError } = await supabase
            .from("team_members")
            .insert(
              employeesToAdd.map((employeeId) => ({
                team_id: editingTeam.id,
                employee_id: employeeId,
              }))
            );

          if (addError) throw addError;
        }

        // Remove members who were unselected.
        if (employeesToRemove.length > 0) {
          const { error: removeError } = await supabase
            .from("team_members")
            .delete()
            .eq("team_id", editingTeam.id)
            .in("employee_id", employeesToRemove);

          if (removeError) throw removeError;
        }

        setSuccess("Team updated successfully.");
      }

      setModalOpen(false);
      setEditingTeam(null);
      await loadData();
    } catch (err) {
      setError(err.message || "Unable to save the team.");
    } finally {
      setSaving(false);
    }
  };

  const filteredTeams = teams.filter((team) => {
    const query = search.toLowerCase();

    const lead = getProfile(team.team_lead_id);

    return (
      team.name.toLowerCase().includes(query) ||
      (lead?.full_name || "").toLowerCase().includes(query)
    );
  });

  const availableEmployees = employees.filter((employee) => {
    const currentMembership = memberships.find(
      (membership) => membership.employee_id === employee.id
    );

    return (
      !currentMembership ||
      currentMembership.team_id === editingTeam?.id ||
      form.employee_ids.includes(employee.id)
    );
  });

  return (
    <>
      <div className="min-h-full bg-slate-50 px-4 py-8 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-7xl">

          {/* Page Header */}
          <div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
            <div>
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
                <UsersRound size={24} />
              </div>

              <h1 className="text-3xl font-bold tracking-tight text-slate-900">
                Team Management
              </h1>

              <p className="mt-2 text-sm text-slate-600">
                Create teams, assign Team Leads and manage employees.
              </p>
            </div>

            <button
              onClick={openCreateModal}
              className="flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800"
            >
              <Plus size={19} />
              Create Team
            </button>
          </div>

          {/* Success Message */}
          {success && (
            <div className="mb-6 flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 p-4 text-sm font-medium text-green-800">
              <Check size={19} />
              {success}
              <button
                onClick={() => setSuccess("")}
                className="ml-auto"
                aria-label="Dismiss success message"
              >
                <X size={17} />
              </button>
            </div>
          )}

          {/* Error Message */}
          {error && !modalOpen && (
            <div className="mb-6 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              <AlertCircle size={19} />
              {error}
            </div>
          )}

          {/* Summary Cards */}
          <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-500">
                  Total Teams
                </p>
                <UsersRound className="text-blue-600" size={21} />
              </div>
              <p className="mt-3 text-3xl font-bold text-slate-900">
                {teams.length}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-500">
                  Assigned Team Leads
                </p>
                <UserRound className="text-indigo-600" size={21} />
              </div>
              <p className="mt-3 text-3xl font-bold text-slate-900">
                {teams.length}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-500">
                  Team Members
                </p>
                <Users className="text-green-600" size={21} />
              </div>
              <p className="mt-3 text-3xl font-bold text-slate-900">
                {memberships.filter((item) => item.team_id).length}
              </p>
            </div>
          </div>

          {/* Team Directory */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col justify-between gap-4 border-b border-slate-200 p-5 sm:flex-row sm:items-center">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Organization Teams
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  View and manage your organization's teams.
                </p>
              </div>

              <div className="flex gap-2">
                <div className="relative flex-1 sm:w-64">
                  <Search
                    size={17}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search teams..."
                    className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                <button
                  onClick={loadData}
                  disabled={loading}
                  className="rounded-lg border border-slate-300 p-2.5 text-slate-600 hover:bg-slate-50"
                  title="Refresh teams"
                >
                  <RefreshCw
                    size={18}
                    className={loading ? "animate-spin" : ""}
                  />
                </button>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center gap-3 py-20 text-sm text-slate-500">
                <LoaderCircle className="animate-spin" size={21} />
                Loading teams...
              </div>
            ) : filteredTeams.length === 0 ? (
              <div className="px-6 py-20 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
                  <UsersRound size={27} />
                </div>

                <h3 className="text-lg font-bold text-slate-900">
                  {search ? "No teams found" : "No teams created yet"}
                </h3>

                <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
                  {search
                    ? "Try searching with a different team name or Team Lead."
                    : "Create your first team by assigning a Team Lead and selecting employees."}
                </p>

                {!search && (
                  <button
                    onClick={openCreateModal}
                    className="mt-5 inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"
                  >
                    <Plus size={17} />
                    Create First Team
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-5 p-5 lg:grid-cols-2">
                {filteredTeams.map((team) => {
                  const lead = getProfile(team.team_lead_id);
                  const teamEmployees = getTeamMembers(team.id);

                  return (
                    <div
                      key={team.id}
                      className="rounded-xl border border-slate-200 p-5 transition hover:border-blue-200 hover:shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                            <UsersRound size={22} />
                          </div>

                          <div>
                            <h3 className="font-bold text-slate-900">
                              {team.name}
                            </h3>
                            <p className="mt-0.5 text-xs text-slate-500">
                              {team.is_active ? "Active Team" : "Inactive Team"}
                            </p>
                          </div>
                        </div>

                        <button
                          onClick={() => openEditModal(team)}
                          className="rounded-lg border border-slate-200 p-2 text-slate-500 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                          title="Edit team"
                        >
                          <Pencil size={16} />
                        </button>
                      </div>

                      {team.description && (
                        <p className="mt-4 text-sm leading-6 text-slate-600">
                          {team.description}
                        </p>
                      )}

                      <div className="mt-5 rounded-xl bg-slate-50 p-3">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Team Lead
                        </p>

                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700">
                            {lead?.full_name?.charAt(0)?.toUpperCase() || "?"}
                          </div>

                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900">
                              {lead?.full_name || "Profile unavailable"}
                            </p>
                            <p className="truncate text-xs text-slate-500">
                              {lead?.email || ""}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="mt-5">
                        <div className="mb-3 flex items-center justify-between">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Employees
                          </p>
                          <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                            {teamEmployees.length} Members
                          </span>
                        </div>

                        {teamEmployees.length === 0 ? (
                          <p className="rounded-lg border border-dashed border-slate-300 px-3 py-4 text-center text-xs text-slate-500">
                            No employees assigned yet.
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {teamEmployees.map((employee) => (
                              <div
                                key={employee.id}
                                className="flex items-center gap-2 text-sm text-slate-700"
                              >
                                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-green-100 text-xs font-bold text-green-700">
                                  {employee.full_name
                                    ?.charAt(0)
                                    ?.toUpperCase() || "?"}
                                </div>
                                <span>{employee.full_name}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Create / Edit Team Modal */}
        {modalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4">
            <div className="my-auto w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">
                    {editingTeam ? "Edit Team" : "Create New Team"}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Configure the Team Lead and employee membership.
                  </p>
                </div>

                <button
                  onClick={closeModal}
                  disabled={saving}
                  className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                  aria-label="Close modal"
                >
                  <X size={21} />
                </button>
              </div>

              <form onSubmit={handleSubmit}>
                <div className="max-h-[70vh] space-y-6 overflow-y-auto p-6">

                  {error && (
                    <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                      <AlertCircle size={18} className="mt-0.5 shrink-0" />
                      {error}
                    </div>
                  )}

                  {/* Team Name */}
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-800">
                      Team Name *
                    </label>

                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) =>
                        setForm({ ...form, name: e.target.value })
                      }
                      placeholder="Example: Team Alpha"
                      required
                      maxLength={100}
                      className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
                    />
                  </div>

                  {/* Description */}
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-800">
                      Description
                    </label>

                    <textarea
                      value={form.description}
                      onChange={(e) =>
                        setForm({ ...form, description: e.target.value })
                      }
                      placeholder="Describe the team's responsibilities..."
                      rows={3}
                      className="w-full resize-none rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
                    />
                  </div>

                  {/* Team Lead */}
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-800">
                      Select Team Lead *
                    </label>

                    <select
                      value={form.team_lead_id}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          team_lead_id: e.target.value,
                        })
                      }
                      required
                      className="w-full appearance-none rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
                    >
                      <option value="">Choose a Team Lead</option>

                      {teamLeads
                        .filter(
                          (lead) =>
                            !teams.some(
                              (team) =>
                                team.team_lead_id === lead.id &&
                                team.id !== editingTeam?.id
                            )
                        )
                        .map((lead) => (
                          <option key={lead.id} value={lead.id}>
                            {lead.full_name} — {lead.email}
                          </option>
                        ))}
                    </select>

                    {teamLeads.length === 0 && (
                      <p className="mt-2 text-xs text-amber-700">
                        No active Team Leads are available. Create a Team Lead account first.
                      </p>
                    )}
                  </div>

                  {/* Employees */}
                  <div>
                    <div className="mb-3 flex items-center justify-between">
                      <label className="text-sm font-semibold text-slate-800">
                        Add Employees
                      </label>

                      <span className="text-xs font-medium text-blue-700">
                        {form.employee_ids.length} selected
                      </span>
                    </div>

                    <div className="max-h-56 space-y-2 overflow-y-auto rounded-xl border border-slate-200 p-3">
                      {availableEmployees.length === 0 ? (
                        <div className="py-6 text-center">
                          <Users size={24} className="mx-auto text-slate-400" />
                          <p className="mt-2 text-sm text-slate-600">
                            No available employees.
                          </p>
                          <p className="mt-1 text-xs text-slate-400">
                            Create Employee accounts or remove them from their current teams.
                          </p>
                        </div>
                      ) : (
                        availableEmployees.map((employee) => (
                          <label
                            key={employee.id}
                            className="flex cursor-pointer items-center gap-3 rounded-lg p-3 transition hover:bg-slate-50"
                          >
                            <input
                              type="checkbox"
                              checked={form.employee_ids.includes(employee.id)}
                              onChange={() => toggleEmployee(employee.id)}
                              className="h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-500"
                            />

                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-green-100 text-sm font-bold text-green-700">
                              {employee.full_name
                                ?.charAt(0)
                                ?.toUpperCase() || "?"}
                            </div>

                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-slate-900">
                                {employee.full_name}
                              </p>
                              <p className="truncate text-xs text-slate-500">
                                {employee.email}
                              </p>
                            </div>

                            {form.employee_ids.includes(employee.id) && (
                              <Check size={18} className="text-blue-700" />
                            )}
                          </label>
                        ))
                      )}
                    </div>

                    <p className="mt-2 text-xs text-slate-500">
                      Each employee can belong to one team at a time.
                    </p>
                  </div>
                </div>

                {/* Modal Footer */}
                <div className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-slate-50 px-6 py-5 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={closeModal}
                    disabled={saving}
                    className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={saving || teamLeads.length === 0}
                    className="flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving ? (
                      <>
                        <LoaderCircle size={18} className="animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <UserPlus size={18} />
                        {editingTeam ? "Save Changes" : "Create Team"}
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default Teams;
