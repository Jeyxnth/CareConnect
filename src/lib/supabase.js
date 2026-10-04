import { createClient } from "@supabase/supabase-js";

const STORAGE_KEY = "careconnect-auth";

// Drop an expired stored session BEFORE the client is created, so the client
// never tries to restore/refresh a dead session on load.
try {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    const { expires_at } = JSON.parse(raw);
    if (typeof expires_at === "number" && expires_at * 1000 < Date.now()) {
      localStorage.removeItem(STORAGE_KEY);
    }
  }
} catch {
  // Corrupt JSON or storage unavailable — discard whatever is there.
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
}

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      storageKey: STORAGE_KEY,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);
