import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabaseClient";

// Boards and groups. Row Level Security returns only what the signed-in user may see.
export const useBoards = () =>
  useQuery({
    queryKey: ["boards"],
    queryFn: async () => {
      const [b, o] = await Promise.all([
        supabase.from("task_boards").select("*").order("created_at"),
        supabase.from("board_owners").select("board_id, user_id, created_at").order("created_at"),
      ]);
      if (b.error) throw b.error;
      const map = {};
      (o.data || []).forEach((r) => (map[r.board_id] ||= []).push(r.user_id));
      return (b.data || []).map((x) => {
        const ids = map[x.id] || [];
        return { ...x, owners: x.owner_id ? [x.owner_id, ...ids.filter((id) => id !== x.owner_id)] : ids };
      });
    },
  });

export const useGroups = () =>
  useQuery({
    queryKey: ["groups"],
    queryFn: async () => {
      const { data, error } = await supabase.from("task_groups").select("*").order("position").order("created_at");
      if (error) throw error;
      return data || [];
    },
  });

// The signed-in user's running timer (one at a time).
export const useMyTimer = () =>
  useQuery({
    queryKey: ["my-timer"],
    queryFn: async () => {
      const { data, error } = await supabase.from("task_timers").select("*").maybeSingle();
      if (error) throw error;
      return data;
    },
  });

export const useBoardColumns = () =>
  useQuery({
    queryKey: ["board-columns"],
    queryFn: async () => {
      const { data, error } = await supabase.from("board_columns").select("*").order("position").order("created_at");
      if (error) throw error;
      return data || [];
    },
  });

// task id -> number of attachments (for the Attachments column)
export const useAttachmentCounts = () =>
  useQuery({
    queryKey: ["task-attachments", "counts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("task_attachments").select("task_id");
      if (error) throw error;
      return (data || []).reduce((acc, r) => ({ ...acc, [r.task_id]: (acc[r.task_id] || 0) + 1 }), {});
    },
  });

export const useBoardMessages = (boardId) =>
  useQuery({
    queryKey: ["board-messages", boardId],
    enabled: !!boardId,
    queryFn: async () => {
      const { data, error } = await supabase.from("board_messages").select("*").eq("board_id", boardId).order("created_at").limit(200);
      if (error) throw error;
      return data || [];
    },
  });

