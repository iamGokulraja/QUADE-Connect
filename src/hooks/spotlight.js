import { useQuery, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabaseClient";

export const CATEGORIES = [
  "Company Events", "Employee Achievements", "Promotions", "Team Activities",
  "Celebrations", "Work Anniversaries", "Company Memories", "General Updates",
];
export const MAX_PHOTOS = 10;
export const MAX_PHOTO_MB = 5;
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
export const PAGE_SIZE = 10;

export const canModerate = (me) => me?.role === "admin" || me?.role === "hr";

// Private bucket: turn a storage path into a short-lived signed URL (cached).
export function useSignedUrl(path) {
  return useQuery({
    queryKey: ["sp-url", path],
    enabled: !!path,
    staleTime: 50 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from("spotlight").createSignedUrl(path, 3600);
      if (error) throw error;
      return data.signedUrl;
    },
  }).data;
}

const esc = (s) => s.replace(/[\\%_]/g, (c) => "\\" + c);

export function useFeed(f) {
  return useInfiniteQuery({
    queryKey: ["sp-feed", f],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      let q = supabase.from("spotlight_feed").select("*");
      if (f.q?.trim()) q = q.ilike("content", `%${esc(f.q.trim())}%`);
      if (f.category) q = q.eq("category", f.category);
      if (f.author) q = q.eq("user_id", f.author);
      if (f.from) q = q.gte("created_at", new Date(f.from + "T00:00:00").toISOString());
      if (f.to) q = q.lte("created_at", new Date(f.to + "T23:59:59.999").toISOString());
      q = q.order("created_at", { ascending: f.sort === "oldest" }).range(pageParam, pageParam + PAGE_SIZE - 1);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    getNextPageParam: (last, all) => (last.length === PAGE_SIZE ? all.length * PAGE_SIZE : undefined),
  });
}

export function useAuthors() {
  return useQuery({
    queryKey: ["sp-authors"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.from("spotlight_authors").select("*").order("full_name");
      if (error) throw error;
      return data || [];
    },
  });
}

export function useComments(postId, enabled) {
  return useQuery({
    queryKey: ["sp-comments", postId],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from("spotlight_comments").select("*").eq("post_id", postId).order("created_at");
      if (error) throw error;
      return data || [];
    },
  });
}

// People who liked one post (newest first). Names come from the already-loaded authors list.
export function useLikers(postId, enabled) {
  return useQuery({
    queryKey: ["sp-likers", postId],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from("spotlight_likes").select("user_id, created_at").eq("post_id", postId)
        .order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return data || [];
    },
  });
}

// Colour per category (feed badge + category list).
export const CATEGORY_STYLE = {
  "Company Events": "border-violet-500/30 bg-violet-500/10 text-violet-300",
  "Employee Achievements": "border-amber-500/30 bg-amber-500/10 text-amber-300",
  Promotions: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  "Team Activities": "border-sky-500/30 bg-sky-500/10 text-sky-300",
  Celebrations: "border-pink-500/30 bg-pink-500/10 text-pink-300",
  "Work Anniversaries": "border-orange-500/30 bg-orange-500/10 text-orange-300",
  "Company Memories": "border-teal-500/30 bg-teal-500/10 text-teal-300",
  "General Updates": "border-blue-500/30 bg-blue-500/10 text-blue-300",
};

// Highlights shown in the right column (real posts only).
export function useHighlights(categories) {
  return useQuery({
    queryKey: ["sp-highlights", categories],
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.from("spotlight_feed").select("id,author_name,category,content,created_at,like_count")
        .in("category", categories).order("created_at", { ascending: false }).limit(4);
      if (error) throw error;
      return data || [];
    },
  });
}

// Upload a new profile photo (shared by Spotlight and My Profile). Throws a readable Error.
export async function uploadAvatar(userId, oldPath, file) {
  if (!PHOTO_TYPES.includes(file.type)) throw new Error("Use a JPG, PNG, WebP or GIF image.");
  if (file.size > MAX_PHOTO_MB * 1024 * 1024) throw new Error(`Image must be under ${MAX_PHOTO_MB} MB.`);
  const path = `${userId}/avatar/${crypto.randomUUID()}.${file.type.split("/")[1].replace("jpeg", "jpg")}`;
  const { error: e1 } = await supabase.storage.from("spotlight").upload(path, file, { contentType: file.type });
  if (e1) throw e1;
  const { error: e2 } = await supabase.rpc("spotlight_set_avatar", { p_path: path });
  if (e2) throw e2;
  if (oldPath) await supabase.storage.from("spotlight").remove([oldPath]);   // best effort
}

export function useSpotlightRefresh() {
  const client = useQueryClient();
  return (...keys) => keys.forEach((k) => client.invalidateQueries({ queryKey: [k] }));
}

export const initials = (name) => (name || "?").split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
export const roleLabel = (r) => (r || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
export function timeAgo(v) {
  const s = (Date.now() - new Date(v).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return new Date(v).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
