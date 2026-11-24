import { supabase } from "./supabaseClient";
import { queryClient } from "./queryClient";

// Sign out and drop every cached query so the next user never sees old data.
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
  queryClient.clear();
}
