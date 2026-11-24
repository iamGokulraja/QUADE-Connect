import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabaseClient";
import { fmtHours } from "../lib/utils";
import { Card, Empty, StatCard, StatGrid } from "./ui";

// Organisation-wide progress for Admin. Comes from a database function that returns totals only:
// no personal boards and no individual employee task details.
export default function AdminRollup() {
  const { data, error, isLoading } = useQuery({
    queryKey: ["admin-progress"],
    refetchInterval: 60000,
    retry: false,
    queryFn: async () => {
      const { data: res, error: err } = await supabase.rpc("qc_admin_progress");
      if (err) throw err;
      return res;
    },
  });
  if (error) return null; // migration not installed yet
  const p = data?.projects || {};
  const t = data?.tasks || {};

  return (
    <div className="mb-7">
      <StatGrid>
        <StatCard label="Active projects" value={p.active} loading={isLoading} tone="blue" />
        <StatCard label="In progress" value={p.in_progress} loading={isLoading} tone="slate" />
        <StatCard label="Completed projects" value={p.completed} loading={isLoading} tone="green" />
        <StatCard label="Delayed projects" value={p.delayed} loading={isLoading} tone="red" />
        <StatCard label="Tasks done" value={`${t.completed || 0}/${t.total || 0}`} loading={isLoading} tone="green" />
        <StatCard label="Hours worked / planned" value={`${fmtHours(t.actual_hours)} / ${fmtHours(t.estimated_hours)}`} loading={isLoading} tone="amber" />
      </StatGrid>
      <Card title="Project Manager workload" subtitle="Aggregated across each manager's projects.">
        {!data?.by_manager?.length ? <Empty title="No project managers with projects yet" /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="bg-[#17243D]/70 text-xs uppercase tracking-wider text-slate-400">
                  <th className="px-5 py-3">Project Manager</th><th className="px-5 py-3">Projects</th><th className="px-5 py-3">Tasks</th><th className="px-5 py-3">Completed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {data.by_manager.map((m) => (
                  <tr key={m.id || "none"}>
                    <td className="px-5 py-3 font-medium text-white">{m.name || "Unassigned"}</td>
                    <td className="px-5 py-3 text-slate-300">{m.projects}</td>
                    <td className="px-5 py-3 text-slate-300">{m.tasks}</td>
                    <td className="px-5 py-3 text-slate-300">{m.completed}</td>
                    
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
