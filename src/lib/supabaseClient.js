import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

function getNormalizedSupabaseUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith(".supabase.co")
      ? url.origin
      : "";
  } catch {
    return "";
  }
}

const normalizedSupabaseUrl = getNormalizedSupabaseUrl(supabaseUrl);

export const isSupabaseConfigured =
  Boolean(normalizedSupabaseUrl) &&
  supabasePublishableKey.startsWith("sb_publishable_") &&
  !supabaseUrl.includes("your-project-ref") &&
  !supabasePublishableKey.includes("your_key_here");

export const supabase = isSupabaseConfigured
  ? createClient(normalizedSupabaseUrl, supabasePublishableKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true
      }
    })
  : null;

export function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase 환경변수가 아직 설정되지 않았습니다.");
  }

  return supabase;
}
