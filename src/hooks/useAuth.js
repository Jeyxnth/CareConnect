import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

// Session state comes ONLY from onAuthStateChange (supabase-js emits
// INITIAL_SESSION on registration, so no separate session lookup is needed).
export function useAuth() {
  const [user, setUser] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const currentUserId = useRef(null);
  const loadingFor = useRef(null);

  useEffect(() => {
    // Load the patient profile; if the account has none yet, create it from the
    // name/role captured at sign-up (stored in user_metadata), since the row can
    // only be inserted once a session exists (e.g. after email confirmation).
    async function loadProfile(sessionUser) {
      // SIGNED_IN can fire repeatedly (e.g. on tab focus); avoid overlapping loads
      // so the profile row can't be inserted twice.
      if (loadingFor.current === sessionUser.id) return;
      loadingFor.current = sessionUser.id;
      try {
        const { data, error } = await supabase
          .from("patients")
          .select("*")
          .eq("user_id", sessionUser.id)
          .limit(1)
          .maybeSingle();
        if (error) throw error;

        let row = data;
        const meta = sessionUser.user_metadata || {};
        if (!row && meta.full_name) {
          const { data: created, error: insertError } = await supabase
            .from("patients")
            .insert({
              user_id: sessionUser.id,
              name: meta.full_name,
              role: meta.role === "caregiver" ? "caregiver" : "patient",
            })
            .select()
            .single();
          if (insertError) throw insertError;
          row = created;
        }
        // Ignore the result if the user signed out / changed while we were fetching
        if (currentUserId.current === sessionUser.id) setProfile(row ?? null);
      } catch (err) {
        console.error("Failed to load profile:", err);
      } finally {
        loadingFor.current = null;
        if (currentUserId.current === sessionUser.id) setLoading(false);
      }
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        currentUserId.current = null;
        setUser(null);
        setAccessToken(null);
        setProfile(null);
        setLoading(false);
        return;
      }

      setUser(session.user);
      setAccessToken(session.access_token);

      if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
        currentUserId.current = session.user.id;
        // Never await Supabase calls inside this callback (it can deadlock the
        // auth client) — defer to the next tick.
        setTimeout(() => loadProfile(session.user), 0);
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut({ scope: "local" });
    currentUserId.current = null;
    setUser(null);
    setAccessToken(null);
    setProfile(null);
  }, []);

  // Re-read the patients row (e.g. after the Profile page saves it)
  const refreshProfile = useCallback(async () => {
    const id = currentUserId.current;
    if (!id) return null;
    const { data, error } = await supabase
      .from("patients")
      .select("*")
      .eq("user_id", id)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (currentUserId.current === id) setProfile(data ?? null);
    return data;
  }, []);

  return { user, accessToken, profile, loading, signOut, refreshProfile };
}
