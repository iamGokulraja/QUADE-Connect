import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "../lib/supabaseClient";
import { uploadWithProgress } from "../lib/upload";
import { CHAT_BUCKET, PAGE_SIZE, attachmentPath, isImageFile } from "../lib/chat";

export const CHAT_ROLES = ["admin", "hr", "project_manager", "team_lead", "employee", "qc"];

// Every database change goes through a chat_* function (it re-checks permissions on the server).
export async function rpc(fn, args) {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  return data;
}

/* ---------------------------------------------------------------- reads */

// Everyone who can chat (names, roles, designation, picture, last seen if shared).
export function useDirectory() {
  const q = useQuery({
    queryKey: ["chat-directory"],
    staleTime: 2 * 60 * 1000,
    queryFn: () => rpc("chat_directory"),
  });
  const map = useMemo(() => Object.fromEntries((q.data || []).map((p) => [p.id, p])), [q.data]);
  return { ...q, people: q.data || [], map };
}

// My conversations with unread counts (one query; the database computes everything).
export function useConversations(enabled = true) {
  return useQuery({
    queryKey: ["chat-conversations"],
    enabled,
    staleTime: 15 * 1000,
    retry: false,
    queryFn: () => rpc("chat_my_conversations"),
  });
}

export function useChatUnread(enabled = true) {
  const { data } = useConversations(enabled);
  return (data || []).reduce((n, c) => n + (c.is_muted ? 0 : c.unread), 0);
}

const MESSAGE_SELECT = "*, chat_attachments(*), chat_message_reactions(user_id, reaction), chat_message_reads(user_id)";

