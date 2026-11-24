import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabaseClient";

export const GRADES = ["A+", "A", "B", "C"];
export const GRADE_STYLE = {
  "A+": "border-emerald-500/30 bg-emerald-500/15 text-emerald-300",
  A: "border-sky-500/30 bg-sky-500/15 text-sky-300",
  B: "border-amber-500/30 bg-amber-500/15 text-amber-300",
  C: "border-red-500/30 bg-red-500/15 text-red-300",
};
export const REVIEW_STATUSES = [
  { key: "awaiting", label: "Awaiting QC", tone: "amber" },
  { key: "under_review", label: "Under QC review", tone: "blue" },
  { key: "approved", label: "QC approved", tone: "green" },
  { key: "rework", label: "Needs rework", tone: "red" },
];
export const REVIEW_STYLE = {
  not_submitted: "border-slate-600/40 bg-slate-500/10 text-slate-400",
  awaiting: "border-amber-500/30 bg-amber-500/15 text-amber-300",
  under_review: "border-blue-500/30 bg-blue-500/15 text-blue-300",
  approved: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300",
  rework: "border-red-500/30 bg-red-500/15 text-red-300",
};
export const reviewLabel = (k) => (k === "not_submitted" ? "In progress" : REVIEW_STATUSES.find((s) => s.key === k)?.label || k);

// A project is "awaiting QC" once its teams mark it completed and QC has not started yet.
export const reviewStatusOf = (project, review) =>
  review?.status || (project.status === "completed" ? "awaiting" : "not_submitted");

const table = (name, key, build = (q) => q) => () =>
  useQuery({
    queryKey: [key],
    queryFn: async () => {
      const { data, error } = await build(supabase.from(name).select("*"));
      if (error) throw error;
      return data || [];
    },
  });

export const useReviews = table("qc_project_reviews", "qc-reviews");
export const useGrades = table("qc_grades", "qc-grades");
export const useGradeHistory = table("qc_grade_history", "qc-grade-history", (q) => q.order("changed_at", { ascending: false }).limit(500));
export const useQcActivity = table("qc_activity", "qc-activity", (q) => q.order("created_at", { ascending: false }).limit(30));
// Project documents uploaded in Documents -> Projects (Initial / Review sections)
export const useAttachments = table("doc_files", "qc-docs", (q) => q.not("project_id", "is", null).order("created_at", { ascending: false }).limit(1000));

// Staff profiles with the extra columns QC Grade needs
export const useStaff = () =>
  useQuery({
    queryKey: ["qc-staff"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, role, is_active, employee_code, department, designation")
        .in("role", ["employee", "team_lead"])
        .order("full_name");
      if (error) throw error;
      return data || [];
    },
  });
