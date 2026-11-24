import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, LogIn, LogOut, MapPin } from "lucide-react";

import { supabase } from "../../lib/supabaseClient";
import { LATE_AFTER, REQUIRE_LOCATION } from "../../lib/constants";
import { currentLocation, mapUrl } from "../../lib/location";
import { fmtDate, fmtTime, todayStr } from "../../lib/utils";
import { useMe } from "../../hooks/queries";
import { Badge, Card, Empty, ErrorBox, Loading, Page, StatCard, btnPrimary } from "../../components/ui";

// City / town name with a red map pin. Click opens the exact point on the map. Old records have no location.
export function Place({ text, lat, lng }) {
  if (!text) return <span className="text-slate-500">—</span>;
  const url = mapUrl(lat, lng);
  const pin = (
    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-red-500/15 ring-1 ring-red-500/40 transition group-hover:bg-red-500/30">
      <MapPin size={14} className="fill-red-500 text-red-500" strokeWidth={1.75} />
    </span>
  );
  const name = <span className="font-medium text-slate-200 group-hover:text-white group-hover:underline">{text}</span>;
  return url
    ? <a href={url} target="_blank" rel="noopener noreferrer" title={`${text} - open on map`} className="group inline-flex max-w-[220px] items-center gap-2 text-sm">{pin}{name}</a>
    : <span title={text} className="group inline-flex max-w-[220px] items-center gap-2 text-sm">{pin}{name}</span>;
}

// Check-in / check-out and personal attendance history (Employee, Team Lead, Project Manager).
export default function Attendance() {
  const { data: me } = useMe();
  const queryClient = useQueryClient();
  const [error, setError] = useState("");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["attendance", me.id],
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from("attendance")
        .select("*")
        .eq("employee_id", me.id)
        .order("attendance_date", { ascending: false })
        .limit(62);
      if (err) throw err;
      return data || [];
    },
  });

  const today = rows.find((r) => r.attendance_date === todayStr());

  const punch = useMutation({
    mutationFn: async () => {
      const now = new Date();   // the moment of the click (finding the location can take a few seconds)
      let where = { location: null, lat: null, lng: null };
      try { where = await currentLocation(); } catch (e) { if (REQUIRE_LOCATION) throw e; }
      if (!today) {
        const [h, m] = LATE_AFTER.split(":").map(Number);
        const t = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
          .formatToParts(now).map((x) => [x.type, x.value]));
        const late = Number(t.hour) * 60 + Number(t.minute) > h * 60 + m;
        const { error: err } = await supabase.from("attendance").insert({
          employee_id: me.id,
          attendance_date: todayStr(now),
          check_in: now.toISOString(),
          status: late ? "late" : "present",
          check_in_location: where.location, check_in_lat: where.lat, check_in_lng: where.lng,
        });
        if (err) throw err;
      } else {
        const hours = (now - new Date(today.check_in)) / 36e5;
        const { error: err } = await supabase
          .from("attendance")
          .update({ check_out: now.toISOString(), work_hours: Math.round(hours * 100) / 100,
            check_out_location: where.location, check_out_lat: where.lat, check_out_lng: where.lng })
          .eq("id", today.id);
        if (err) throw err;
      }
    },
    onSuccess: () => {
      setError("");
      queryClient.invalidateQueries({ queryKey: ["attendance", me.id] });
    },
    onError: (err) => setError(err.message),
  });

  const month = todayStr().slice(0, 7);
  const thisMonth = rows.filter((r) => r.attendance_date.startsWith(month));
  const hours = thisMonth.reduce((s, r) => s + Number(r.work_hours || 0), 0);
  const done = !!today?.check_out;

  return (
    <Page eyebrow="Workspace" title="My Attendance" subtitle="Check in when you start work and check out when you finish."
      actions={
        <button className={btnPrimary} disabled={punch.isPending || done} onClick={() => punch.mutate()}>
          {today ? <LogOut size={16} /> : <LogIn size={16} />}
          {punch.isPending ? "Getting location…" : done ? "Checked out for today" : today ? "Check out" : "Check in"}
        </button>
      }
    >
      <ErrorBox error={error} />
      <section className="mb-7 grid gap-4 sm:grid-cols-3">
        <StatCard label="Today" value={today ? fmtTime(today.check_in) : "Not checked in"} hint={today?.check_out ? `Out ${fmtTime(today.check_out)}` : undefined} />
        <StatCard label="Days present this month" value={thisMonth.filter((r) => r.status !== "absent").length} tone="green" />
        <StatCard label="Hours this month" value={hours.toFixed(1)} tone="slate" />
      </section>

      <Card title="History" subtitle="Last 60 records">
        {isLoading ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Empty icon={Clock} title="No attendance records yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead>
                <tr className="bg-[#17243D]/70 text-xs uppercase tracking-wider text-slate-400">
                  <th className="px-5 py-3">Date</th><th className="px-5 py-3">Check in</th><th className="px-5 py-3">Check-in location</th>
                  <th className="px-5 py-3">Check out</th><th className="px-5 py-3">Check-out location</th><th className="px-5 py-3">Hours</th><th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-5 py-3 text-white">{fmtDate(r.attendance_date)}</td>
                    <td className="px-5 py-3 text-slate-300">{fmtTime(r.check_in)}</td>
                    <td className="px-5 py-3"><Place text={r.check_in_location} lat={r.check_in_lat} lng={r.check_in_lng} /></td>
                    <td className="px-5 py-3 text-slate-300">{fmtTime(r.check_out)}</td>
                    <td className="px-5 py-3"><Place text={r.check_out_location} lat={r.check_out_lat} lng={r.check_out_lng} /></td>
                    <td className="px-5 py-3 text-slate-300">{r.work_hours ?? "—"}</td>
                    <td className="px-5 py-3"><Badge status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </Page>
  );
}
