import { useEffect, useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, Clock3, FolderKanban, Pencil, Plus, Search, Send, Trash2 } from "lucide-react";

import { supabase } from "../../lib/supabaseClient";
import { fmtDate } from "../../lib/utils";
import { useMe } from "../../hooks/queries";
import { Badge, ErrorBox, Field, Loading, Modal, Page, Priority, btnGhost, btnPrimary, inputCls } from "../../components/ui";

const EMPTY = { name: "", description: "", priority: "medium", start_date: "", due_date: "" };

// Days from today until a date (negative = past).
const daysUntil = (d) => (d ? Math.round((new Date(`${d}T00:00:00`) - new Date(new Date().toDateString())) / 864e5) : null);
const dueText = (d) => {
  const n = daysUntil(d);
  if (n === null) return "No due date";
  if (n < 0) return `${-n} day${n === -1 ? "" : "s"} overdue`;
  if (n === 0) return "Due today";
  if (n === 1) return "Due tomorrow";
  return `Due in ${n} days`;
};

// Client dashboard: your projects at a glance, with create / edit / delete.
export default function Projects() {
  const { data: me } = useMe();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(null); // null | "new" | project being edited
  const [form, setForm] = useState(EMPTY);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  const load = async () => {
    setError("");
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) { setError("Unable to identify your account."); setLoading(false); return; }
    const { data, error: err } = await supabase.from("client_project_requests").select("*").eq("created_by", user.id).order("created_at", { ascending: false });
    if (err) setError(err.message); else setProjects(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const stats = useMemo(() => {
    const open = projects.filter((p) => p.status !== "rejected");
    return {
      total: projects.length,
      waiting: projects.filter((p) => p.status === "submitted").length,
      active: projects.filter((p) => p.status && !["submitted", "rejected", "completed"].includes(p.status)).length,
      soon: open.filter((p) => { const n = daysUntil(p.due_date); return n !== null && n >= 0 && n <= 14; }).length,
    };
  }, [projects]);

  const statuses = [...new Set(projects.map((p) => p.status).filter(Boolean))];
  const shown = projects.filter((p) => (filter === "all" || p.status === filter) && (!search.trim() || p.name.toLowerCase().includes(search.trim().toLowerCase())));
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const openNew = () => { setForm(EMPTY); setError(""); setModal("new"); };
  const openEdit = (p) => {
    setForm({ name: p.name || "", description: p.description || "", priority: p.priority || "medium", start_date: p.start_date || "", due_date: p.due_date || "" });
    setError(""); setModal(p);
  };

  const save = async () => {
    setError("");
    if (!form.name.trim()) return setError("Please enter a project name.");
    if (form.start_date && form.due_date && form.due_date < form.start_date) return setError("Due date cannot be before the start date.");
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return setError("Please log in again."); }
    const values = { name: form.name.trim(), description: form.description.trim(), priority: form.priority, start_date: form.start_date || null, due_date: form.due_date || null };
    const { error: err } = modal === "new"
      ? await supabase.from("client_project_requests").insert({ ...values, status: "submitted", created_by: user.id })
      : await supabase.from("client_project_requests").update(values).eq("id", modal.id);
    setSaving(false);
    if (err) return setError(err.message);
    setModal(null);
    load();
  };

  const remove = async (p) => {
    if (!window.confirm(`Delete "${p.name}"? If it was accepted, its boards, tasks and team assignments are deleted too.`)) return;
    const { error: err } = await supabase.from("client_project_requests").delete().eq("id", p.id);
    if (err) return setError(err.message);
    load();
  };

  const first = (me?.full_name || "").split(" ")[0];

  return (
    <Page
      eyebrow="Client workspace"
      title={first ? `Welcome back, ${first}` : "My Projects"}
      subtitle="Submit new projects and follow where each one stands."
      actions={<button className={btnPrimary} onClick={openNew}><Plus size={17} /> New project</button>}
    >
      {!modal && <ErrorBox error={error} />}

      <section className="mb-8 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Tile icon={FolderKanban} label="Projects" value={stats.total} tone="text-blue-300 bg-blue-500/10" loading={loading} />
        <Tile icon={Send} label="Waiting for review" value={stats.waiting} tone="text-amber-300 bg-amber-500/10" loading={loading} />
        <Tile icon={CheckCircle2} label="Accepted / active" value={stats.active} tone="text-emerald-300 bg-emerald-500/10" loading={loading} />
        <Tile icon={Clock3} label="Due in 14 days" value={stats.soon} tone="text-rose-300 bg-rose-500/10" loading={loading} />
      </section>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1 rounded-lg bg-[#0D172A] p-1">
          {["all", ...statuses].map((s) => (
            <button key={s} onClick={() => setFilter(s)} className={`rounded-md px-3.5 py-1.5 text-sm capitalize ${filter === s ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"}`}>{s.replace(/_/g, " ")}</button>
          ))}
        </div>
        <div className="relative ml-auto w-full sm:w-64">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search projects" className={`${inputCls} !pl-9`} />
        </div>
      </div>

      {loading ? <Loading text="Loading projects..." /> : projects.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-700 bg-[#111C32] px-6 py-16 text-center">
          <FolderKanban size={40} className="mx-auto text-slate-500" />
          <p className="mt-4 text-lg font-semibold text-white">No projects yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-400">Describe your first project and our team will review it and get started.</p>
          <button className={`${btnPrimary} mt-6`} onClick={openNew}><Plus size={16} /> Submit your first project</button>
        </div>
      ) : shown.length === 0 ? (
        <p className="py-12 text-center text-sm text-slate-500">No project matches your filter.</p>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
          {shown.map((p) => {
            const n = daysUntil(p.due_date);
            const late = n !== null && n < 0;
            return (
              <article key={p.id} className="flex flex-col rounded-2xl border border-slate-700/70 bg-[#111C32] p-5 transition hover:border-blue-500/50">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="min-w-0 text-lg font-semibold leading-snug text-white">{p.name}</h3>
                  <Badge status={p.status} label={p.status?.replace(/_/g, " ")} />
                </div>
                <p className="mt-2 line-clamp-3 min-h-[3.75rem] text-sm text-slate-400">{p.description || "No description added."}</p>
                <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                  <span className="flex items-center gap-1.5 text-slate-300"><CalendarDays size={13} className="text-slate-500" />{p.start_date ? `${fmtDate(p.start_date)} → ` : ""}{fmtDate(p.due_date)}</span>
                  <span className={`rounded-full px-2.5 py-0.5 font-semibold ${late ? "bg-red-500/15 text-red-300" : n !== null && n <= 7 ? "bg-amber-500/15 text-amber-300" : "bg-slate-700/60 text-slate-300"}`}>{dueText(p.due_date)}</span>
                  <span className="ml-auto text-slate-400">Priority <Priority value={p.priority} /></span>
                </div>
                <div className="mt-5 flex gap-2 border-t border-slate-700/60 pt-4">
                  <button onClick={() => openEdit(p)} className={`${btnGhost} !px-3 !py-2 text-xs`}><Pencil size={13} /> Edit</button>
                  <button onClick={() => remove(p)} className="inline-flex items-center gap-2 rounded-lg border border-red-500/40 px-3 py-2 text-xs font-semibold text-red-300 hover:bg-red-500/10"><Trash2 size={13} /> Delete</button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {modal && (
        <Modal title={modal === "new" ? "Submit a new project" : "Edit project"} subtitle={modal === "new" ? "Our team reviews every submission." : "Changes are shared with the team working on it."} onClose={() => setModal(null)}
          footer={<><button className={btnGhost} onClick={() => setModal(null)}>Cancel</button><button className={btnPrimary} disabled={saving} onClick={save}>{saving ? "Saving..." : modal === "new" ? "Submit project" : "Save changes"}</button></>}>
          <ErrorBox error={error} />
          <Field label="Project name"><input autoFocus className={inputCls} value={form.name} onChange={set("name")} placeholder="e.g. Customer portal redesign" /></Field>
          <Field label="Description"><textarea rows={4} className={inputCls} value={form.description} onChange={set("description")} placeholder="What do you need built, and why?" /></Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Priority">
              <select className={inputCls} value={form.priority} onChange={set("priority")}>
                <option value="low">Low</option><option value="medium">Normal</option><option value="high">High</option><option value="urgent">Urgent</option>
              </select>
            </Field>
            <Field label="Start date"><input type="date" className={inputCls} value={form.start_date} onChange={set("start_date")} /></Field>
            <Field label="Due date"><input type="date" className={inputCls} value={form.due_date} onChange={set("due_date")} /></Field>
          </div>
        </Modal>
      )}
    </Page>
  );
}

function Tile({ icon: Icon, label, value, tone, loading }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-slate-700/70 bg-[#111C32] p-5">
      <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${tone}`}><Icon size={22} /></span>
      <div><p className="text-sm text-slate-400">{label}</p><p className="mt-0.5 text-3xl font-bold text-white">{loading ? "…" : value}</p></div>
    </div>
  );
}
