// src/hooks/useDSEPriceFetch.js
// Hook for managing DSE price auto-fetch toggle and manual fetch trigger

import { useState, useEffect, useCallback, useRef } from "react";

// ── Helpers ───────────────────────────────────────────────────────────
// The app uses a custom auth system (sb_session in localStorage).
// The Supabase JS SDK client never receives the user's JWT, so SDK
// `.from()` calls run as anonymous. We resolve the token ourselves
// and use fetch() directly to PostgREST for writes that need auth.

function getSupabaseBase() {
  return import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, "");
}
function getAnonKey() {
  return import.meta.env.VITE_SUPABASE_ANON_KEY;
}
function isJwtExpired(token) {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    // Give a 30-second buffer to avoid race conditions near expiry
    return payload.exp * 1000 < Date.now() + 30_000;
  } catch {
    return true;
  }
}
async function resolveToken(supabase) {
  // Try SDK session first (works if setSession was called)
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token && !isJwtExpired(session.access_token)) return session.access_token;
  } catch {}
  // Fall back to custom session in localStorage — skip if expired
  try {
    const s = JSON.parse(localStorage.getItem("sb_session") || "null");
    if (s?.access_token && !isJwtExpired(s.access_token)) return s.access_token;
  } catch {}
  // Anon key as last resort (works for edge functions that use service role internally)
  return getAnonKey();
}

async function patchSiteSetting(key, value, token) {
  const url = `${getSupabaseBase()}/rest/v1/site_settings?key=eq.${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + token,
      "apikey": getAnonKey(),
      "Prefer": "return=minimal",
    },
    body: JSON.stringify({ value, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `PATCH failed (${res.status})`);
  }
}

// ─────────────────────────────────────────────────────────────────────

export function useDSEPriceFetch(supabase) {
  const [setting, setSetting] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState(null);
  const [fetchResult, setFetchResult] = useState(null);

  // Keep a ref so fetchNow always reads the latest setting without stale closure
  const settingRef = useRef(setting);
  useEffect(() => { settingRef.current = setting; }, [setting]);

  const loadSetting = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error: err } = await supabase
        .from("site_settings")
        .select("*")
        .eq("key", "auto_fetch_dse_prices")
        .single();

      if (err) {
        if (err.code === "PGRST116") {
          setSetting({ enabled: true, schedule: "30 13 * * 1-5", last_fetch_at: null, last_fetch_status: null, last_fetch_count: 0 });
        } else {
          throw err;
        }
      } else {
        setSetting(data.value);
      }
    } catch (e) {
      console.error("Failed to load DSE auto-fetch setting:", e);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    loadSetting();
  }, [loadSetting]);

  const toggleAutoFetch = useCallback(async () => {
    if (!setting) return;
    try {
      setToggling(true);
      setError(null);
      const newEnabled = !setting.enabled;
      const newValue = { ...setting, enabled: newEnabled };
      const token = await resolveToken(supabase);
      await patchSiteSetting("auto_fetch_dse_prices", newValue, token);
      setSetting(newValue);
    } catch (e) {
      console.error("Failed to toggle auto-fetch:", e);
      setError(e.message);
    } finally {
      setToggling(false);
    }
  }, [supabase, setting]);

  const fetchNow = useCallback(async (updatedBy = "Manual Fetch", cdsNumber = null) => {
    try {
      setFetching(true);
      setError(null);
      setFetchResult(null);

      // Edge function has verify_jwt:false and uses service role internally —
      // no auth token needed. Send anon key only as apikey header.
      const anonKey = getAnonKey();

      const body = { updated_by: updatedBy };
      if (cdsNumber) body.cds_number = cdsNumber;

      const res = await fetch(getSupabaseBase() + "/functions/v1/fetch-dse-prices", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": anonKey,
        },
        body: JSON.stringify(body),
      });

      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error || "Fetch failed");

      setFetchResult(result);
      // Use ref to get latest setting — avoids stale closure overwriting the toggle state
      const updatedValue = {
        ...settingRef.current,
        last_fetch_at: result.fetched_at,
        last_fetch_status: "success",
        last_fetch_count: result.updated_count,
      };
      const settingsToken = await resolveToken(supabase);
      await patchSiteSetting("auto_fetch_dse_prices", updatedValue, settingsToken);
      setSetting(updatedValue);
      return result;
    } catch (e) {
      console.error("Failed to fetch DSE prices:", e);
      setError(e.message);
      const current = settingRef.current;
      if (current) {
        const updatedValue = {
          ...current,
          last_fetch_at: new Date().toISOString(),
          last_fetch_status: "error: " + e.message,
        };
        try {
          const token = await resolveToken(supabase);
          await patchSiteSetting("auto_fetch_dse_prices", updatedValue, token);
        } catch {}
        setSetting(updatedValue);
      }
      return null;
    } finally {
      setFetching(false);
    }
  }, [supabase]); // no longer depends on setting — reads latest via settingRef

  return {
    enabled: setting?.enabled ?? true,
    loading,
    toggling,
    fetching,
    lastFetchAt: setting?.last_fetch_at ?? null,
    lastFetchStatus: setting?.last_fetch_status ?? null,
    lastFetchCount: setting?.last_fetch_count ?? 0,
    schedule: setting?.schedule ?? "30 13 * * 1-5",
    toggleAutoFetch,
    fetchNow,
    fetchResult,
    error,
    reload: loadSetting,
  };
}
