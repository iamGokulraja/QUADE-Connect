import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// True when the .env file is missing or incomplete (main.jsx then shows a clear message).
export const configMissing = !url || !key;

// Placeholder values keep the app from crashing on import; nothing is called when config is missing.
export const supabase = createClient(url || "http://localhost", key || "missing-key");