// Newest 40 messages first; "Load older" fetches the next page (cursor = created_at). Never the whole history.
export function useMessages(conversationId) {
  return useInfiniteQuery({
    queryKey: ["chat-messages", conversationId],
    enabled: !!conversationId,
    initialPageParam: null,
    queryFn: async ({ pageParam }) => {
      let q = supabase.from("chat_messages").select(MESSAGE_SELECT).eq("conversation_id", conversationId)
        .order("created_at", { ascending: false }).limit(PAGE_SIZE);
      if (pageParam) q = q.lt("created_at", pageParam);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    getNextPageParam: (last) => (last.length === PAGE_SIZE ? last[last.length - 1].created_at : undefined),
  });
}

// Pages (newest first) + messages still being sent -> one ascending list without duplicates.
export function mergeMessages(pages = [], pending = []) {
  const byId = new Map();
  pages.flat().forEach((m) => byId.set(m.id, m));
  pending.forEach((m) => { if (!byId.has(m.id)) byId.set(m.id, m); });   // server copy wins over the optimistic one
  return [...byId.values()].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
}

export function usePinned(conversationId) {
  return useQuery({
    queryKey: ["chat-pinned", conversationId],
    enabled: !!conversationId,
    queryFn: async () => {
      const { data, error } = await supabase.from("chat_messages").select("id, content, sender_id, pinned_at, message_type")
        .eq("conversation_id", conversationId).not("pinned_at", "is", null).is("deleted_at", null)
        .order("pinned_at", { ascending: false }).limit(20);
      if (error) throw error;
      return data || [];
    },
  });
}

// Shared files of one conversation (conversationId) or of every conversation I belong to.
export function useSharedFiles(conversationId) {
  return useQuery({
    queryKey: ["chat-files", conversationId || "all"],
    queryFn: async () => {
      let q = supabase.from("chat_attachments").select("*").order("created_at", { ascending: false }).limit(300);
      if (conversationId) q = q.eq("conversation_id", conversationId);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });
}

export function useProjectOptions(enabled) {
  return useQuery({ queryKey: ["chat-project-options"], enabled, queryFn: () => rpc("chat_project_options") });
}

export function useLastSeenSetting() {
  return useQuery({ queryKey: ["chat-last-seen-setting"], queryFn: () => rpc("chat_my_status") });
}

/* ---------------------------------------------------------------- files */

// Private bucket: short-lived signed URL, cached for 50 minutes.
export function useChatFileUrl(path) {
  return useQuery({
    queryKey: ["chat-url", path],
    enabled: !!path,
    staleTime: 50 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(CHAT_BUCKET).createSignedUrl(path, 3600);
      if (error) throw error;
      return data.signedUrl;
    },
  }).data;
}

export async function downloadChatFile(path, name) {
  const { data, error } = await supabase.storage.from(CHAT_BUCKET).createSignedUrl(path, 120, { download: name || true });
  if (error) throw error;
  const a = document.createElement("a");
  a.href = data.signedUrl;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/* ---------------------------------------------------------------- sending */

// Upload files -> save the message (client-made id, so Realtime echoes never duplicate it) -> save attachment rows.
export async function sendChatMessage({ id, conversationId, content, files = [], replyTo = null, mentions = [], onProgress }) {
  const uploaded = [];
  for (let i = 0; i < files.length; i += 1) {
    const file = files[i];
    const path = attachmentPath(conversationId, file);
    await uploadWithProgress(CHAT_BUCKET, path, file, (f) => onProgress?.(i, f));
    uploaded.push({ file_name: file.name, storage_path: path, mime_type: file.type || null, file_size: file.size });
  }
  const type = !uploaded.length ? "text" : uploaded.every((u) => isImageFile(u.file_name, u.mime_type)) ? "image" : "file";
  const { error } = await supabase.from("chat_messages").insert({
    id, conversation_id: conversationId, content: content || "", message_type: type,
    reply_to_message_id: replyTo, mentions,
  });
  if (error) throw error;
  if (uploaded.length) {
    const { error: attError } = await supabase.from("chat_attachments")
      .insert(uploaded.map((u) => ({ ...u, message_id: id, conversation_id: conversationId })));
    if (attError) throw attError;
  }
  return id;
}

// Forward = a new message in each chosen conversation; attachments are COPIED into that conversation's folder
// (so only its members can open them).
export async function forwardMessage(message, targetIds) {
  for (const target of targetIds) {
    const id = crypto.randomUUID();
    const atts = message.chat_attachments || [];
    const { error } = await supabase.from("chat_messages").insert({
      id, conversation_id: target, content: message.content || "", message_type: message.message_type, is_forwarded: true,
    });
    if (error) throw error;
    const rows = [];
    for (const a of atts) {
      const newPath = `${target}/${crypto.randomUUID()}-${a.file_name.replace(/[^\w.\-]+/g, "_")}`;
      const { error: copyError } = await supabase.storage.from(CHAT_BUCKET).copy(a.storage_path, newPath);
      if (copyError) throw copyError;
      rows.push({ message_id: id, conversation_id: target, file_name: a.file_name, storage_path: newPath, mime_type: a.mime_type, file_size: a.file_size });
    }
    if (rows.length) {
      const { error: attError } = await supabase.from("chat_attachments").insert(rows);
      if (attError) throw attError;
    }
  }
}

export async function editMessage(id, content) {
  const { error } = await supabase.from("chat_messages").update({ content }).eq("id", id);
  if (error) throw error;
}

export async function toggleReaction(messageId, reaction, mine) {
  const q = supabase.from("chat_message_reactions");
  const { error } = mine
    ? await q.delete().eq("message_id", messageId).eq("reaction", reaction)
    : await q.insert({ message_id: messageId, reaction });
  if (error && error.code !== "23505") throw error;   // 23505 = same reaction twice: ignore
}

/* ---------------------------------------------------------------- realtime */

// Live updates for the OPEN conversation only (not every conversation). Removed on switch / leave.
export function useConversationRealtime(conversationId) {
  const client = useQueryClient();
  useEffect(() => {
    if (!conversationId) return undefined;
    let timer;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        client.invalidateQueries({ queryKey: ["chat-messages", conversationId] });
        client.invalidateQueries({ queryKey: ["chat-pinned", conversationId] });
        client.invalidateQueries({ queryKey: ["chat-files"] });
      }, 150);
    };
    const filter = `conversation_id=eq.${conversationId}`;
    const channel = supabase
      .channel(`chat-live-${conversationId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages", filter }, refresh)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_attachments", filter }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_message_reactions" }, refresh)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_message_reads" }, refresh)
      .subscribe();
    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [client, conversationId]);
}

// "X is typing..." over a private broadcast channel (only members can join it).
export function useTyping(conversationId, meId) {
  const [typing, setTyping] = useState([]);
  const channelRef = useRef(null);
  const timers = useRef({});
  const lastSent = useRef(0);

  useEffect(() => {
    if (!conversationId || !meId) return undefined;
    setTyping([]);
    const channel = supabase.channel(`chat:typing:${conversationId}`, { config: { private: true, broadcast: { self: false } } });
    channel.on("broadcast", { event: "typing" }, ({ payload }) => {
      const uid = payload?.user_id;
      if (!uid || uid === meId) return;
      setTyping((l) => (l.includes(uid) ? l : [...l, uid]));
      clearTimeout(timers.current[uid]);
      timers.current[uid] = setTimeout(() => setTyping((l) => l.filter((x) => x !== uid)), 3500);
    });
    channel.subscribe();
    channelRef.current = channel;
    const pending = timers.current;
    return () => {
      Object.values(pending).forEach(clearTimeout);
      timers.current = {};
      channelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [conversationId, meId]);

  const notify = useCallback(() => {
    const now = Date.now();
    if (now - lastSent.current < 2000 || !channelRef.current) return;
    lastSent.current = now;
    channelRef.current.send({ type: "broadcast", event: "typing", payload: { user_id: meId } });
  }, [meId]);

  return { typing, notify };
}
