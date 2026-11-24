import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Download, Search } from "lucide-react";

import { supabase } from "../../lib/supabaseClient";
import toast from "../../lib/toast";
import { fmtDate, label, taskStats } from "../../lib/utils";
import { personName, useWorkData } from "../../hooks/queries";
import {
  REVIEW_STATUSES, REVIEW_STYLE, reviewLabel, reviewStatusOf, useAttachments, useQcActivity, useReviews,
} from "../../hooks/qc";
import { Badge, Card, Empty, ErrorBox, Field, Loading, Modal, Page, StatCard, StatGrid, btnGhost, btnPrimary, inputCls } from "../../components/ui";

const th = "px-5 py-3";
const head = "bg-[#17243D]/70 text-xs uppercase tracking-wider text-slate-400";

export default function QcDashboard() {
  const d = useWorkData();
  const reviewsQ = useReviews();
  const docsQ = useAttachments();
  const actQ = useQcActivity();
  const client = useQueryClient();
  const [filter, setFilter] = useState("all");
  const [manager, setManager] = useState("");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null);
  const [status, setStatus] = useState("under_review");
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);

  const reviews = useMemo(() => Object.fromEntries((reviewsQ.data || []).map((r) => [r.project_id, r])), [reviewsQ.data]);
  const projectName = useMemo(() => Object.fromEntries(d.projects.map((p) => [p.id, p.name])), [d.projects]);

  const rows = d.projects.map((p) => {
    const teamIds = d.assignments.filter((a) => a.project_id === p.id).map((a) => a.team_id);
    const leads = [...new Set(teamIds.map((id) => d.teams.find((t) => t.id === id)?.team_lead_id).filter(Boolean))];
    return { p, leads, stats: taskStats(d.tasks.filter((t) => t.project_id === p.id)), qc: reviewStatusOf(p, reviews[p.id]), review: reviews[p.id] };
  });
  const count = (k) => rows.filter((r) => r.qc === k).length;
  const managers = [...new Set(d.projects.map((p) => p.project_manager_id).filter(Boolean))];
  const shown = rows.filter((r) =>
    (filter === "all" || r.qc === filter) &&
    (!manager || r.p.project_manager_id === manager) &&
    (!search || r.p.name.toLowerCase().includes(search.toLowerCase())));

  // Documents = files uploaded in Documents -> Projects
  const docs = (docsQ.data || []).filter((a) => a.project_id);
  const byProject = Object.entries(docs.reduce((m, a) => ((m[a.project_id] ||= { n: 0, last: a.created_at }).n++, m), {}))
    .sort((a, b) => b[1].n - a[1].n);

  const openFile = async (a) => {
    const { data, error } = await supabase.storage.from("documents").createSignedUrl(a.file_path, 120);
    if (error) return toast.error(error.message);
    window.open(data.signedUrl, "_blank", "noopener");
  };

  const startEdit = (r) => { setEditing(r); setStatus(r.qc === "not_submitted" ? "under_review" : r.qc); setRemarks(r.review?.remarks || ""); };
  const save = async () => {
    setSaving(true);
    const body = { status, remarks: remarks.trim() || null };
    const { error } = editing.review
      ? await supabase.from("qc_project_reviews").update(body).eq("project_id", editing.p.id)
      : await supabase.from("qc_project_reviews").insert({ ...body, project_id: editing.p.id });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`${editing.p.name}: ${reviewLabel(status)}`);
    setEditing(null);
    ["qc-reviews", "qc-activity"].forEach((k) => client.invalidateQueries({ queryKey: [k] }));
  };

  const loading = d.isLoading || reviewsQ.isLoading;
  const chip = (k, text, n) => (
    <button key={k} onClick={() => setFilter(k)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${filter === k ? "border-blue-500 bg-blue-500/20 text-blue-200" : "border-slate-700 text-slate-400 hover:bg-slate-800"}`}>
      {text} <span className="ml-1 opacity-70">{n}</span>
    </button>
  );

  return (
    <Page eyebrow="Quality Control" title="QC Dashboard" subtitle="Project progress, QC verification status and document submissions across the organization.">
      <ErrorBox error={d.error || reviewsQ.error} />
      <StatGrid>
        <StatCard label="Total projects" value={rows.length} loading={loading} />
        <StatCard label="Awaiting QC" value={count("awaiting")} hint="Completed by teams" loading={loading} tone="amber" />
        <StatCard label="Under QC review" value={count("under_review")} loading={loading} tone="slate" />
        <StatCard label="QC approved" value={count("approved")} loading={loading} tone="green" />
        <StatCard label="Needs rework" value={count("rework")} loading={loading} tone="red" />
      </StatGrid>

      {loading ? <Loading /> : (
        <div className="space-y-6">
          <Card title="Projects" subtitle="Who each project is assigned to and where it stands in QC."
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search project" className={`${inputCls} !w-44 !pl-9`} /></div>
                <select value={manager} onChange={(e) => setManager(e.target.value)} className={`${inputCls} !w-48`}>
                  <option value="">All Project Managers</option>
                  {managers.map((m) => <option key={m} value={m}>{personName(d.people, m)}</option>)}
                </select>
              </div>
            }>
            <div className="flex flex-wrap gap-2 border-b border-slate-700/70 p-4">
              {chip("all", "All", rows.length)}
              {chip("not_submitted", "In progress", count("not_submitted"))}
              {REVIEW_STATUSES.map((s) => chip(s.key, s.label, count(s.key)))}
            </div>
            {shown.length === 0 ? <Empty title="No projects match" text="Change the filters above." /> : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-left text-sm">
                  <thead><tr className={head}>
                    <th className={th}>Project</th><th className={th}>Project Manager</th><th className={th}>Team Lead(s)</th><th className={th}>Status</th>
                    <th className={th}>Progress</th><th className={th}>Docs</th><th className={th}>QC status</th><th className={th}></th>
                  </tr></thead>
                  <tbody className="divide-y divide-slate-700/50">
                    {shown.map((r) => (
                      <tr key={r.p.id} className="hover:bg-blue-500/[0.05]">
                        <td className="px-5 py-3 font-semibold text-white">{r.p.name}<div className="text-xs font-normal text-slate-500">Due {fmtDate(r.p.due_date)}</div></td>
                        <td className="px-5 py-3 text-slate-300">{personName(d.people, r.p.project_manager_id)}</td>
                        <td className="px-5 py-3 text-slate-300">{r.leads.length ? r.leads.map((l) => personName(d.people, l)).join(", ") : <span className="text-slate-500">No team yet</span>}</td>
                        <td className="px-5 py-3"><Badge status={r.p.status} /></td>
                        <td className="px-5 py-3 text-slate-300">{r.stats.completed}/{r.stats.total}</td>
                        <td className="px-5 py-3 text-slate-400">{docs.filter((x) => x.project_id === r.p.id).length}</td>
                        <td className="px-5 py-3"><span className={`rounded-full border px-3 py-1 text-xs font-semibold ${REVIEW_STYLE[r.qc]}`}>{reviewLabel(r.qc)}</span></td>
                        <td className="px-5 py-3 text-right"><button onClick={() => startEdit(r)} className="text-xs font-semibold text-blue-400 hover:text-blue-300">Update</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card title="Recent documents" subtitle="Latest files uploaded by Employees, Team Leads and Project Managers.">
              {docsQ.isLoading ? <Loading /> : docs.length === 0 ? <Empty title="No documents uploaded yet" /> : (
                <ul className="divide-y divide-slate-700/50">
                  {docs.slice(0, 8).map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-white">{a.file_name}</p>
                        <p className="truncate text-xs text-slate-400">{projectName[a.project_id]} · {personName(d.people, a.uploaded_by)} ({label(d.people[a.uploaded_by]?.role)}) · {fmtDate(a.created_at)}</p>
                      </div>
                      <button onClick={() => openFile(a)} aria-label="Open file" className="text-slate-400 hover:text-blue-300"><Download size={16} /></button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title="Project-wise uploads">
              {byProject.length === 0 ? <Empty title="No uploads yet" /> : (
                <table className="w-full text-left text-sm">
                  <thead><tr className={head}><th className={th}>Project</th><th className={th}>Files</th><th className={th}>Last upload</th></tr></thead>
                  <tbody className="divide-y divide-slate-700/50">
                    {byProject.map(([id, v]) => (
                      <tr key={id}><td className="px-5 py-3 text-white">{projectName[id]}</td><td className="px-5 py-3 text-slate-300">{v.n}</td><td className="px-5 py-3 text-slate-400">{fmtDate(v.last)}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </div>

          <Card title="Recent QC activity">
            {actQ.isLoading ? <Loading /> : (actQ.data || []).length === 0 ? <Empty title="No QC activity yet" text="Grades and review decisions appear here." /> : (
              <ul className="divide-y divide-slate-700/50">
                {actQ.data.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                    <span className="text-slate-200">{a.detail} <span className="text-slate-500">· by {personName(d.people, a.actor_id)}</span></span>
                    <span className="text-xs text-slate-500">{fmtDate(a.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      {editing && (
        <Modal title="Update QC status" subtitle={editing.p.name} onClose={() => setEditing(null)}
          footer={<><button className={btnGhost} onClick={() => setEditing(null)}>Cancel</button><button className={btnPrimary} onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</button></>}>
          <div className="space-y-4">
            <Field label="QC status">
              <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>
                {REVIEW_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </Field>
            <Field label="Remarks (corrections needed, approval note...)">
              <textarea rows={4} className={inputCls} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
            </Field>
          </div>
        </Modal>
      )}
    </Page>
  );
}
