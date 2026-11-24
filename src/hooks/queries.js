import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabaseClient";

// Row Level Security decides what each role can see, so these hooks simply ask
// for everything and the database returns only what the signed-in user may view.
function useTable(name, key, build = (q) => q) {
  return useQuery({
    queryKey: [key],
    queryFn: async () => {
      const { data, error } = await build(supabase.from(name).select("*"));
      if (error) throw error;
      return data || [];
    },
  });
}

// Current signed-in user + profile
export function useMe() {
  return useQuery({
    queryKey: ["me"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();
      if (error) throw error;
      if (!user) return null;

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id, full_name, email, role, is_active")
        .eq("id", user.id)
        .maybeSingle();
      if (profileError) throw profileError;
      if (!profile) throw new Error("No profile found for this account.");

      return { ...profile, email: profile.email || user.email };
    },
  });
}

export const useProjects = () =>
  useTable("projects", "projects", (q) => q.order("created_at", { ascending: false }));
export const useTeams = () => useTable("teams", "teams", (q) => q.order("name"));
export const useAssignments = () => useTable("project_team_assignments", "assignments");
export const useTeamMembers = () => useTable("team_members", "team-members");
export const useReporting = () => useTable("project_manager_team_leads", "reporting");
// Projects I keep seeing after a team change (written by the database when I leave a team). Never fails the page:
// if the history table is not installed yet this is simply an empty list.
const NONE = [];
export const useProjectHistory = () =>
  useQuery({
    queryKey: ["project-history"],
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.from("staff_project_access").select("user_id, project_id, team_id");
      return error ? [] : data || [];
    },
  });
// Tasks with their owners (task_assignees). `assignees[0]` is the main owner (tasks.assigned_to).
export const useTasks = () =>
  useQuery({
    queryKey: ["tasks"],
    queryFn: async () => {
      const [t, a] = await Promise.all([
        supabase.from("tasks").select("*").order("created_at", { ascending: false }),
        supabase.from("task_assignees").select("task_id, user_id"),
      ]);
      if (t.error) throw t.error;
      const map = {};
      (a.data || []).forEach((r) => (map[r.task_id] ||= []).push(r.user_id));
      return (t.data || []).map((x) => {
        const ids = map[x.id] || [];
        const owners = x.assigned_to ? [x.assigned_to, ...ids.filter((id) => id !== x.assigned_to)] : ids;
        return { ...x, assignees: owners };
      });
    },
  });

// id -> { id, full_name, role, email } for every profile the user may see
export function usePeople() {
  const query = useQuery({
    queryKey: ["people"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, role, is_active");
      if (error) throw error;
      return data || [];
    },
  });
  const map = useMemo(
    () => Object.fromEntries((query.data || []).map((p) => [p.id, p])),
    [query.data]
  );
  return { ...query, map };
}

export const personName = (map, id) =>
  map?.[id]?.full_name || map?.[id]?.email || (id ? "Unknown user" : "Unassigned");

// Everything the work-management pages need, with simple derived helpers.
export function useWorkData() {
  const queries = {
    projects: useProjects(),
    teams: useTeams(),
    assignments: useAssignments(),
    members: useTeamMembers(),
    tasks: useTasks(),
    people: usePeople(),
  };
  const history = useProjectHistory();
  const list = Object.values(queries);
  return {
    projects: queries.projects.data || [],
    teams: queries.teams.data || [],
    assignments: queries.assignments.data || [],
    members: queries.members.data || [],
    // project tasks only; personal-board tasks (no project) are exposed separately
    tasks: (queries.tasks.data || []).filter((t) => t.project_id),
    personalTasks: (queries.tasks.data || []).filter((t) => !t.project_id),
    people: queries.people.map,
    history: history.data || NONE,
    isLoading: list.some((q) => q.isLoading),
    error: list.find((q) => q.error)?.error,
  };
}

