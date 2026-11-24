import { useEffect, useRef, useState } from "react";
import { CalendarCheck, CheckCircle2, Download, FileArchive, GraduationCap, Info, Loader, Plane, User, Users, X } from "lucide-react";

import { supabase } from "../../lib/supabaseClient";
import { downloadBlob, downloadCsv, makeZip, toCsv } from "../../lib/csv";
import { todayStr } from "../../lib/utils";
import { ErrorBox, Page } from "../../components/ui";

const ymd = (y, m, d) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const monthName = (y, m) => new Date(y, m, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });

// This month (1st -> today), last month, 2 and 3 months ago (full months), plus "Last 3 months + this month so far".
function periods() {
  const [y, m, d] = todayStr().split("-").map(Number);
  const list = [{ key: "this", label: "This month so far", sub: monthName(y, m - 1), from: ymd(y, m - 1, 1), to: ymd(y, m - 1, d), tag: `${y}-${String(m).padStart(2, "0")}-to-date` }];
  for (let i = 1; i <= 3; i += 1) {
    const first = new Date(y, m - 1 - i, 1);
    const last = new Date(y, m - i, 0);
    list.push({
      key: `m${i}`, label: i === 1 ? "Last month" : monthName(first.getFullYear(), first.getMonth()), sub: i === 1 ? monthName(first.getFullYear(), first.getMonth()) : "",
      from: ymd(first.getFullYear(), first.getMonth(), 1), to: ymd(last.getFullYear(), last.getMonth(), last.getDate()),
      tag: `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, "0")}`,
    });
  }
  const start = new Date(y, m - 4, 1);
  list.push({ key: "all", label: "Last 3 months", sub: "+ this month so far", from: ymd(start.getFullYear(), start.getMonth(), 1), to: ymd(y, m - 1, d), tag: "last-3-months-and-this-month" });
  return list;
}

const ATTENDANCE = [
  { header: "Employee Code", key: "employee_code" }, { header: "Name", key: "full_name" }, { header: "Role", value: (r) => (r.role || "").replace(/_/g, " ") },
  { header: "Department", key: "department" }, { header: "Date", key: "attendance_date" }, { header: "Day", key: "day_name" },
  { header: "Check-in", key: "check_in_time" }, { header: "Check-in location", key: "check_in_location" },
  { header: "Check-out", key: "check_out_time" }, { header: "Check-out location", key: "check_out_location" },
  { header: "Hours inside", value: (r) => (r.hours_inside == null ? "" : r.hours_inside) },
  { header: "Status", key: "status" }, { header: "Check-in map link", key: "check_in_map" }, { header: "Check-out map link", key: "check_out_map" },
];
const GRADES = [
  { header: "Employee Code", key: "employee_code" }, { header: "Name", key: "full_name" }, { header: "Role", value: (r) => (r.role || "").replace(/_/g, " ") },
  { header: "Department", key: "department" }, { header: "Month", value: (r) => String(r.grade_month).slice(0, 7) },
  { header: "Grade", value: (r) => r.grade || "Not graded" }, { header: "Remarks", key: "remarks" },
  { header: "Graded by", key: "graded_by" }, { header: "Graded on", key: "graded_on" },
];
const LEAVES = [
  { header: "Employee Code", key: "employee_code" }, { header: "Name", key: "full_name" }, { header: "Role", value: (r) => (r.role || "").replace(/_/g, " ") },
  { header: "Department", key: "department" }, { header: "Leave type", key: "leave_type" }, { header: "From", key: "start_date" }, { header: "To", key: "end_date" },
  { header: "Days in this period", key: "days_in_period" }, { header: "Total days of leave", key: "total_days" },
  { header: "Status", key: "status" }, { header: "Reason", key: "reason" }, { header: "Applied on", key: "applied_on" }, { header: "Approved by", key: "approver" },
];

const SHEET_COLS = [
  { header: "Date", key: "attendance_date" }, { header: "Day", key: "day_name" }, { header: "Check-in", key: "check_in_time" },
  { header: "Check-in location", key: "check_in_location" }, { header: "Check-out", key: "check_out_time" }, { header: "Check-out location", key: "check_out_location" }, { header: "Hours inside", value: (r) => (r.hours_inside == null ? "" : r.hours_inside) },
  { header: "Status", key: "status" }, { header: "Remarks", key: "remarks" },
];
const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

