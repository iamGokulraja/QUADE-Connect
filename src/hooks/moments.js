import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabaseClient";
import { uploadWithProgress } from "../lib/upload";
import { MOMENT_BUCKET, PAGE_SIZE, mediaPath, mediaTypeOf } from "../lib/moments";

// My moments, newest first (RLS already limits this to my own rows). category "" = all.
export function useMoments(category) {
  return useInfiniteQuery({
    queryKey: ["moments", category || "all"],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      let q = supabase.from("moments").select("*, moment_media(*)");
      if (category) q = q.eq("category", category);
      const { data, error } = await q.order("moment_date", { ascending: false }).order("created_at", { ascending: false })
        .range(pageParam, pageParam + PAGE_SIZE - 1);
      if (error) throw error;
      return data || [];
    },
    getNextPageParam: (last, all) => (last.length === PAGE_SIZE ? all.length * PAGE_SIZE : undefined),
  });
}

export function useMomentStats() {
  return useQuery({
    queryKey: ["moments-stats"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("moments_stats");
      if (error) throw error;
      return (data || [])[0] || { total: 0, celebrations: 0, appreciations: 0 };
    },
  });
}

export function useMomentsRefresh() {
  const client = useQueryClient();
  return () => Promise.all([
    client.invalidateQueries({ queryKey: ["moments"] }),
    client.invalidateQueries({ queryKey: ["moments-stats"] }),
  ]);
}

// Upload files, save the moment, save the file rows. Files are removed again if saving fails.
export async function createMoment({ userId, caption, category, moment_date, files, onProgress }) {
  const id = crypto.randomUUID();
  const uploaded = [];
  try {
    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      const path = mediaPath(userId, id, file);
      await uploadWithProgress(MOMENT_BUCKET, path, file, (f) => onProgress?.(i, f));
      uploaded.push({ moment_id: id, user_id: userId, storage_path: path, file_name: file.name, mime_type: file.type || null, media_type: mediaTypeOf(file), file_size: file.size });
    }
    const { error } = await supabase.from("moments").insert({ id, user_id: userId, caption, category, moment_date });
    if (error) throw error;
    if (uploaded.length) {
      const { error: mediaError } = await supabase.from("moment_media").insert(uploaded);
      if (mediaError) { await supabase.from("moments").delete().eq("id", id); throw mediaError; }
    }
    return id;
  } catch (err) {
    if (uploaded.length) await supabase.storage.from(MOMENT_BUCKET).remove(uploaded.map((u) => u.storage_path));
    throw err;
  }
}

export async function updateMoment(id, { caption, category, moment_date }) {
  const { error } = await supabase.from("moments").update({ caption, category, moment_date }).eq("id", id);
  if (error) throw error;
}

export async function deleteMoment(moment) {
  const paths = (moment.moment_media || []).map((m) => m.storage_path);
  const { error } = await supabase.from("moments").delete().eq("id", moment.id);
  if (error) throw error;
  if (paths.length) await supabase.storage.from(MOMENT_BUCKET).remove(paths);   // best effort
}
