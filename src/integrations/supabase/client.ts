import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
if (!supabaseConfigured) {
  console.error("Supabase env missing: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
}

// Placeholder values keep the UI rendering (with a load error) instead of a white screen.
export const supabase = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "placeholder-anon-key",
);
