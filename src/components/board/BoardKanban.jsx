import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { supabase } from "../../lib/supabaseClient";
import { TASK_STATUSES } from "../../lib/constants";
import { fmtHours, isDueTomorrow, isOverdue, topLevel } from "../../lib/utils";
import { STATUS_COLORS, taskOwnerIds, taskPerms } from "../../lib/board";
import { AvatarStack } from "./Avatars";
import { ErrorBox } from "../ui";
import { PriorityPill } from "./StatusPill";

// Kanban view: one column per status. Drag a card to another column to change its status.
export default function BoardKanban({ tasks, boards, me, teams, people, onOpen }) {
  const client = useQueryClient();
  const [dragging, setDragging] = useState(null);
  const [error, setError] = useState("");
  const boardOf = (t) => boards.find((b) => b.id === t.board_id);

  const move = async (task, status) => {
    setDragging(null);
    if (task.status === status) return;
    const { error: err } = await supabase.from("tasks").update({ status }).eq("id", task.id);
    if (err) return setError(err.message);
    setError("");
    client.invalidateQueries({ queryKey: ["tasks"] });
  };

  return (
    <div className="p-4">
      <ErrorBox error={error} />
      <div className="flex gap-4 overflow-x-auto pb-2">
        {TASK_STATUSES.map((col) => {
          const items = topLevel(tasks).filter((t) => t.status === col.key);
          return (
            <div key={col.key} onDragOver={(e) => e.preventDefault()} onDrop={() => dragging && move(dragging, col.key)}
              className="w-72 shrink-0 rounded-xl bg-[#0D172A] p-3">
              <div className="mb-3 flex items-center gap-2 px-1">
                <span className="h-3 w-3 rounded-full" style={{ background: STATUS_COLORS[col.key] }} />
                <span className="text-sm font-semibold text-slate-200">{col.label}</span>
                <span className="ml-auto rounded-full bg-slate-700 px-2 text-xs text-slate-300">{items.length}</span>
              </div>
              <div className="min-h-[60px] space-y-3">
                {items.map((t) => {
                  const p = taskPerms(t, me, boardOf(t), teams);
                  return (
                    <div key={t.id} draggable={p.status} onDragStart={() => setDragging(t)} onClick={() => onOpen(t)}
                      className={`rounded-xl border bg-[#17243D] p-3 text-left ${p.status ? "cursor-grab" : "cursor-pointer"} hover:border-blue-500 ${isOverdue(t) || isDueTomorrow(t) ? "border-red-500/50" : "border-slate-700"}`}>
                      <p className="font-medium text-white">{t.title}</p>
                      <div className="mt-2 flex items-center justify-between text-xs">
                        <PriorityPill value={t.priority} disabled />
                        <span className={`flex items-center gap-1 ${isOverdue(t) || isDueTomorrow(t) ? "text-red-400" : "text-slate-400"}`}>
                          <CalendarDays size={12} /> {t.due_date ? new Date(`${t.due_date}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "No date"}
                        </span>
                      </div>
                      <div className="mt-2 flex justify-between text-xs text-slate-400">
                        <AvatarStack ids={taskOwnerIds(t)} people={people} size={22} />
                        <span>{fmtHours(t.actual_hours)}{t.estimated_hours ? ` / ${fmtHours(t.estimated_hours)}` : ""}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
