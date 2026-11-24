import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabaseClient";

// The call that is ringing or running in one conversation (members can read it), or null.
export function useOpenCall(conversationId) {
  return useQuery({
    queryKey: ["chat-open-call", conversationId],
    enabled: !!conversationId,
    staleTime: 5000,
    refetchInterval: 20000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.from("chat_calls").select("id, call_type, call_status, initiated_by, created_at")
        .eq("conversation_id", conversationId).in("call_status", ["ringing", "active"]).order("created_at", { ascending: false }).limit(1);
      if (error) return null;           // calls not installed yet: the chat keeps working
      const c = data?.[0];
      return c && Date.now() - new Date(c.created_at).getTime() < 6 * 3600 * 1000 ? c : null;
    },
  });
}