// One person's sheet: details on top, every day of the period, totals at the bottom.
function sheetCsv(rows, periodLabel) {
  const f = rows[0];
  const count = (st) => rows.filter((r) => r.status === st).length;
  const worked = rows.filter((r) => r.hours_inside != null);
  const total = worked.reduce((n, r) => n + Number(r.hours_inside), 0);
  const top = [["Name", f.full_name], ["Employee Code", f.employee_code], ["Role", (f.role || "").replace(/_/g, " ")], ["Department", f.department], ["Period", periodLabel]]
    .map(([k, v]) => `${q(k)},${q(v)}`);
  const sum = [["Present", count("Present")], ["Late", count("Late")], ["Absent", count("Absent")], ["Leave", count("Leave")], ["Weekly off", count("Weekly off")],
    ["Total hours inside", Math.round(total * 100) / 100], ["Average hours per day worked", worked.length ? Math.round((total / worked.length) * 100) / 100 : 0]]
    .map(([k, v]) => `${q(k)},${q(v)}`);
  const table = toCsv(SHEET_COLS, rows).replace(/^\uFEFF/, "").trimEnd();
  return `\uFEFF${[...top, "", table, "", "SUMMARY", ...sum].join("\r\n")}\r\n`;
}
const fileSafe = (n) => String(n || "employee").replace(/[^\w.\- ]+/g, "").trim().replace(/\s+/g, "_") || "employee";

const chip = (on) =>
  `rounded-xl border px-4 py-2.5 text-left text-sm transition ${on ? "border-blue-500 bg-blue-600/20 text-white shadow-inner shadow-blue-500/10" : "border-slate-700 bg-[#0D172A] text-slate-300 hover:border-slate-500 hover:text-white"}`;
const dlBtn = "flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50";
const selectCls = "w-full rounded-xl border border-slate-700 bg-[#0D172A] px-3 py-3 text-sm text-white outline-none focus:border-blue-500 disabled:opacity-50";

function PeriodChips({ items, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-2.5" role="radiogroup" aria-label="Period">
      {items.map((p) => (
        <button key={p.key} type="button" role="radio" aria-checked={value === p.key} onClick={() => onChange(p.key)} className={chip(value === p.key)}>
          <span className="block font-semibold">{p.label}</span>
          {p.sub ? <span className="block text-xs text-slate-400">{p.sub}</span> : null}
        </button>
      ))}
    </div>
  );
}

const Section = ({ title, subtitle, children }) => (
  <section className="rounded-2xl border border-slate-700/70 bg-[#111C32]">
    <div className="border-b border-slate-700/70 px-5 py-4">
      <h2 className="text-base font-semibold text-white">{title}</h2>
      {subtitle ? <p className="mt-1 text-sm text-slate-400">{subtitle}</p> : null}
    </div>
    <div className="p-5">{children}</div>
  </section>
);

