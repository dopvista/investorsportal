// ── src/hooks/useIdleLogout.js ─────────────────────────────────────
import { useEffect, useRef } from "react";
import { sbSignOut, getSession } from "../lib/supabase";

const IDLE_LIMIT_MS = 5 * 60 * 1000; // 5 minutes

export default function useIdleLogout({ enabled = true, onLogout } = {}) {
  const timerRef          = useRef(null);
  const isLoggingOutRef   = useRef(false);
  const lastActivityRef   = useRef(Date.now());
  const hiddenAtRef       = useRef(null); // timestamp when app went to background

  useEffect(() => {
    if (!enabled) return;
    if (!getSession()?.access_token) return;

    const clearExistingTimer = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const logoutNow = async () => {
      if (isLoggingOutRef.current) return;
      isLoggingOutRef.current = true;
      clearExistingTimer();
      try {
        await sbSignOut();
      } catch (_) {
        // Ignore remote logout failure — local session clear is handled in sbSignOut
      } finally {
        if (typeof onLogout === "function") {
          onLogout();
        } else {
          window.location.reload();
        }
      }
    };

    const startTimer = (remainingMs = IDLE_LIMIT_MS) => {
      clearExistingTimer();
      timerRef.current = setTimeout(async () => {
        // Double-check actual idle time in case timer fired early
        const idleTime = Date.now() - lastActivityRef.current;
        if (idleTime >= IDLE_LIMIT_MS) {
          await logoutNow();
        } else {
          // Timer fired early — restart with remaining time
          startTimer(IDLE_LIMIT_MS - idleTime);
        }
      }, remainingMs);
    };

    // ── User activity — resets the idle timer ──────────────────────
    const handleActivity = () => {
      if (!getSession()?.access_token) return;
      lastActivityRef.current = Date.now();
      hiddenAtRef.current = null; // clear any background timestamp on activity
      startTimer();
    };

    // ── Visibility change — handles backgrounding/foregrounding ────
    // FIX: visibilitychange is NOT treated as user activity.
    // When hidden  → record when app went to background, clear timer
    //   (setTimeout is unreliable when backgrounded on mobile)
    // When visible → check total elapsed idle time and act accordingly
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        // App going to background — record the time, pause timer
        hiddenAtRef.current = Date.now();
        clearExistingTimer();
      } else {
        // App coming back to foreground
        if (!getSession()?.access_token) return;

        const now = Date.now();

        if (hiddenAtRef.current !== null) {
          // Add the backgrounded duration to idle time by backdating lastActivity
          // We do NOT update lastActivityRef here — background time counts as idle
          const backgroundDuration = now - hiddenAtRef.current;
          const idleTime = now - lastActivityRef.current;

          hiddenAtRef.current = null;

          if (idleTime >= IDLE_LIMIT_MS) {
            // Already past idle limit — logout immediately
            logoutNow();
            return;
          }

          // Restart timer with remaining idle time
          const remaining = IDLE_LIMIT_MS - idleTime;
          startTimer(remaining);
        } else {
          // No background recorded — just restart normally
          startTimer();
        }
      }
    };

    const activityEvents = [
      "mousemove",
      "mousedown",
      "keydown",
      "scroll",
      "touchstart",
      "click",
    ];

    activityEvents.forEach((e) =>
      window.addEventListener(e, handleActivity, { passive: true })
    );

    // visibilitychange has its own dedicated handler — NOT handleActivity
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Kick off
    lastActivityRef.current = Date.now();
    startTimer();

    return () => {
      clearExistingTimer();
      activityEvents.forEach((e) =>
        window.removeEventListener(e, handleActivity)
      );
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [enabled, onLogout]);
}
