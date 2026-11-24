import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Bell, X } from "lucide-react";

import { supabase } from "../lib/supabaseClient";
import { fmtDate, todayStr } from "../lib/utils";
import { useLeaveRequests } from "../hooks/leave";
import { ROLE_BASE } from "../lib/constants";

// Notification centre in the sidebar. Leave events come from leave_notifications (written by the database);
// reminders (pending approvals, upcoming approved leave) are derived from live data.
export default function NotificationBell({ me }) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { data: items = [], isError } = useQuery({
    queryKey: ["leave-notifications"],
    refetchInterval: 60000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.from("leave_notifications").select("*").order("created_at", { ascending: false }).limit(25);
      if (error) throw error;
      return data || [];
    },
  });
  const { data: spItems = [], isError: spError } = useQuery({
    queryKey: ["spotlight-notifications"],
    refetchInterval: 60000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.from("spotlight_notifications").select("*").order("created_at", { ascending: false }).limit(25);
      if (error) throw error;
      return data || [];
    },
  });
  const { data: workItems = [], isError: workError } = useQuery({
    queryKey: ["work-notifications"],
    refetchInterval: 60000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.from("work_notifications").select("*").order("created_at", { ascending: false }).limit(40);
      if (error) throw error;
      return data || [];
    },
  });
  const { data: chatItems = [], isError: chatError } = useQuery({
    queryKey: ["chat-notifications"],
    refetchInterval: 60000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.from("chat_notifications").select("*").order("created_at", { ascending: false }).limit(40);
      if (error) throw error;
      return data || [];
    },
  });
  const reqs = useLeaveRequests().data || [];

  if (isError && spError && workError && chatError) return null; // no notification module installed yet

  const today = todayStr();
  const soon = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
  const pending = reqs.filter((r) => r.status === "pending" && r.current_approver_id === me.id).length;
  const upcoming = reqs.filter((r) => r.employee_id === me.id && r.status === "approved" && r.start_date >= today && r.start_date <= soon);
  const all = [
    ...(isError ? [] : items.map((n) => ({ ...n, src: "leave_notifications", key: "leave-notifications" }))),
    ...(spError ? [] : spItems.map((n) => ({ ...n, src: "spotlight_notifications", key: "spotlight-notifications" }))),
    ...(workError ? [] : workItems.map((n) => ({ ...n, src: "work_notifications", key: "work-notifications" }))),
    ...(chatError ? [] : chatItems.map((n) => ({ ...n, src: "chat_notifications", key: "chat-notifications" }))),
  ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const unread = all.filter((n) => !n.is_read).length;
  const base = ROLE_BASE[me.role];
  const linkFor = (n) => {
    if (n.src === "leave_notifications") return `${base}/leave`;
    if (n.src === "spotlight_notifications") return `${base}/spotlight`;
    if (n.src === "chat_notifications") return n.conversation_id ? `${base}/chat?c=${n.conversation_id}` : `${base}/chat`;
    if (n.project_id && n.board_id) return `${base}/projects/${n.project_id}?board=${n.board_id}${n.type === "board_message" ? "&view=chat" : ""}`;
    if (n.project_id) return `${base}/projects/${n.project_id}`;
    return null;
  };

  // mark read per source table
  const read = async (list) => {
    const todo = list.filter((n) => !n.is_read);
    for (const src of [...new Set(todo.map((n) => n.src))]) {
      const mine = todo.filter((n) => n.src === src);
      await supabase.from(src).update({ is_read: true }).in("id", mine.map((n) => n.id));
      client.invalidateQueries({ queryKey: [mine[0].key] });
    }
  };

  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} aria-label="Notifications" aria-expanded={open}
        className="relative grid h-10 w-10 place-items-center rounded-full border border-slate-700 bg-[#111C32] text-slate-300 transition hover:bg-slate-800 hover:text-white">
        <Bell size={18} />
        {unread + pending > 0 && <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[10px] text-white">{unread + pending}</span>}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 max-h-[70vh] w-[min(20rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-slate-700 bg-[#111C32] shadow-2xl">
          <div className="flex items-center justify-between gap-2 border-b border-slate-700 p-3">
            <strong className="text-sm text-white">Notifications</strong>
            <div className="flex items-center gap-2">
              <button className="text-xs text-blue-400" onClick={() => read(all)}>Mark all read</button>
              <button onClick={() => setOpen(false)} aria-label="Close notifications" className="rounded-lg p-1 text-slate-400 hover:bg-slate-700 hover:text-white"><X size={16} /></button>
            </div>
          </div>
          {pending > 0 && <p className="border-b border-slate-700/60 p-3 text-xs text-amber-300">{pending} leave request(s) need your approval.</p>}
          {upcoming.map((r) => <p key={r.id} className="border-b border-slate-700/60 p-3 text-xs text-emerald-300">Your approved leave starts {fmtDate(r.start_date)}.</p>)}
          {all.length === 0 && pending === 0 && upcoming.length === 0 && <p className="p-4 text-xs text-slate-500">No notifications.</p>}
          {all.map((n) => (
            <button key={n.src + n.id} onClick={() => { read([n]); const to = linkFor(n); if (to) { setOpen(false); navigate(to); } }}
              className={`block w-full border-b border-slate-700/60 p-3 text-left text-xs ${n.src === "work_notifications" && n.is_urgent && !n.is_read ? "border-l-4 border-l-red-500 " : ""}${n.is_read ? "text-slate-500" : "text-slate-200"}`}>
              {n.src === "chat_notifications" && <strong className={`mb-0.5 block ${n.is_read ? "" : "text-blue-300"}`}>{n.title}</strong>}
              {n.src === "work_notifications" && <strong className={`mb-0.5 block ${n.is_read ? "" : "text-red-400"}`}>{n.title}{n.due_date ? ` · due ${fmtDate(n.due_date)}` : ""}</strong>}
              {n.message}
              <span className="mt-1 block text-[10px] text-slate-500">{new Date(n.created_at).toLocaleString("en-IN")}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
