import { LoaderCircle, AlertCircle, X } from "lucide-react";
import { STATUS_STYLE, PRIORITY_STYLE, statusLabel, priorityLabel } from "../lib/constants";
import { label } from "../lib/utils";

export const inputCls =
  "w-full rounded-xl border border-slate-700 bg-[#0D172A] px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-500 focus:border-blue-500 disabled:opacity-60";

export const btnPrimary =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50";

export const btnGhost =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-600 px-4 py-2.5 text-sm font-semibold text-slate-300 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50";

export function Page({ eyebrow, title, subtitle, actions, children }) {
  return (
    <div className="min-h-screen bg-[#0B1120] p-5 text-slate-100 md:p-8">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          {eyebrow && (
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.25em] text-blue-400">
              {eyebrow}
            </p>
          )}
          <h1 className="text-3xl font-bold text-white">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-slate-400">{subtitle}</p>}
        </div>
        {actions}
      </header>
      {children}
    </div>
  );
}

export function Card({ title, subtitle, actions, children, className = "" }) {
  return (
    <section
      className={`overflow-hidden rounded-2xl border border-slate-700/70 bg-[#111C32] ${className}`}
    >
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700/70 p-5">
          <div>
            <h2 className="text-lg font-semibold text-white">{title}</h2>
            {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

const TONES = {
  blue: "border-blue-500/20",
  green: "border-emerald-500/20",
  amber: "border-amber-500/20",
  red: "border-red-500/20",
  slate: "border-slate-700/70",
};

export function StatCard({ label: text, value, hint, tone = "blue", loading }) {
  return (
    <div className={`rounded-2xl border bg-[#111C32] p-5 ${TONES[tone]}`}>
      <p className="text-sm text-slate-400">{text}</p>
      <h2 className="mt-3 text-3xl font-bold text-white">{loading ? "..." : value}</h2>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function StatGrid({ children }) {
  return (
    <section className="mb-7 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
      {children}
    </section>
  );
}

export function Badge({ status, label: text }) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium capitalize ${
        STATUS_STYLE[status] || STATUS_STYLE.planned
      }`}
    >
      {text || statusLabel(status) || label(status) || "not set"}
    </span>
  );
}

export const Priority = ({ value }) => (
  <span className={`font-medium ${PRIORITY_STYLE[value] || PRIORITY_STYLE.medium}`}>
    {priorityLabel(value)}
  </span>
);

export function Loading({ text = "Loading..." }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-slate-400">
      <LoaderCircle size={20} className="animate-spin" />
      {text}
    </div>
  );
}

export function Empty({ icon: Icon, title, text }) {
  return (
    <div className="px-5 py-14 text-center">
      {Icon && <Icon size={32} className="mx-auto text-slate-500" />}
      <p className="mt-4 font-medium text-slate-300">{title}</p>
      {text && <p className="mt-2 text-xs text-slate-500">{text}</p>}
    </div>
  );
}

export function ErrorBox({ error }) {
  if (!error) return null;
  return (
    <div className="mb-5 flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
      <AlertCircle size={18} className="mt-0.5 shrink-0" />
      {typeof error === "string" ? error : error.message}
    </div>
  );
}

export function Modal({ title, subtitle, onClose, children, footer, wide }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/70 p-4">
      <div
        className={`my-6 w-full overflow-hidden rounded-2xl border border-slate-700 bg-[#111C32] shadow-2xl ${
          wide ? "max-w-3xl" : "max-w-xl"
        }`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-700 p-5">
          <div className="min-w-0">
            <h2 className="truncate text-xl font-bold text-white">{title}</h2>
            {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-700 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>
        <div className="space-y-4 p-5">{children}</div>
        {footer && (
          <div className="flex justify-end gap-3 border-t border-slate-700 bg-[#0D172A] p-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export const Field = ({ label: text, children }) => (
  <label className="block text-sm">
    <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
      {text}
    </span>
    {children}
  </label>
);
