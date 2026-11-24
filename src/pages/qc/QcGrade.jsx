import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { History, Pencil, Search } from "lucide-react";

import { supabase } from "../../lib/supabaseClient";
import toast from "../../lib/toast";
import { fmtDate, label } from "../../lib/utils";
import { personName, useMe, useWorkData } from "../../hooks/queries";
import { GRADES, GRADE_STYLE, useGradeHistory, useGrades, useStaff } from "../../hooks/qc";
import { Card, Empty, ErrorBox, Field, Loading, Modal, Page, StatCard, StatGrid, btnGhost, btnPrimary, inputCls } from "../../components/ui";

const th = "px-4 py-3";
// Grades are monthly. A month is its first day as "YYYY-MM-01" (the database stores the same).
const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
const monthLabel = (key) => new Date(`${key}T00:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
const lastMonths = (n = 12) => Array.from({ length: n }, (_, i) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i); return monthKey(d); });
const head = "bg-[#17243D]/70 text-xs uppercase tracking-wider text-slate-400";
const GradePill = ({ g }) => g ? <span className={`rounded-full border px-3 py-1 text-xs font-bold ${GRADE_STYLE[g]}`}>{g}</span> : <span className="text-xs text-slate-500">Not graded</span>;

// QC: assign / update the monthly grade. HR + Admin: the same page in read-only "report" mode.
export default function QcGrade() {
  const { data: me } = useMe();
  const canEdit = me?.role === "qc";
  const d = useWorkData();
  const staffQ = useStaff();
  const gradesQ = useGrades();
  const histQ = useGradeHistory();
  const client = useQueryClient();

  const months = useMemo(() => lastMonths(12), []);
  const [month, setMonth] = useState(months[0]);
  const [tab, setTab] = useState("grades");
  const [search, setSearch] = useState("");
  const [fRole, setFRole] = useState("");
  const [fProject, setFProject] = useState("");
  const [fDept, setFDept] = useState("");
  const [fGrade, setFGrade] = useState("");
  const [editing, setEditing] = useState(null);
  const [grade, setGrade] = useState("A");
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);

  const staff = staffQ.data || [];
  const grades = gradesQ.data || [];
  const projectName = useMemo(() => Object.fromEntries(d.projects.map((p) => [p.id, p.name])), [d.projects]);

  // One row per person for the chosen month; the projects they work on are shown for context only.
  const rows = useMemo(() => staff.map((s) => {
    const teamIds = s.role === "team_lead"
      ? d.teams.filter((t) => t.team_lead_id === s.id).map((t) => t.id)
      : d.members.filter((m) => m.employee_id === s.id).map((m) => m.team_id);
    const projectIds = [...new Set(d.assignments.filter((a) => teamIds.includes(a.team_id)).map((a) => a.project_id))];
    return { s, projectIds, g: grades.find((x) => x.user_id === s.id && x.grade_month === month) };
  }), [staff, d.teams, d.members, d.assignments, grades, month]);

  const depts = [...new Set(staff.map((s) => s.department).filter(Boolean))].sort();
  const filtered = rows.filter(({ s, projectIds, g }) =>
    (!search || `${s.full_name} ${s.email} ${s.employee_code || ""}`.toLowerCase().includes(search.toLowerCase())) &&
    (!fRole || s.role === fRole) && (!fProject || projectIds.includes(fProject)) && (!fDept || s.department === fDept) &&
    (!fGrade || (fGrade === "none" ? !g : g?.grade === fGrade)));

  const history = (histQ.data || []).filter((h) => {
    const s = staff.find((x) => x.id === h.user_id);
    return (!search || (s?.full_name || "").toLowerCase().includes(search.toLowerCase())) &&
      (!fRole || s?.role === fRole) && (!fDept || s?.department === fDept) && (!fGrade || h.new_grade === fGrade);
  });

  // Month-by-month summary: how many people got each grade (all staff, not only the filtered ones)
  const monthReport = months.map((m) => {
    const gs = grades.filter((x) => x.grade_month === m);
    return { m, total: staff.length, graded: gs.length, ...Object.fromEntries(GRADES.map((x) => [x, gs.filter((r) => r.grade === x).length])) };
  });

  const open = (row) => { setEditing(row); setGrade(row.g?.grade || "A"); setRemarks(row.g?.remarks || ""); };
  const save = async () => {
    setSaving(true);
    const body = { grade, remarks: remarks.trim() || null };
    const { error } = editing.g
      ? await supabase.from("qc_grades").update(body).eq("id", editing.g.id)
      : await supabase.from("qc_grades").insert({ ...body, user_id: editing.s.id, grade_month: month });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`${editing.s.full_name} graded ${grade} for ${monthLabel(month)}.`);
    setEditing(null);
    ["qc-grades", "qc-grade-history", "qc-activity"].forEach((k) => client.invalidateQueries({ queryKey: [k] }));
  };

  const loading = staffQ.isLoading || gradesQ.isLoading || d.isLoading;
  const gradedNow = grades.filter((x) => x.grade_month === month);
  const sel = `${inputCls} !w-auto`;
  const personHistory = editing ? (histQ.data || []).filter((h) => h.user_id === editing.s.id) : [];

  return (
    <Page eyebrow={canEdit ? "Quality Control" : "Reports"} title={canEdit ? "QC Grade" : "QC Grade Reports"}
      subtitle={canEdit ? "Give every Employee and Team Lead one quality grade for each month." : "Monthly quality grades, remarks and history assigned by the QC team."}>
      <ErrorBox error={d.error || staffQ.error || gradesQ.error} />
      <StatGrid>
        <StatCard label="People" value={staff.length} loading={loading} />
        <StatCard label={`Graded in ${monthLabel(month).split(" ")[0]}`} value={gradedNow.length} loading={loading} tone="green" />
        <StatCard label="Not graded yet" value={Math.max(0, staff.length - gradedNow.length)} loading={loading} tone="amber" />
        {GRADES.slice(0, 2).map((g) => <StatCard key={g} label={`Grade ${g}`} value={gradedNow.filter((x) => x.grade === g).length} loading={loading} tone={g === "A+" ? "green" : "slate"} />)}
      </StatGrid>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {[["grades", "Grades"], ["months", "Monthly report"], ["history", "Grading history"]].map(([k, t]) => (
          <button key={k} onClick={() => setTab(k)} className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === k ? "bg-blue-600 text-white" : "border border-slate-700 text-slate-300 hover:bg-slate-800"}`}>{t}</button>
        ))}
      </div>
      <div className="mb-5 flex flex-wrap gap-2">
        <select className={sel} value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Grading month">
          {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
        <div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, email or employee ID" className={`${inputCls} !w-60 !pl-9`} /></div>
        <select className={sel} value={fRole} onChange={(e) => setFRole(e.target.value)}><option value="">Employees &amp; Team Leads</option><option value="employee">Employees</option><option value="team_lead">Team Leads</option></select>
        <select className={sel} value={fProject} onChange={(e) => setFProject(e.target.value)}><option value="">Any project</option>{d.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <select className={sel} value={fDept} onChange={(e) => setFDept(e.target.value)}><option value="">All departments</option>{depts.map((x) => <option key={x}>{x}</option>)}</select>
        <select className={sel} value={fGrade} onChange={(e) => setFGrade(e.target.value)}><option value="">All grades</option>{GRADES.map((g) => <option key={g}>{g}</option>)}<option value="none">Not graded</option></select>
      </div>

      {loading ? <Loading /> : tab === "grades" ? (
        <Card>
          {filtered.length === 0 ? <Empty title="No people match" text="Change the filters, or add Employees and Team Leads from the HR area." /> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-left text-sm">
                <thead><tr className={head}>
                  <th className={th}>Name</th><th className={th}>Employee ID</th><th className={th}>Role</th><th className={th}>Working on</th>
                  <th className={th}>Department</th><th className={th}>{monthLabel(month)} grade</th><th className={th}>Remarks</th><th className={th}>Last updated</th>{canEdit && <th className={th}></th>}
                </tr></thead>
                <tbody className="divide-y divide-slate-700/50">
                  {filtered.map((r) => (
                    <tr key={r.s.id} className="hover:bg-blue-500/[0.05]">
                      <td className="px-4 py-3 font-semibold text-white">{r.s.full_name || r.s.email}</td>
                      <td className="px-4 py-3 text-slate-400">{r.s.employee_code || "—"}</td>
                      <td className="px-4 py-3 text-slate-300 capitalize">{label(r.s.role)}</td>
                      <td className="max-w-[220px] truncate px-4 py-3 text-slate-300" title={r.projectIds.map((id) => projectName[id]).join(", ")}>{r.projectIds.length ? r.projectIds.map((id) => projectName[id]).filter(Boolean).join(", ") : <span className="text-slate-500">No project</span>}</td>
                      <td className="px-4 py-3 text-slate-400">{r.s.department || "—"}</td>
                      <td className="px-4 py-3"><GradePill g={r.g?.grade} /></td>
                      <td className="max-w-[240px] truncate px-4 py-3 text-slate-400" title={r.g?.remarks || ""}>{r.g?.remarks || "—"}</td>
                      <td className="px-4 py-3 text-slate-400">{r.g ? fmtDate(r.g.updated_at) : "—"}</td>
                      {canEdit && <td className="px-4 py-3 text-right"><button onClick={() => open(r)} className="inline-flex items-center gap-1 text-xs font-semibold text-blue-400 hover:text-blue-300"><Pencil size={14} />{r.g ? "Update" : "Grade"}</button></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : tab === "months" ? (
        <Card title="Monthly grading report" subtitle="How many people received each grade in each month.">
          <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm">
            <thead><tr className={head}><th className={th}>Month</th><th className={th}>People</th>{GRADES.map((g) => <th key={g} className={th}>{g}</th>)}<th className={th}>Not graded</th></tr></thead>
            <tbody className="divide-y divide-slate-700/50">{monthReport.map((r) => (
              <tr key={r.m} className="cursor-pointer hover:bg-blue-500/[0.05]" onClick={() => { setMonth(r.m); setTab("grades"); }}>
                <td className="px-4 py-3 font-semibold text-white">{monthLabel(r.m)}</td><td className="px-4 py-3 text-slate-300">{r.total}</td>
                {GRADES.map((g) => <td key={g} className="px-4 py-3 text-slate-300">{r[g]}</td>)}<td className="px-4 py-3 text-slate-500">{Math.max(0, r.total - r.graded)}</td></tr>
            ))}</tbody></table></div>
        </Card>
      ) : (
        <Card title="Grading history" subtitle="Every grade or remark change, newest first.">
          {histQ.isLoading ? <Loading /> : history.length === 0 ? <Empty icon={History} title="No grading history yet" /> : (
            <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-sm">
              <thead><tr className={head}><th className={th}>When</th><th className={th}>Person</th><th className={th}>Month</th><th className={th}>Change</th><th className={th}>Remarks</th><th className={th}>By</th></tr></thead>
              <tbody className="divide-y divide-slate-700/50">{history.map((h) => (
                <tr key={h.id}>
                  <td className="px-4 py-3 text-slate-400">{fmtDate(h.changed_at)}</td>
                  <td className="px-4 py-3 font-semibold text-white">{staff.find((s) => s.id === h.user_id)?.full_name || "—"}</td>
                  <td className="px-4 py-3 text-slate-300">{h.grade_month ? monthLabel(h.grade_month) : "—"}</td>
                  <td className="px-4 py-3">{h.old_grade ? <><GradePill g={h.old_grade} /> <span className="text-slate-500">→</span> </> : null}<GradePill g={h.new_grade} /></td>
                  <td className="max-w-[260px] truncate px-4 py-3 text-slate-400" title={h.new_remarks || ""}>{h.new_remarks || "—"}</td>
                  <td className="px-4 py-3 text-slate-400">{personName(d.people, h.changed_by)}</td>
                </tr>))}</tbody></table></div>
          )}
        </Card>
      )}

      {editing && (
        <Modal title={`${editing.g ? "Update" : "Assign"} QC grade`} subtitle={`${editing.s.full_name} · ${monthLabel(month)}`} onClose={() => setEditing(null)}
          footer={<><button className={btnGhost} onClick={() => setEditing(null)}>Cancel</button><button className={btnPrimary} onClick={save} disabled={saving}>{saving ? "Saving..." : "Save grade"}</button></>}>
          <Field label="Grade">
            <div className="flex gap-2">{GRADES.map((g) => (
              <button key={g} type="button" onClick={() => setGrade(g)} className={`flex-1 rounded-xl border py-3 text-lg font-bold ${grade === g ? GRADE_STYLE[g] + " ring-2 ring-blue-500" : "border-slate-700 text-slate-400 hover:bg-slate-800"}`}>{g}</button>
            ))}</div>
          </Field>
          <Field label="Quality remarks"><textarea rows={4} className={inputCls} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Accuracy, drawing standards, rework frequency..." /></Field>
          {personHistory.length > 0 && (
            <div><p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Grade history</p>
              <ul className="space-y-1.5 text-sm">{personHistory.slice(0, 5).map((h) => (
                <li key={h.id} className="flex items-center justify-between rounded-lg bg-[#0D172A] px-3 py-2"><span><GradePill g={h.new_grade} /> <span className="ml-2 text-slate-400">{h.new_remarks || "No remarks"}</span></span><span className="text-xs text-slate-500">{h.grade_month ? monthLabel(h.grade_month) : fmtDate(h.changed_at)}</span></li>
              ))}</ul></div>
          )}
        </Modal>
      )}
    </Page>
  );
}
