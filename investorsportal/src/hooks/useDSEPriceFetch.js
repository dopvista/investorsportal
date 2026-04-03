// src/hooks/useDSEPriceFetch.js
// Hook for managing DSE price auto-fetch toggle, multi-time schedule, and manual fetch trigger

import { useState, useEffect, useCallback, useRef } from "react";

// ── Helpers ───────────────────────────────────────────────────────────
function getSupabaseBase() {
  return import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, "");
}
function getAnonKey() {
  return import.meta.env.VITE_SUPABASE_ANON_KEY;
}
function isJwtExpired(token) {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.exp * 1000 < Date.now() + 30_000;
  } catch {
    return true;
  }
}
let _tokenCache = null; // { token, expires }
async function resolveToken(supabase) {
  if (_tokenCache && Date.now() < _tokenCache.expires) return _tokenCache.token;
  let token;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token && !isJwtExpired(session.access_token)) token = session.access_token;
  } catch {}
  if (!token) {
    try {
      const s = JSON.parse(localStorage.getItem("sb_session") || "null");
      if (s?.access_token && !isJwtExpired(s.access_token)) token = s.access_token;
    } catch {}
  }
  token = token ?? getAnonKey();
  _tokenCache = { token, expires: Date.now() + 30_000 }; // cache for 30 s
  return token;
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

// ── Default setting shape ─────────────────────────────────────────────
// fetch_times: array of "HH:MM" strings (EAT)
// fetch_days:  "weekdays" | "everyday"
// Replaces the old single `schedule` cron string.
const DEFAULT_SETTING = {
  enabled: true,
  fetch_times: ["09:00", "15:00"],
  fetch_days: "weekdays",
  last_fetch_at: null,
  last_fetch_status: null,
  last_fetch_count: 0,
};

// ── Backwards compat: migrate old { schedule } shape ─────────────────
function migrateSetting(raw) {
  if (!raw) return DEFAULT_SETTING;
  // Already new shape
  if (Array.isArray(raw.fetch_times)) return { ...DEFAULT_SETTING, ...raw };
  // Old shape had a single `schedule` cron string — migrate gracefully
  return {
    ...DEFAULT_SETTING,
    enabled: raw.enabled ?? true,
    last_fetch_at: raw.last_fetch_at ?? null,
    last_fetch_status: raw.last_fetch_status ?? null,
    last_fetch_count: raw.last_fetch_count ?? 0,
  };
}

// ─────────────────────────────────────────────────────────────────────

export function useDSEPriceFetch(supabase) {
  const [setting, setSetting] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [error, setError] = useState(null);
  const [fetchResult, setFetchResult] = useState(null);

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
          setSetting(DEFAULT_SETTING);
        } else {
          throw err;
        }
      } else {
        setSetting(migrateSetting(data.value));
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
      const newValue = { ...setting, enabled: !setting.enabled };
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

  // Update fetch_times array (add or remove a time slot)
  const updateFetchTimes = useCallback(async (times) => {
    if (!setting) return;
    try {
      setSavingSchedule(true);
      setError(null);
      const newValue = { ...setting, fetch_times: times };
      const token = await resolveToken(supabase);
      await patchSiteSetting("auto_fetch_dse_prices", newValue, token);
      setSetting(newValue);
    } catch (e) {
      console.error("Failed to update fetch times:", e);
      setError(e.message);
    } finally {
      setSavingSchedule(false);
    }
  }, [supabase, setting]);

  // Update fetch_days ("weekdays" | "everyday")
  const updateFetchDays = useCallback(async (days) => {
    if (!setting) return;
    try {
      setSavingSchedule(true);
      setError(null);
      const newValue = { ...setting, fetch_days: days };
      const token = await resolveToken(supabase);
      await patchSiteSetting("auto_fetch_dse_prices", newValue, token);
      setSetting(newValue);
    } catch (e) {
      console.error("Failed to update fetch days:", e);
      setError(e.message);
    } finally {
      setSavingSchedule(false);
    }
  }, [supabase, setting]);

  const fetchNow = useCallback(async (updatedBy = "Manual Fetch") => {
    try {
      setFetching(true);
      setError(null);
      setFetchResult(null);

      const res = await fetch(getSupabaseBase() + "/functions/v1/fetch-dse-prices", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": getAnonKey(),
        },
        body: JSON.stringify({ updated_by: updatedBy }),
      });

      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error || "Fetch failed");

      setFetchResult(result);
      const updatedValue = {
        ...settingRef.current,
        last_fetch_at: result.fetched_at,
        last_fetch_status: "success",
        last_fetch_count: result.updated_count,
      };
      const token = await resolveToken(supabase);
      await patchSiteSetting("auto_fetch_dse_prices", updatedValue, token);
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
  }, [supabase]);

  return {
    enabled:         setting?.enabled         ?? true,
    fetchTimes:      setting?.fetch_times      ?? DEFAULT_SETTING.fetch_times,
    fetchDays:       setting?.fetch_days       ?? "weekdays",
    loading,
    toggling,
    fetching,
    savingSchedule,
    lastFetchAt:     setting?.last_fetch_at    ?? null,
    lastFetchStatus: setting?.last_fetch_status ?? null,
    lastFetchCount:  setting?.last_fetch_count  ?? 0,
    toggleAutoFetch,
    updateFetchTimes,
    updateFetchDays,
    fetchNow,
    fetchResult,
    error,
    reload: loadSetting,
  };
}
