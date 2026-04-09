// src/hooks/useDSEAutoSync.js
// Client-side 1-minute auto-polling: calls existing edge function → syncs to CDS prices
// Only runs during market hours (Mon–Fri 09:00–16:00 EAT), pauses when tab is hidden.
// Respects the master switch in site_settings (SA System Settings).

import { useState, useEffect, useCallback, useRef } from "react";
import { sbCopyMarketPricesToCds } from "../lib/supabase";

const POLL_INTERVAL = 60_000; // 60 seconds
const STALENESS_MS  = 30_000; // skip edge function if companies updated within 30s
const SERVER_CHECK_INTERVAL = 5 * 60_000; // re-check server setting every 5 min

function getSupabaseBase() {
  return import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, "");
}
function getAnonKey() {
  return import.meta.env.VITE_SUPABASE_ANON_KEY;
}

/** True when EAT is weekday 09:00–16:00 */
function isMarketOpen() {
  const now = new Date();
  const eatMs = now.getTime() + 3 * 60 * 60 * 1000;
  const eat = new Date(eatMs);
  const day = eat.getUTCDay();   // 0=Sun, 6=Sat
  const hour = eat.getUTCHours();
  if (day === 0 || day === 6) return false;
  return hour >= 9 && hour < 16;
}

/** Check if another client already updated companies within STALENESS_MS */
async function isCompaniesStale() {
  try {
    const res = await fetch(
      `${getSupabaseBase()}/rest/v1/companies?select=updated_at&order=updated_at.desc&limit=1`,
      { headers: { "apikey": getAnonKey(), "Accept": "application/json" } },
    );
    if (!res.ok) return true;
    const rows = await res.json();
    if (!rows.length || !rows[0].updated_at) return true;
    return Date.now() - new Date(rows[0].updated_at).getTime() > STALENESS_MS;
  } catch {
    return true;
  }
}

/** Fetch the master enabled flag from site_settings */
async function fetchServerEnabled() {
  try {
    const res = await fetch(
      `${getSupabaseBase()}/rest/v1/site_settings?key=eq.auto_fetch_dse_prices&select=value`,
      { headers: { "apikey": getAnonKey(), "Accept": "application/json" } },
    );
    if (!res.ok) return true; // assume enabled on error
    const rows = await res.json();
    if (!rows.length || !rows[0].value) return true;
    return rows[0].value.enabled !== false;
  } catch {
    return true; // assume enabled on error
  }
}

export function useDSEAutoSync(cdsNumber, onSyncComplete) {
  const [enabled, setEnabled]       = useState(() => {
    try { return localStorage.getItem("dse_auto_sync") !== "off"; } catch { return true; }
  });
  const [serverEnabled, setServerEnabled] = useState(true); // master switch from SA
  const [serverLoading, setServerLoading] = useState(true);
  const [syncing, setSyncing]       = useState(false);
  const [lastSynced, setLastSynced] = useState(null);
  const [lastCount, setLastCount]   = useState(0);
  const [error, setError]           = useState(null);

  const mountedRef    = useRef(true);
  const timerRef      = useRef(null);
  const serverTimerRef = useRef(null);
  const syncingRef    = useRef(false);
  const enabledRef    = useRef(enabled);
  const serverRef     = useRef(serverEnabled);
  const onSyncRef     = useRef(onSyncComplete);

  useEffect(() => { enabledRef.current = enabled; }, [enabled]);
  useEffect(() => { serverRef.current = serverEnabled; }, [serverEnabled]);
  useEffect(() => { onSyncRef.current = onSyncComplete; }, [onSyncComplete]);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // ── Check master switch on mount + every 5 min ──────────────────
  const checkServer = useCallback(async () => {
    const val = await fetchServerEnabled();
    if (mountedRef.current) {
      setServerEnabled(val);
      setServerLoading(false);
    }
  }, []);

  useEffect(() => {
    checkServer();
    serverTimerRef.current = setInterval(checkServer, SERVER_CHECK_INTERVAL);
    return () => clearInterval(serverTimerRef.current);
  }, [checkServer]);

  // The effective enabled state: user toggle AND server master switch
  const active = enabled && serverEnabled;
  const activeRef = useRef(active);
  useEffect(() => { activeRef.current = active; }, [active]);

  const doSync = useCallback(async (force = false) => {
    if (!activeRef.current || !cdsNumber) return;
    if (syncingRef.current) return;

    try {
      syncingRef.current = true;
      if (mountedRef.current) setSyncing(true);

      // Only call DSE edge function during market hours (avoids stale API hits after close)
      const marketOpen = isMarketOpen();
      const stale = marketOpen && await isCompaniesStale();
      if (stale) {
        const res = await fetch(getSupabaseBase() + "/functions/v1/fetch-dse-prices", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + getAnonKey(),
            "apikey": getAnonKey(),
          },
          body: JSON.stringify({ updated_by: "Auto Sync" }),
        });
        const result = await res.json();
        if (!mountedRef.current) return;

        if (!res.ok || !result.success) {
          setError(result.error || "Fetch failed");
          return;
        }
      }

      const copyResult = await sbCopyMarketPricesToCds(cdsNumber, "Auto Sync");
      if (!mountedRef.current) return;

      setLastSynced(new Date().toISOString());
      setLastCount(copyResult.updatedCount || 0);
      setError(null);
      if (onSyncRef.current) onSyncRef.current();
    } catch (e) {
      if (mountedRef.current) setError(e.message);
    } finally {
      syncingRef.current = false;
      if (mountedRef.current) setSyncing(false);
    }
  }, [cdsNumber]);

  const scheduleNext = useCallback(() => {
    timerRef.current = setTimeout(async () => {
      await doSync();
      if (activeRef.current && mountedRef.current) scheduleNext();
    }, POLL_INTERVAL);
  }, [doSync]);

  const clearTimer = useCallback(() => {
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  // Start/stop polling based on effective active state
  useEffect(() => {
    if (!active || !cdsNumber) {
      clearTimer();
      return;
    }

    doSync(true);
    scheduleNext();

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        clearTimer();
      } else if (activeRef.current && !syncingRef.current) {
        doSync(true);
        scheduleNext();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearTimer();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [active, cdsNumber, doSync, scheduleNext, clearTimer]);

  const toggle = useCallback(() => {
    setEnabled(prev => {
      const next = !prev;
      try { localStorage.setItem("dse_auto_sync", next ? "on" : "off"); } catch {}
      return next;
    });
  }, []);

  return {
    enabled,           // user's local toggle
    serverEnabled,     // master switch from SA
    serverLoading,     // true while checking server on mount
    active,            // effective: enabled && serverEnabled
    syncing,
    lastSynced,
    lastCount,
    error,
    toggle,
  };
}
