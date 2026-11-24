import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { supabase } from "../../lib/supabaseClient";
import toast from "../../lib/toast";
import { CHAT_ROLES } from "../../hooks/chat";

const Ctx = createContext({ me: null, online: new Set(), setActiveConversation: () => {} });
export const useChatRuntime = () => useContext(Ctx);

// Lives once at the authenticated root (above every role layout and page):
//  * who am I (only internal, active users get chat; clients never start anything)
//  * who is online (private Realtime presence channel, not stored anywhere permanently)
//  * live refresh of my conversation list and chat notifications (rows I am allowed to see)
export function ChatRuntime({ children }) {
  const client = useQueryClient();
  const [me, setMe] = useState(null);
  const [online, setOnline] = useState(() => new Set());
  const activeRef = useRef(null);
  const setActiveConversation = useCallback((id) => { activeRef.current = id; }, []);

  // Own tiny session watcher: it must not touch the shared "me" query (which the login flow relies on).
  useEffect(() => {
    let alive = true;
    const load = async (session) => {
      if (!session) return alive && setMe(null);
      const { data } = await supabase.from("profiles").select("id, full_name, role, is_active").eq("id", session.user.id).maybeSingle();
      if (!alive) return undefined;
      const ok = data && data.is_active && CHAT_ROLES.includes(data.role);
      setMe((prev) => (ok ? (prev?.id === data.id ? prev : data) : null));
      return undefined;
    };
    supabase.auth.getSession().then(({ data }) => load(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => setTimeout(() => load(session), 0));
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);

  const meId = me?.id;

  // Presence + "last seen" heartbeat
  useEffect(() => {
    if (!meId) { setOnline(new Set()); return undefined; }
    const channel = supabase.channel("chat:presence", { config: { private: true, presence: { key: meId } } });
    channel.on("presence", { event: "sync" }, () => setOnline(new Set(Object.keys(channel.presenceState()))));
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") channel.track({ online_at: new Date().toISOString() });
    });
    const touch = () => supabase.rpc("chat_touch").then(() => {}, () => {});
    touch();
    const beat = setInterval(touch, 2 * 60 * 1000);
    return () => { clearInterval(beat); touch(); supabase.removeChannel(channel); };
  }, [meId]);

  // Conversation list / notification refresh. Only rows the database lets me read are ever delivered.
  useEffect(() => {
    if (!meId) return undefined;
    let timer;
    const refreshList = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        client.invalidateQueries({ queryKey: ["chat-conversations"] });
      }, 200);
    };
    const channel = supabase
      .channel(`chat-sync-${meId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_conversations" }, refreshList)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_conversation_members" }, refreshList)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_notifications", filter: `recipient_id=eq.${meId}` }, (payload) => {
        const n = payload.new || {};
        client.invalidateQueries({ queryKey: ["chat-notifications"] });
        refreshList();
        const watching = activeRef.current && activeRef.current === n.conversation_id && document.visibilityState === "visible";
        if (watching) return;                                         // the open chat already shows it
        toast.success(`${n.title}: ${n.message}`);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chat_notifications", filter: `recipient_id=eq.${meId}` }, () => {
        client.invalidateQueries({ queryKey: ["chat-notifications"] });
      })
      .subscribe();
    return () => { clearTimeout(timer); supabase.removeChannel(channel); };
  }, [client, meId]);

  const value = useMemo(() => ({ me, online, setActiveConversation }), [me, online, setActiveConversation]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
