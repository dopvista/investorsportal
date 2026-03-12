import { useEffect, useRef } from "react";
import { sbSignOut, getSession } from "../lib/supabase";

const IDLE_LIMIT_MS = 5 * 60 * 1000; // 5 minutes

export default function useIdleLogout({ enabled = true, onLogout } = {}) {
  const timerRef = useRef(null);
  const isLoggingOutRef = useRef(false);
  const lastActivityRef = useRef(Date.now());

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

      try {
        await sbSignOut();
      } catch (_) {
        // Ignore remote logout failure; local session clear is handled in sbSignOut
      } finally {
        if (typeof onLogout === "function") {
          onLogout();
        } else {
          window.location.reload();
        }
      }
    };

    const startTimer = () => {
      clearExistingTimer();

      timerRef.current = setTimeout(async () => {
        const now = Date.now();
        const idleTime = now - lastActivityRef.current;

        if (idleTime >= IDLE_LIMIT_MS) {
          await logoutNow();
        } else {
          startTimer();
        }
      }, IDLE_LIMIT_MS);
    };

    const handleActivity = () => {
      if (!getSession()?.access_token) return;
      lastActivityRef.current = Date.now();
      startTimer();
    };

    const events = [
      "mousemove",
      "mousedown",
      "keydown",
      "scroll",
      "touchstart",
      "click",
    ];

    events.forEach((eventName) => {
      window.addEventListener(eventName, handleActivity, { passive: true });
    });

    document.addEventListener("visibilitychange", handleActivity);

    lastActivityRef.current = Date.now();
    startTimer();

    return () => {
      clearExistingTimer();

      events.forEach((eventName) => {
        window.removeEventListener(eventName, handleActivity);
      });

      document.removeEventListener("visibilitychange", handleActivity);
    };
  }, [enabled, onLogout]);
}
