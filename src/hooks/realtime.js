import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabaseClient";
import toast from "../lib/toast";

// table -> query keys to refresh. Supabase Realtime only delivers rows the user may read (row level security).
const WATCH = {
  tasks: ["tasks", "task-activity"],
  task_boards: ["boards"],
  task_groups: ["groups"],
  board_columns: ["board-columns"],
  task_comments: ["task-comments"],
  task_attachments: ["task-attachments"],
  task_activity: ["task-activity"],
  task_worklogs: ["task-worklogs"],
  board_messages: ["board-messages"],
  work_notifications: ["work-notifications"],
  board_owners: ["boards"],
  task_assignees: ["tasks"],
  leave_notifications: ["leave-notifications"],
  spotlight_notifications: ["spotlight-notifications"],
  leave_requests: ["leave-requests"],
};

// notification tables: a new row also pops up as a toast
const TOAST = ["work_notifications", "leave_notifications", "spotlight_notifications"];

// Keeps every open screen in sync: a board, task, sub-task, status or comment saved by someone else shows up without a refresh.
export function useRealtimeSync(enabled = true) {
  const client = useQueryClient();
  useEffect(() => {
    if (!enabled) return undefined;
    let timer;
    const pending = new Set();
    const flush = () => {
      pending.forEach((key) => client.invalidateQueries({ queryKey: [key] }));
      pending.clear();
    };
    const channel = supabase.channel("qc-work-sync");
    Object.entries(WATCH).forEach(([table, keys]) => {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, () => {
        keys.forEach((k) => pending.add(k));
        clearTimeout(timer);
        timer = setTimeout(flush, 250); // batch bursts of changes
      });
    });
    TOAST.forEach((table) => {
      channel.on("postgres_changes", { event: "INSERT", schema: "public", table }, (payload) => {
        const row = payload.new || {};
        if (row.message) toast.success(row.title ? `${row.title}: ${row.message}` : row.message);
      });
    });
    channel.subscribe();
    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [client, enabled]);
}
