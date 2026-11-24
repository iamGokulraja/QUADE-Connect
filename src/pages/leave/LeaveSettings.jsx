import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";

import { supabase } from "../../lib/supabaseClient";
import { rpc, useLeaveRules, useLeaveTypes, useRefreshLeave, useStaff } from "../../hooks/leave";
import { Card, ErrorBox, btnGhost, btnPrimary, inputCls } from "../../components/ui";

const REQUESTERS = [["employee", "Employee"], ["team_lead", "Team Lead"], ["project_manager", "Project Manager"], ["hr", "HR Employee"], ["hr_manager", "HR Manager"], ["admin", "Admin"]];
const APPROVERS = [["team_lead", "Assigned Team Lead"], ["project_manager", "Assigned Project Manager"], ["hr_manager", "HR Manager"], ["admin", "CEO / Admin"]];
const th = "px-4 py-3";
const head = "bg-[#17243D]/70 text-xs uppercase tracking-wider text-slate-400";

// Leave types and policies (HR + Admin); approval matrix, alternates and reporting overrides (Admin only).
export default function LeaveSettings({ me }) {
  const isAdmin = me.role === "admin";
  const refresh = useRefreshLeave();
  const [error, setError] = useState("");
  const run = async (fn) => {
    try { setError(""); const res = await fn(); if (res?.error) throw res.error; await refresh(); } catch (err) { setError(err.message); }
  };

  return (
    <div className="space-y-6">
      <ErrorBox error={error} />
      <Types run={run} />
      <Rules isAdmin={isAdmin} run={run} />
      {isAdmin && <Routing run={run} />}
      <Staff isAdmin={isAdmin} run={run} />
    </div>
  );
}

function Types({ run }) {
  const types = useLeaveTypes().data || [];
  const [draft, setDraft] = useState({ code: "", name: "", annual_limit: "" });
  const save = (t) => run(() => supabase.from("leave_types").update({ name: t.name, annual_limit: t.annual_limit === "" || t.annual_limit == null ? null : Number(t.annual_limit), is_paid: t.is_paid, is_active: t.is_active }).eq("id", t.id));
  const add = () => run(async () => {
    const res = await supabase.from("leave_types").insert({ code: draft.code.trim().toLowerCase().replace(/\s+/g, "_"), name: draft.name.trim(), annual_limit: draft.annual_limit === "" ? null : Number(draft.annual_limit) });
    if (!res.error) setDraft({ code: "", name: "", annual_limit: "" });
    return res;
  });
  return (
    <Card title="Leave types & policy" subtitle="Yearly limit empty = no limit and no balance tracking. Balances change only for types with a limit.">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px] text-left text-sm">
          <thead><tr className={head}><th className={th}>Name</th><th className={th}>Yearly limit (days)</th><th className={th}>Paid</th><th className={th}>Active</th><th className={th} /></tr></thead>
          <tbody className="divide-y divide-slate-700/50">{types.map((t) => <TypeRow key={t.id} t={t} onSave={save} />)}</tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-2 border-t border-slate-700/70 p-4">
        <input className={`${inputCls} w-auto`} placeholder="Code (e.g. maternity)" value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} />
        <input className={`${inputCls} w-auto`} placeholder="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        <input type="number" className={`${inputCls} w-32`} placeholder="Limit" value={draft.annual_limit} onChange={(e) => setDraft({ ...draft, annual_limit: e.target.value })} />
        <button className={btnPrimary} disabled={!draft.code || !draft.name} onClick={add}><Plus size={15} /> Add type</button>
      </div>
    </Card>
  );
}

