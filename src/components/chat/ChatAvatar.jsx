import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";

import { supabase } from "../../lib/supabaseClient";
import { CHAT_BUCKET, initials } from "../../lib/chat";

// Profile pictures live in the "spotlight" bucket, group pictures in "chat-files" (both private -> signed URLs).
function useUrl(bucket, path) {
  return useQuery({
    queryKey: ["chat-avatar", bucket, path],
    enabled: !!path,
    staleTime: 50 * 60 * 1000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
      if (error) throw error;
      return data.signedUrl;
    },
  }).data;
}

export default function ChatAvatar({ name, path, group = false, size = 40, online = null, ring = false }) {
  const url = useUrl(group ? CHAT_BUCKET : "spotlight", path);
  const style = { width: size, height: size };
  return (
    <span className="relative inline-block shrink-0" style={style}>
      {url ? (
        <img src={url} alt={name || ""} style={style} className={`rounded-full object-cover ${ring ? "ring-2 ring-emerald-400" : ""}`} />
      ) : (
        <span style={{ ...style, fontSize: size / 2.6 }}
          className={`grid place-items-center rounded-full font-bold ${group ? "bg-indigo-600/30 text-indigo-200" : "bg-blue-600/30 text-blue-200"} ${ring ? "ring-2 ring-emerald-400" : ""}`}>
          {group ? <Users size={size / 2.2} /> : initials(name)}
        </span>
      )}
      {online !== null && (
        <span title={online ? "Online" : "Offline"}
          className={`absolute bottom-0 right-0 block rounded-full border-2 border-[#0B1120] ${online ? "bg-emerald-400" : "bg-slate-600"}`}
          style={{ width: Math.max(9, size / 4), height: Math.max(9, size / 4) }} />
      )}
    </span>
  );
}
