import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabaseClient";

// Private bucket file -> short-lived signed URL, cached for 50 minutes.
export function useSignedFileUrl(bucket, path) {
  return useQuery({
    queryKey: ["file-url", bucket, path],
    enabled: !!path,
    staleTime: 50 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
      if (error) throw error;
      return data.signedUrl;
    },
  }).data;
}
