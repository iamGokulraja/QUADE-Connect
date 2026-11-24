import { useEffect, useState } from "react";
import { Pause, Play, Square } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { supabase } from "../../lib/supabaseClient";
import { useMyTimer } from "../../hooks/boards";
import { inputCls, btnGhost, btnPrimary, ErrorBox } from "../ui";

const clock = (s) => [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, "0")).join(":");

// Start / Pause / Resume / Stop. Stopping saves a work log and adds the time to the task's actual hours.
// The database allows only one running timer per person.
export default function TaskTimer({ task }) {
  const client = useQueryClient();
  const { data: timer } = useMyTimer();
  const [now, setNow] = useState(Date.now());
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const mine = timer && timer.task_id === task.id;
  const elapsed = mine
    ? timer.accumulated_seconds + (timer.paused_at ? 0 : Math.max(Math.floor((now - new Date(timer.started_at).getTime()) / 1000), 0))
    : 0;

  const call = async (fn, args) => {
    setBusy(true);
    setError("");
    const { error: err } = await supabase.rpc(fn, args);
    setBusy(false);
    if (err) return setError(err.message);
    setNote("");
    ["my-timer", "tasks", "task-worklogs"].forEach((k) => client.invalidateQueries({ queryKey: [k] }));
  };

  return (
    <div className="rounded-xl bg-[#0D172A] p-3">
      <ErrorBox error={error} />
      <div className="flex flex-wrap items-center gap-3">
        <span className={`font-mono text-2xl ${mine && !timer.paused_at ? "text-emerald-400" : "text-slate-300"}`}>{clock(elapsed)}</span>
        {!mine && (
          <button className={btnPrimary} disabled={busy || !!timer || task.status === "completed"} onClick={() => call("timer_start", { p_task: task.id })}>
            <Play size={15} /> Start timer
          </button>
        )}
        {mine && !timer.paused_at && <button className={btnGhost} disabled={busy} onClick={() => call("timer_pause")}><Pause size={15} /> Pause</button>}
        {mine && timer.paused_at && <button className={btnGhost} disabled={busy} onClick={() => call("timer_resume")}><Play size={15} /> Resume</button>}
        {mine && <button className={`${btnGhost} text-red-300`} disabled={busy} onClick={() => call("timer_stop", { p_note: note })}><Square size={15} /> Stop &amp; save</button>}
      </div>
      {mine && <input className={`${inputCls} mt-3`} placeholder="Note for this work log (optional)" value={note} onChange={(e) => setNote(e.target.value)} />}
      {timer && !mine && <p className="mt-2 text-xs text-amber-300">You already have a timer running on another task. Stop it first.</p>}
    </div>
  );
}
