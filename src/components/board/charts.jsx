// Tiny dependency-free SVG / CSS charts used by the project dashboard.

export function Donut({ data, size = 170, center }) {
  const total = data.reduce((a, d) => a + d.value, 0);
  const r = size / 2 - 14;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Status chart">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1E2A44" strokeWidth="22" />
        {total > 0 && data.filter((d) => d.value > 0).map((d) => {
          const len = (d.value / total) * c;
          const el = <circle key={d.label} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={d.color} strokeWidth="22"
            strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset} transform={`rotate(-90 ${size / 2} ${size / 2})`} />;
          offset += len;
          return el;
        })}
        <text x="50%" y="48%" textAnchor="middle" className="fill-white text-3xl font-bold">{center ?? total}</text>
        <text x="50%" y="62%" textAnchor="middle" className="fill-slate-400 text-[11px]">tasks</text>
      </svg>
      <ul className="space-y-1.5 text-sm">
        {data.map((d) => (
          <li key={d.label} className="flex items-center gap-2 text-slate-300">
            <span className="h-3 w-3 rounded-sm" style={{ background: d.color }} /> {d.label} <strong className="ml-1 text-white">{d.value}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Horizontal bars. Each row: { label, value, max?, color?, note? }
export function HBars({ rows, unit = "", empty = "No data yet." }) {
  if (!rows.length) return <p className="text-sm text-slate-500">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.max ?? r.value), 1);
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="mb-1 flex justify-between text-xs text-slate-300">
            <span className="truncate">{r.label}</span>
            <span className="text-slate-400">{r.note ?? `${r.value}${unit}`}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-700">
            <div className="h-full rounded-full" style={{ width: `${Math.min((r.value / max) * 100, 100)}%`, background: r.color || "#3B82F6" }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

// Vertical columns. Each: { label, value, color? }
export function Columns({ rows, height = 150 }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="flex items-end gap-2" style={{ height: height + 28 }}>
      {rows.map((r) => (
        <div key={r.label} className="flex flex-1 flex-col items-center justify-end gap-1">
          <span className="text-[11px] text-slate-300">{r.value || ""}</span>
          <div className="w-full rounded-t-md" style={{ height: `${(r.value / max) * height}px`, minHeight: r.value ? 4 : 2, background: r.value ? r.color || "#3B82F6" : "#1E2A44" }} />
          <span className="whitespace-nowrap text-[10px] text-slate-500">{r.label}</span>
        </div>
      ))}
    </div>
  );
}
