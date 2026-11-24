import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Send } from "lucide-react";

import { supabase } from "../../lib/supabaseClient";
import { fmtDate, todayStr } from "../../lib/utils";
import { rpc, useLeaveBalances, useLeaveTypes, useRefreshLeave, useStaff } from "../../hooks/leave";
import { ErrorBox, Field, Modal, btnGhost, btnPrimary, inputCls } from "../../components/ui";

const MAX_FILE = 5 * 1024 * 1024;

export default function ApplyLeaveModal({ me, onClose }) {
  const refresh = useRefreshLeave();
  const types = (useLeaveTypes().data || []).filter((t) => t.is_active);
  const balances = useLeaveBalances().data || [];
  const mine = (useStaff().data || []).find((p) => p.id === me.id);
  const approver = useQuery({ queryKey: ["leave-approver-preview"], queryFn: () => rpc("leave_preview_approver") });

  const [form, setForm] = useState({ type: "", start: todayStr(), end: todayStr(), reason: "" });
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const type = types.find((t) => t.id === form.type) || types[0];
  const days = form.end >= form.start ? Math.round((new Date(form.end) - new Date(form.start)) / 864e5) + 1 : 0;
  const year = Number(form.start.slice(0, 4));
  const bal = type?.annual_limit == null ? null : balances.find((b) => b.leave_type_id === type.id && b.year === year);
  const remaining = type?.annual_limit == null ? null : bal ? Number(bal.remaining_days) : Number(type.annual_limit);

  const submit = async () => {
    setError("");
    if (!type) return setError("No leave types are available. Contact HR.");
    if (!days) return setError("The end date cannot be before the start date.");
    if (!form.reason.trim()) return setError("Please enter a reason.");
    if (file && file.size > MAX_FILE) return setError("The document must be smaller than 5 MB.");
    setBusy(true);
    try {
      let path = null;
      if (file) {
        path = `${me.id}/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
        const { error: upErr } = await supabase.storage.from("leave-documents").upload(path, file);
        if (upErr) throw upErr;
      }
      const { error: err } = await supabase.from("leave_requests").insert({
        employee_id: me.id,
        leave_type: type.code,
        leave_type_id: type.id,
        start_date: form.start,
        end_date: form.end,
        reason: form.reason.trim(),
        attachment_url: path,
      });
      if (err) throw err;
      await refresh();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const info = [
    ["Employee", me.full_name || me.email],
    ["Employee ID", mine?.employee_code || "Not set"],
    ["Department", mine?.department || "Not set"],
    ["Designation", mine?.designation || "Not set"],
    ["Approver", approver.data || (approver.isLoading ? "..." : "Not configured")],
  ];

  return (
    <Modal
      title="Apply for leave"
      subtitle="Your request goes automatically to your approver."
      onClose={onClose}
      footer={
        <>
          <button className={btnGhost} onClick={onClose}>Cancel</button>
          <button className={btnPrimary} onClick={submit} disabled={busy || approver.data === null}>
            <Send size={15} /> {busy ? "Submitting..." : "Submit request"}
          </button>
        </>
      }
    >
      <ErrorBox error={error} />
      {approver.data === null && (
        <ErrorBox error="No approver is configured for your role yet. Please contact Admin." />
      )}
      <dl className="grid grid-cols-2 gap-3 rounded-xl bg-[#17243D] p-4 text-sm">
        {info.map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs text-slate-400">{k}</dt>
            <dd className="text-white">{v}</dd>
          </div>
        ))}
      </dl>

      <Field label="Leave type">
        <select className={inputCls} value={type?.id || ""} onChange={set("type")}>
          {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </Field>
      {remaining !== null && (
        <p className="-mt-2 text-xs text-slate-400">{remaining} day(s) remaining in {year}.</p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="From"><input type="date" className={inputCls} value={form.start} onChange={set("start")} /></Field>
        <Field label="To"><input type="date" className={inputCls} value={form.end} min={form.start} onChange={set("end")} /></Field>
      </div>
      <p className="-mt-2 text-sm text-slate-300">
        Number of days: <strong className="text-white">{days}</strong>
        {days > 0 && <span className="text-slate-500"> ({fmtDate(form.start)} – {fmtDate(form.end)})</span>}
      </p>
      <Field label="Reason"><textarea rows={3} className={inputCls} value={form.reason} onChange={set("reason")} /></Field>
      <Field label="Supporting document (optional, max 5 MB)">
        <input type="file" className={inputCls} accept=".pdf,.png,.jpg,.jpeg,.doc,.docx" onChange={(e) => setFile(e.target.files[0] || null)} />
      </Field>
    </Modal>
  );
}