export default function HrReports() {
  const list = periods();
  const [key, setKey] = useState("m1");
  const [leaveStatus, setLeaveStatus] = useState("approved");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState(null);
  const [note, setNote] = useState(null);                 // { ok: boolean, text }
  const period = list.find((p) => p.key === key);

  // Only the three "Download CSV" buttons call this. Changing a month or opening a list never downloads anything.
  async function run(kind, fn, args, columns, name) {
    setBusy(kind); setError(null); setNote(null);
    try {
      const { data, error: e } = await supabase.rpc(fn, args);
      if (e) throw e;
      const rows = data || [];
      if (!rows.length) { setNote({ ok: false, text: "No records found for this period, so no file was created." }); return; }
      downloadCsv(`${name}-${period.tag}.csv`, toCsv(columns, rows));
      setNote({ ok: true, text: `Downloaded ${rows.length} row${rows.length === 1 ? "" : "s"}.` });
    } catch (err) { setError(err); } finally { setBusy(""); }
  }
  const range = { p_from: period.from, p_to: period.to };

  /* ---- individual sheets ---- */
  const monthsOnly = list.filter((p) => p.key !== "all");
  const [sheetKey, setSheetKey] = useState("m1");
  const [who, setWho] = useState("");
  const [loaded, setLoaded] = useState({ key: "", people: [], loading: true });
  const cache = useRef({});                                // month key -> [{ id, name, rows }] so a download never re-fetches
  const sheetPeriod = list.find((p) => p.key === sheetKey);

  async function getSheets(k) {
    if (cache.current[k]) return cache.current[k];
    const per = list.find((p) => p.key === k);
    const { data, error: e } = await supabase.rpc("hr_report_attendance_sheets", { p_from: per.from, p_to: per.to });
    if (e) throw e;
    const map = new Map();
    (data || []).forEach((r) => { if (!map.has(r.employee_id)) map.set(r.employee_id, { id: r.employee_id, name: r.full_name, rows: [] }); map.get(r.employee_id).rows.push(r); });
    cache.current[k] = [...map.values()].sort((a, b) => String(a.name).localeCompare(String(b.name)));
    return cache.current[k];
  }

  // The names in the list load by themselves when the page opens or the month changes. Nothing is downloaded here.
  useEffect(() => {
    let alive = true;
    setLoaded((l) => ({ ...l, loading: true }));
    getSheets(sheetKey)
      .then((all) => { if (alive) setLoaded({ key: sheetKey, people: all.map(({ id, name }) => ({ id, name })), loading: false }); })
      .catch((err) => { if (alive) { setError(err); setLoaded({ key: sheetKey, people: [], loading: false }); } });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetKey]);

  async function download(kind) {
    setBusy(kind); setError(null); setNote(null);
    try {
      const all = await getSheets(sheetKey);
      if (!all.length) { setNote({ ok: false, text: "No active staff found for this month." }); return; }
      const label = `${sheetPeriod.from} to ${sheetPeriod.to}`;
      if (kind === "one") {
        const p = all.find((x) => x.id === who);
        if (!p) { setNote({ ok: false, text: "Choose an employee first." }); return; }
        downloadCsv(`attendance-${fileSafe(p.name)}-${sheetPeriod.tag}.csv`, sheetCsv(p.rows, label));
        setNote({ ok: true, text: `Downloaded ${p.name}'s sheet (${p.rows.length} days).` });
      } else {
        const used = new Set();
        const files = all.map((p) => {
          let base = `${fileSafe(p.name)}-attendance-${sheetPeriod.tag}`;
          if (used.has(base)) base += `-${p.id.slice(0, 4)}`;
          used.add(base);
          return { name: `${base}.csv`, text: sheetCsv(p.rows, label) };
        });
        downloadBlob(`attendance-sheets-${sheetPeriod.tag}.zip`, makeZip(files));
        setNote({ ok: true, text: `Downloaded ${files.length} individual sheets in one ZIP file.` });
      }
    } catch (err) { setError(err); } finally { setBusy(""); }
  }

  const reports = [
    { id: "att", icon: CalendarCheck, tone: "bg-sky-500/15 text-sky-300", title: "Attendance", text: "Every employee, every day: date, check-in, check-out, locations and hours inside.",
      go: () => run("att", "hr_report_attendance", range, ATTENDANCE, "attendance") },
    { id: "grd", icon: GraduationCap, tone: "bg-violet-500/15 text-violet-300", title: "QC grades", text: "Monthly grade and remarks of every Employee and Team Lead in the period.",
      go: () => run("grd", "hr_report_grades", range, GRADES, "qc-grades") },
    { id: "lev", icon: Plane, tone: "bg-emerald-500/15 text-emerald-300", title: "Leave takers", text: "Who took leave: type, dates, days and reason.",
      go: () => run("lev", "hr_report_leaves", { ...range, p_status: leaveStatus }, LEAVES, leaveStatus === "all" ? "leaves-all-requests" : "leaves") },
  ];
  const ready = !loaded.loading && loaded.key === sheetKey;

  return (
    <Page eyebrow="HR Operations" title="HR Reports" subtitle="Download attendance, QC grades and leave records as CSV files that open in Excel or Google Sheets.">
      <ErrorBox error={error} />
      {note && (
        <div role="status" className={`mb-5 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${note.ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-amber-500/30 bg-amber-500/10 text-amber-200"}`}>
          {note.ok ? <CheckCircle2 size={18} className="mt-0.5 shrink-0" /> : <Info size={18} className="mt-0.5 shrink-0" />}
          <span className="flex-1">{note.text}</span>
          <button type="button" onClick={() => setNote(null)} aria-label="Dismiss" className="text-current opacity-70 hover:opacity-100"><X size={16} /></button>
        </div>
      )}

      <div className="space-y-6">
        <Section title="1 · Period reports" subtitle={`Choose a period, then download. Selected: ${period.from} to ${period.to}`}>
          <PeriodChips items={list} value={key} onChange={setKey} />
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {reports.map((b) => (
              <div key={b.id} className="flex flex-col rounded-2xl border border-slate-700/70 bg-[#0D172A] p-5">
                <span className={`grid h-11 w-11 place-items-center rounded-xl ${b.tone}`}><b.icon size={22} /></span>
                <h3 className="mt-4 text-base font-semibold text-white">{b.title}</h3>
                <p className="mt-1 flex-1 text-sm text-slate-400">{b.text}</p>
                {b.id === "lev" && (
                  <label className="mt-3 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Include
                    <select value={leaveStatus} onChange={(e) => setLeaveStatus(e.target.value)} className={`${selectCls} mt-1.5 !py-2.5 font-normal normal-case tracking-normal`}>
                      <option value="approved">Approved leave only</option>
                      <option value="all">All requests (pending, rejected too)</option>
                    </select>
                  </label>
                )}
                <button type="button" className={`${dlBtn} mt-4`} disabled={!!busy} onClick={b.go}>
                  {busy === b.id ? <Loader size={16} className="animate-spin" /> : <Download size={16} />} {busy === b.id ? "Preparing..." : "Download CSV"}
                </button>
              </div>
            ))}
          </div>
        </Section>

        <Section title="2 · Individual attendance sheets" subtitle="One sheet per employee: every day of the month with check-in, check-out, hours inside and status (Present / Late / Absent / Leave / Weekly off), and a summary at the bottom. Sunday is the weekly off.">
          <PeriodChips items={monthsOnly} value={sheetKey} onChange={(k) => { setSheetKey(k); setWho(""); }} />
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="flex flex-col rounded-2xl border border-slate-700/70 bg-[#0D172A] p-5">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-blue-500/15 text-blue-300"><Users size={22} /></span>
              <h3 className="mt-4 text-base font-semibold text-white">Everyone</h3>
              <p className="mt-1 flex-1 text-sm text-slate-400">
                {ready ? `${loaded.people.length} sheet${loaded.people.length === 1 ? "" : "s"} for ${sheetPeriod.sub || sheetPeriod.label}, packed in one ZIP file.` : "Loading the list..."}
              </p>
              <button type="button" className={`${dlBtn} mt-4`} disabled={!!busy || !ready || !loaded.people.length} onClick={() => download("zip")}>
                {busy === "zip" ? <Loader size={16} className="animate-spin" /> : <FileArchive size={16} />} {busy === "zip" ? "Preparing..." : "Download all (ZIP)"}
              </button>
            </div>
            <div className="flex flex-col rounded-2xl border border-slate-700/70 bg-[#0D172A] p-5">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-amber-500/15 text-amber-300"><User size={22} /></span>
              <h3 className="mt-4 text-base font-semibold text-white">One person</h3>
              <label className="mt-1 block flex-1">
                <span className="mb-1.5 block text-sm text-slate-400">Choose a person, then download only their sheet.</span>
                <select value={who} onChange={(e) => setWho(e.target.value)} disabled={!ready || !loaded.people.length} className={selectCls}>
                  <option value="">{!ready ? "Loading employees..." : loaded.people.length ? "Choose employee..." : "No staff found"}</option>
                  {loaded.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              <button type="button" className={`${dlBtn} mt-4`} disabled={!!busy || !who} onClick={() => download("one")}>
                {busy === "one" ? <Loader size={16} className="animate-spin" /> : <Download size={16} />} {busy === "one" ? "Preparing..." : "Download sheet"}
              </button>
            </div>
          </div>
        </Section>
      </div>
    </Page>
  );
}
