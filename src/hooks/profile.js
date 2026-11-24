import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabaseClient";

// My own profile (bio details, theme, joined date). One cached call shared by the sidebar and the profile page.
export function useMyProfile(enabled = true) {
  return useQuery({
    queryKey: ["my-profile"],
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_profile");
      if (error) throw error;
      return (data || [])[0] || null;
    },
  });
}

export function useProfileRefresh() {
  const client = useQueryClient();
  return () => Promise.all([
    client.invalidateQueries({ queryKey: ["my-profile"] }),
    client.invalidateQueries({ queryKey: ["me"] }),
  ]);
}

export async function saveMyProfile({ full_name, phone, date_of_birth, about, city }) {
  const { error } = await supabase.rpc("update_my_profile", {
    p_full_name: full_name, p_phone: phone || null, p_date_of_birth: date_of_birth || null, p_about: about || null, p_city: city || null,
  });
  if (error) throw error;
}

export async function saveMyTheme(theme) {
  const { error } = await supabase.rpc("set_my_theme", { p_theme: theme });
  if (error) throw error;
}
