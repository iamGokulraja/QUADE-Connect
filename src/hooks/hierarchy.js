import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabaseClient";

// Everyone in the organisation that the signed-in HR / Admin may see (name, role, joined date).
export const useDirectory = () =>
  useQuery({
    queryKey: ["org-directory"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, role, is_active, created_at")
        .order("full_name");
      if (error) throw error;
      return data || [];
    },
  });

const REFRESH = ["teams", "team-members", "reporting", "assignments", "projects", "org-directory", "people", "project-history"];

async function rpc(name, args) {
  const { error } = await supabase.rpc(name, args);
  if (error) throw error;
}

// The three structure changes. They run in the database (HR / Admin only) and refresh every list that shows the structure.
export function useOrgMoves() {
  const client = useQueryClient();
  const onSuccess = () => REFRESH.forEach((k) => client.invalidateQueries({ queryKey: [k] }));
  return {
    moveEmployee: useMutation({ mutationFn: ({ employee, from, to }) => rpc("hr_move_employee", { p_employee: employee, p_from: from, p_to: to }), onSuccess }),
    moveLead: useMutation({ mutationFn: ({ lead, pm }) => rpc("hr_move_team_lead", { p_lead: lead, p_pm: pm }), onSuccess }),
    setTeamLead: useMutation({ mutationFn: ({ team, lead }) => rpc("hr_set_team_lead", { p_team: team, p_lead: lead }), onSuccess }),
  };
}

// A project counts as "current" until it is finished or cancelled.
export const isCurrentProject = (p) => !["completed", "cancelled"].includes(p?.status);
