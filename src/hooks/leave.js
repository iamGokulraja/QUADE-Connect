import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabaseClient";

// All leave query keys start with "leave" so one call refreshes everything.
function useRows(name, key, build = (q) => q) {
  return useQuery({
    queryKey: [key],
    queryFn: async () => {
      const { data, error } = await build(supabase.from(name).select("*"));
      if (error) throw error;
      return data || [];
    },
  });
}

export const LEAVE_STATUS = {
  pending: "Pending Approval",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

export const useLeaveTypes = () => useRows("leave_types", "leave-types", (q) => q.order("name"));
export const useLeaveRequests = () =>
  useRows("leave_requests", "leave-requests", (q) => q.order("submitted_at", { ascending: false }).limit(1000));
export const useLeaveApprovals = () => useRows("leave_approvals", "leave-approvals", (q) => q.order("action_date"));
export const useLeaveBalances = () => useRows("leave_balances", "leave-balances");
export const useLeaveCalendar = () => useRows("leave_calendar", "leave-calendar");
export const useLeaveRules = () => useRows("leave_approval_rules", "leave-rules");

// Profile fields used by leave (department, code...). Returns [] if the columns are not available yet.
export function useStaff() {
  return useQuery({
    queryKey: ["leave-staff"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, role, is_active, employee_code, department, designation, is_hr_manager");
      if (error) throw error;
      return data || [];
    },
  });
}

export function useRefreshLeave() {
  const client = useQueryClient();
  return () =>
    client.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("leave") });
}

export async function rpc(name, args) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data;
}

export async function openAttachment(path) {
  const { data, error } = await supabase.storage.from("leave-documents").createSignedUrl(path, 120);
  if (error) throw error;
  window.open(data.signedUrl, "_blank", "noopener");
}

export const LEAVE_APPLICANT_ROLES = ["employee", "team_lead", "project_manager", "hr", "admin"];
