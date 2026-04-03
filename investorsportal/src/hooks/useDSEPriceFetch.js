// src/hooks/useDSEPriceFetch.js
// Hook for managing DSE price auto-fetch toggle and manual fetch trigger

import { useState, useEffect, useCallback, useRef } from "react";

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
          setSetting({ enabled: false, schedule: "0 12 * * 1-5", last_fetch_at: null, last_fetch_status: null, last_fetch_count: 0 });
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
      const { error: err } = await supabase
        .from("site_settings")
        .update({ value: newValue, updated_at: new Date().toISOString() })
        .eq("key", "auto_fetch_dse_prices");
      if (err) throw err;
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

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, "");
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || anonKey;

      const body = { updated_by: updatedBy };
      if (cdsNumber) body.cds_number = cdsNumber;

      const res = await fetch(supabaseUrl + "/functions/v1/fetch-dse-prices", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + token,
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
      await supabase
        .from("site_settings")
        .update({ value: updatedValue, updated_at: new Date().toISOString() })
        .eq("key", "auto_fetch_dse_prices");
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
        await supabase
          .from("site_settings")
          .update({ value: updatedValue, updated_at: new Date().toISOString() })
          .eq("key", "auto_fetch_dse_prices")
          .catch(() => {});
        setSetting(updatedValue);
      }
      return null;
    } finally {
      setFetching(false);
    }
  }, [supabase]); // no longer depends on setting — reads latest via settingRef

  return {
    enabled: setting?.enabled ?? false,
    loading,
    toggling,
    fetching,
    lastFetchAt: setting?.last_fetch_at ?? null,
    lastFetchStatus: setting?.last_fetch_status ?? null,
    lastFetchCount: setting?.last_fetch_count ?? 0,
    schedule: setting?.schedule ?? "0 12 * * 1-5",
    toggleAutoFetch,
    fetchNow,
    fetchResult,
    error,
    reload: loadSetting,
  };
      }
