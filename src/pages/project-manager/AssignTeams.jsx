
import { useEffect, useState } from "react";
import {
  Users,
  X,
  Check,
  LoaderCircle,
  AlertCircle,
  RefreshCw,
  UserRound,
  BriefcaseBusiness,
} from "lucide-react";

import { supabase } from "../../lib/supabaseClient";
import { useMe } from "../../hooks/queries";

function AssignTeams({ project, onClose, onUpdated }) {
  const { data: me } = useMe();
  const [teams, setTeams] = useState([]);
  const [selectedTeams, setSelectedTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadTeams = async () => {
    setLoading(true);
    setError("");

    try {
      const [
        { data: teamData, error: teamError },
        { data: assignmentData, error: assignmentError },
        { data: reportingData, error: reportingError },
      ] = await Promise.all([
        supabase
          .from("teams")
          .select("id, name, description, team_lead_id, is_active")
          .eq("is_active", true)
          .order("name"),

        supabase
          .from("project_team_assignments")
          .select("team_id")
          .eq("project_id", project.id),

        // Team Leads who report to this Project Manager
        supabase
          .from("project_manager_team_leads")
          .select("team_lead_id")
          .eq("project_manager_id", me.id),
      ]);

      if (teamError) throw teamError;
      if (assignmentError) throw assignmentError;
      if (reportingError) throw reportingError;

      const assignedIds = (assignmentData || []).map((item) => item.team_id);
      const myLeadIds = (reportingData || []).map((r) => r.team_lead_id);

      // Only teams led by my Team Leads (plus teams already on this project, so they can be removed).
      setTeams(
        (teamData || []).filter(
          (team) =>
            myLeadIds.includes(team.team_lead_id) ||
            assignedIds.includes(team.id)
        )
      );
      setSelectedTeams(assignedIds);
    } catch (err) {
      setError(err.message || "Unable to load teams.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (me) loadTeams();
  }, [project.id, me?.id]);

  const toggleTeam = (teamId) => {
    setSelectedTeams((current) =>
      current.includes(teamId)
        ? current.filter((id) => id !== teamId)
        : [...current, teamId]
    );
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        throw new Error("Unable to identify your account.");
      }

      const { data: existingData, error: existingError } = await supabase
        .from("project_team_assignments")
        .select("id, team_id")
        .eq("project_id", project.id);

      if (existingError) throw existingError;

      const existing = existingData || [];
      const existingIds = existing.map((item) => item.team_id);

      const teamsToAdd = selectedTeams.filter(
        (id) => !existingIds.includes(id)
      );

      const teamsToRemove = existing.filter(
        (item) => !selectedTeams.includes(item.team_id)
      );

      // Assign newly selected teams.
      if (teamsToAdd.length > 0) {
        const { error: insertError } = await supabase
          .from("project_team_assignments")
          .insert(
            teamsToAdd.map((teamId) => ({
              project_id: project.id,
              team_id: teamId,
              assigned_by: user.id,
            }))
          );

        if (insertError) throw insertError;
      }

      // Remove teams that were unselected.
      for (const assignment of teamsToRemove) {
        const { error: deleteError } = await supabase
          .from("project_team_assignments")
          .delete()
          .eq("id", assignment.id);

        if (deleteError) throw deleteError;
      }

      setSuccess("Project teams updated successfully.");

      await loadTeams();

      if (onUpdated) {
        await onUpdated();
      }

      setTimeout(() => {
        onClose();
      }, 700);
    } catch (err) {
      setError(err.message || "Unable to update project teams.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/70 p-4">
      <div className="my-auto w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-700 bg-[#111C32] shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-700 p-6">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-blue-400">
              Project Team Assignment
            </p>

            <h2 className="text-xl font-bold text-white">
              Assign Teams
            </h2>

            <p className="mt-1 text-sm text-slate-400">
              {project.name}
            </p>
          </div>

          <button
            onClick={onClose}
            disabled={saving}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-700 hover:text-white disabled:opacity-50"
            aria-label="Close"
          >
            <X size={21} />
          </button>
        </div>

        {/* Content */}
        <div className="max-h-[65vh] space-y-4 overflow-y-auto p-6">

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
              <AlertCircle size={18} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          {success && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">
              <Check size={18} />
              {success}
            </div>
          )}

          <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 p-4">
            <div className="flex items-start gap-3">
              <BriefcaseBusiness
                size={20}
                className="mt-0.5 text-blue-400"
              />

              <div>
                <p className="text-sm font-semibold text-blue-200">
                  Project
                </p>
                <p className="mt-1 text-sm text-slate-300">
                  {project.name}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  You can assign multiple teams led by your Team Leads.
                  A team can also work on other projects.
                </p>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-3 py-14 text-sm text-slate-400">
              <LoaderCircle size={21} className="animate-spin" />
              Loading available teams...
            </div>
          ) : teams.length === 0 ? (
            <div className="py-12 text-center">
              <Users size={30} className="mx-auto text-slate-500" />

              <p className="mt-3 font-semibold text-white">
                No active teams available
              </p>

              <p className="mt-2 text-sm text-slate-400">
                No team led by one of your Team Leads is available. Ask HR to assign Team Leads to you (Reporting Hierarchy) and make sure they lead an active team.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">
                  Available Teams
                </h3>

                <span className="rounded-full bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-300">
                  {selectedTeams.length} selected
                </span>
              </div>

              <div className="space-y-3">
                {teams.map((team) => {
                  const isSelected = selectedTeams.includes(team.id);

                  return (
                    <button
                      type="button"
                      key={team.id}
                      onClick={() => toggleTeam(team.id)}
                      className={`flex w-full items-center gap-4 rounded-xl border p-4 text-left transition ${
                        isSelected
                          ? "border-blue-500 bg-blue-500/10"
                          : "border-slate-700 bg-[#17243D] hover:border-slate-500"
                      }`}
                    >
                      <div
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                          isSelected
                            ? "bg-blue-500/20 text-blue-300"
                            : "bg-slate-700 text-slate-300"
                        }`}
                      >
                        <Users size={21} />
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-white">
                          {team.name}
                        </p>

                        <p className="mt-1 text-xs text-slate-400">
                          {team.description || "No team description"}
                        </p>
                      </div>

                      <div
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${
                          isSelected
                            ? "border-blue-500 bg-blue-600 text-white"
                            : "border-slate-500 text-transparent"
                        }`}
                      >
                        <Check size={15} />
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-col-reverse gap-3 border-t border-slate-700 bg-[#0D172A] p-5 sm:flex-row sm:justify-between">
          <button
            type="button"
            onClick={loadTeams}
            disabled={loading || saving}
            className="flex items-center justify-center gap-2 rounded-xl border border-slate-600 px-5 py-3 text-sm font-semibold text-slate-300 hover:bg-slate-800 disabled:opacity-50"
          >
            <RefreshCw size={16} />
            Refresh
          </button>

          <div className="flex flex-col-reverse gap-3 sm:flex-row">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-xl border border-slate-600 px-5 py-3 text-sm font-semibold text-slate-300 hover:bg-slate-800 disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={loading || saving || teams.length === 0}
              className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? (
                <>
                  <LoaderCircle size={17} className="animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Check size={17} />
                  Save Team Assignment
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AssignTeams;