function TypeRow({ t, onSave }) {
  const [v, setV] = useState(t);
  const set = (k) => (e) => setV({ ...v, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  return (
    <tr>
      <td className="px-4 py-2"><input className={inputCls} value={v.name} onChange={set("name")} /></td>
      <td className="px-4 py-2"><input type="number" className={`${inputCls} w-32`} value={v.annual_limit ?? ""} onChange={set("annual_limit")} /></td>
      <td className="px-4 py-2"><input type="checkbox" checked={v.is_paid} onChange={set("is_paid")} /></td>
      <td className="px-4 py-2"><input type="checkbox" checked={v.is_active} onChange={set("is_active")} /></td>
      <td className="px-4 py-2"><button className={`${btnGhost} !px-3 !py-1.5`} onClick={() => onSave(v)}>Save</button></td>
    </tr>
  );
}

function Rules({ isAdmin, run }) {
  const rules = useLeaveRules().data || [];
  const update = (requester, patch) => run(() => supabase.from("leave_approval_rules").update(patch).eq("requester_role", requester));
  return (
    <Card title="Approval matrix" subtitle={isAdmin ? "Who approves leave for each role. The fallback is used when the first choice does not exist." : "Read only. Only Admin can change the approval hierarchy."}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead><tr className={head}><th className={th}>Requester</th><th className={th}>Approver</th><th className={th}>Fallback</th><th className={th}>Active</th></tr></thead>
          <tbody className="divide-y divide-slate-700/50">
            {REQUESTERS.map(([key, label]) => {
              const r = rules.find((x) => x.requester_role === key);
              if (!r) return null;
              return (
                <tr key={key}>
                  <td className="px-4 py-2 text-white">{label}</td>
                  <td className="px-4 py-2"><select disabled={!isAdmin} className={inputCls} value={r.approver_role} onChange={(e) => update(key, { approver_role: e.target.value })}>{APPROVERS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></td>
                  <td className="px-4 py-2"><select disabled={!isAdmin} className={inputCls} value={r.fallback_role || ""} onChange={(e) => update(key, { fallback_role: e.target.value || null })}><option value="">None</option>{APPROVERS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></td>
                  <td className="px-4 py-2"><input type="checkbox" disabled={!isAdmin} checked={r.is_active} onChange={(e) => update(key, { is_active: e.target.checked })} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function PairEditor({ title, subtitle, table, aKey, bKey, aLabel, bLabel, run }) {
  const staff = (useStaff().data || []).filter((p) => p.is_active && p.role !== "client");
  const rows = useQuery({
    queryKey: ["leave-" + table],
    queryFn: async () => { const { data, error } = await supabase.from(table).select("*"); if (error) throw error; return data || []; },
  }).data || [];
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const name = (id) => staff.find((p) => p.id === id)?.full_name || staff.find((p) => p.id === id)?.email || "Unknown";
  const options = (
    <>
      <option value="">Select...</option>
      {staff.map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email} ({p.role.replace("_", " ")})</option>)}
    </>
  );
  return (
    <Card title={title} subtitle={subtitle}>
      <ul className="divide-y divide-slate-700/50 text-sm">
        {rows.map((r) => (
          <li key={r[aKey]} className="flex items-center justify-between gap-3 px-5 py-3">
            <span className="text-slate-200">{name(r[aKey])} <span className="text-slate-500">→</span> {name(r[bKey])}</span>
            <button aria-label="Remove" className={`${btnGhost} !px-3 !py-1.5 text-red-400`} onClick={() => run(() => supabase.from(table).delete().eq(aKey, r[aKey]))}><Trash2 size={14} /></button>
          </li>
        ))}
        {rows.length === 0 && <li className="px-5 py-3 text-slate-500">None configured.</li>}
      </ul>
      <div className="flex flex-wrap gap-2 border-t border-slate-700/70 p-4">
        <select className={`${inputCls} w-auto`} value={a} onChange={(e) => setA(e.target.value)} aria-label={aLabel}>{options}</select>
        <select className={`${inputCls} w-auto`} value={b} onChange={(e) => setB(e.target.value)} aria-label={bLabel}>{options}</select>
        <button className={btnPrimary} disabled={!a || !b || a === b} onClick={() => run(async () => {
          const res = await supabase.from(table).upsert({ [aKey]: a, [bKey]: b });
          if (!res.error) { setA(""); setB(""); }
          return res;
        })}><Plus size={15} /> Save</button>
      </div>
    </Card>
  );
}

function Routing({ run }) {
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <PairEditor title="Alternate approvers" subtitle="If the first person is away or inactive, requests go to the alternate. Left: approver, right: alternate." table="leave_alternates" aKey="approver_id" bKey="alternate_id" aLabel="Approver" bLabel="Alternate" run={run} />
      <PairEditor title="Reporting manager overrides" subtitle="Force a specific approver for one person. Left: employee, right: approver." table="leave_approver_overrides" aKey="employee_id" bKey="approver_id" aLabel="Employee" bLabel="Approver" run={run} />
    </div>
  );
}

function Staff({ isAdmin, run }) {
  const staff = (useStaff().data || []).filter((p) => p.role !== "client");
  return (
    <Card title="Staff details" subtitle="Shown on the leave form. Marking an HR user as HR Manager (Admin only) makes them the approver for HR staff and Project Managers.">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead><tr className={head}><th className={th}>Name</th><th className={th}>Role</th><th className={th}>Employee ID</th><th className={th}>Department</th><th className={th}>Designation</th><th className={th}>HR Manager</th><th className={th} /></tr></thead>
          <tbody className="divide-y divide-slate-700/50">{staff.map((p) => <StaffRow key={p.id} p={p} isAdmin={isAdmin} run={run} />)}</tbody>
        </table>
      </div>
    </Card>
  );
}

function StaffRow({ p, isAdmin, run }) {
  const [v, setV] = useState({ code: p.employee_code || "", dept: p.department || "", desig: p.designation || "", hrm: !!p.is_hr_manager });
  return (
    <tr>
      <td className="px-4 py-2 text-white">{p.full_name || p.email}</td>
      <td className="px-4 py-2 capitalize text-slate-400">{p.role.replace("_", " ")}</td>
      <td className="px-4 py-2"><input className={`${inputCls} w-28`} value={v.code} onChange={(e) => setV({ ...v, code: e.target.value })} /></td>
      <td className="px-4 py-2"><input className={`${inputCls} w-36`} value={v.dept} onChange={(e) => setV({ ...v, dept: e.target.value })} /></td>
      <td className="px-4 py-2"><input className={`${inputCls} w-36`} value={v.desig} onChange={(e) => setV({ ...v, desig: e.target.value })} /></td>
      <td className="px-4 py-2">{p.role === "hr" ? <input type="checkbox" disabled={!isAdmin} checked={v.hrm} onChange={(e) => setV({ ...v, hrm: e.target.checked })} /> : "—"}</td>
      <td className="px-4 py-2"><button className={`${btnGhost} !px-3 !py-1.5`} onClick={() => run(() => rpc("leave_set_profile_info", { target: p.id, p_code: v.code, p_dept: v.dept, p_designation: v.desig, p_hr_manager: v.hrm }))}>Save</button></td>
    </tr>
  );
}
