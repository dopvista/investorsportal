// ── src/hooks/useIdleLogout.js ─────────────────────────────────────
//
// Cross-platform idle logout — reliably handles:
//   • iOS Safari / PWA  — JS is FROZEN in background; setTimeout pauses
//   • Android Chrome    — same JS-freeze + aggressive tab throttling
//   • MacBook/Windows   — system sleep pauses all JS execution
//   • iOS PWA kill      — process killed & relaunched; all JS state is lost
//   • Multiple tabs     — BroadcastChannel propagates logout to every tab
//   • Cross-tab session — storage event detects session cleared elsewhere
//
// Strategy
// ──────────
// Wall-clock time in localStorage is the ground truth.
// setTimeout is used only as a convenience for the normal (foreground) case.
// Every "page resumes" path (visibilitychange, pageshow, focus) immediately
// reads the persistent timestamp and acts — regardless of what the timer said.
//
import { useEffect, useRef } from "react";
import { sbSignOut, getSession } from "../lib/supabase";

// ── Constants ─────────────────────────────────────────────────────
const IDLE_LIMIT_MS   = 5 * 60 * 1000; // 5 minutes
const SAFETY_CHECK_MS = 20 * 1000;      // background safety-net poll (20 s)
const STORAGE_KEY     = "app_idle_ts";  // localStorage key for last-activity
const BC_NAME         = "app_session";  // BroadcastChannel name

// ── Persistent timestamp helpers ──────────────────────────────────
// localStorage survives:
//   • JS suspension on iOS / Android background
//   • Device sleep (Mac, Windows, mobile)
//   • iOS PWA process kills and relaunches
// Unlike sessionStorage it is NOT wiped on process restart, giving us
// a reliable record of when the user was last active.

function tsRead() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    // Absent key → treat as "just now" so a fresh boot is never an instant logout
    return v ? parseInt(v, 10) : Date.now();
  } catch {
    return Date.now();
  }
}

function tsWrite(t = Date.now()) {
  try { localStorage.setItem(STORAGE_KEY, String(t)); } catch {}
}

function tsClear() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

// ── Idle check helper ──────────────────────────────────────────────
function isIdleNow() {
  return Date.now() - tsRead() >= IDLE_LIMIT_MS;
}

function remainingMs() {
  return Math.max(0, IDLE_LIMIT_MS - (Date.now() - tsRead()));
}

// ══════════════════════════════════════════════════════════════════
export default function useIdleLogout({ enabled = true, onLogout } = {}) {
  // Keep latest callback reference without re-running the effect
  const onLogoutRef     = useRef(onLogout);
  const enabledRef      = useRef(enabled);
  const timerRef        = useRef(null);
  const intervalRef     = useRef(null);
  const isLoggingOutRef = useRef(false);
  const bcRef           = useRef(null);

  useEffect(() => { onLogoutRef.current  = onLogout;  }, [onLogout]);
  useEffect(() => { enabledRef.current   = enabled;   }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    // ── Helpers ───────────────────────────────────────────────────
    const clearTimer    = () => { clearTimeout(timerRef.current);     timerRef.current    = null; };
    const clearInterval = () => { window.clearInterval(intervalRef.current); intervalRef.current = null; };

    // ── Logout ────────────────────────────────────────────────────
    const logoutNow = async () => {
      if (isLoggingOutRef.current) return;
      isLoggingOutRef.current = true;
      clearTimer();
      clearInterval();
      tsClear();

      // Notify all other tabs in the same origin before signing out
      try { bcRef.current?.postMessage({ type: "IDLE_LOGOUT" }); } catch {}

      try { await sbSignOut(); } catch {
        // Remote logout failure is non-critical — local session is already
        // cleared by sbSignOut internally. Continue with the callback.
      }

      const cb = onLogoutRef.current;
      if (typeof cb === "function") cb();
      else window.location.reload();
    };

    // ── Start / restart timer ─────────────────────────────────────
    // Always derives the delay from the persistent timestamp so the timer
    // fires at the correct wall-clock moment even after a short background gap.
    const startTimer = () => {
      clearTimer();
      const rem = remainingMs();
      if (rem === 0) { logoutNow(); return; }
      timerRef.current = setTimeout(() => {
        // Verify with ground-truth timestamp before acting — the timer could
        // have fired slightly early due to JS timer imprecision.
        if (isIdleNow()) logoutNow();
        else startTimer(); // activity happened just before timeout fired
      }, rem + 50); // +50 ms buffer to avoid sub-millisecond races
    };

    // ── Safety-net interval ───────────────────────────────────────
    // Runs every 20 seconds while the page is visible.
    // Catches the edge case where setTimeout is suppressed (some browsers
    // throttle timers in background tabs that have since become foreground).
    const startSafetyInterval = () => {
      clearInterval();
      intervalRef.current = window.setInterval(() => {
        if (!document.hidden && isIdleNow()) logoutNow();
      }, SAFETY_CHECK_MS);
    };

    // ── Activity handler ──────────────────────────────────────────
    // Updates the persistent timestamp and resets the timer.
    const handleActivity = () => {
      if (!enabledRef.current || isLoggingOutRef.current) return;
      // Fast O(1) session check from in-memory cache (see supabase.js)
      if (!getSession()?.access_token) return;
      tsWrite(); // persist wall-clock "now" to localStorage
      startTimer();
    };

    // ── Resume handler — the critical cross-platform path ─────────
    // Called whenever the page transitions from invisible → visible, or
    // whenever the window regains OS focus.
    //
    // Why this matters:
    //   iOS / Android : JS was completely frozen → timer never ran
    //   MacBook sleep : system clock advanced; JS timer did not
    //   PWA relaunch  : in-memory state gone; must read from localStorage
    //
    // In ALL of these cases the persistent timestamp tells the truth.
    const handleResume = () => {
      if (!enabledRef.current || isLoggingOutRef.current) return;
      if (!getSession()?.access_token) return;
      if (document.hidden) return; // guard: still not visible

      if (isIdleNow()) {
        logoutNow(); // past the limit — logout immediately
      } else {
        startTimer(); // not idle yet — restart timer with correct remaining time
      }
    };

    // ── Visibility change ─────────────────────────────────────────
    // Fired on: tab switch, app to background, screen lock (most platforms)
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        // Stop the timer — it is unreliable in background.
        // The localStorage timestamp continues reflecting the last activity.
        clearTimer();
      } else {
        // Page is visible again — run the resume check immediately.
        handleResume();
      }
    };

    // ── Cross-tab logout (BroadcastChannel) ───────────────────────
    // When any tab in this origin performs an idle logout, all other
    // open tabs receive this message and clean up their state.
    try {
      bcRef.current = new BroadcastChannel(BC_NAME);
      bcRef.current.onmessage = (e) => {
        if (e.data?.type === "IDLE_LOGOUT" && !isLoggingOutRef.current) {
          // Another tab already called sbSignOut — just clean up locally.
          isLoggingOutRef.current = true;
          clearTimer();
          clearInterval();
          tsClear();
          const cb = onLogoutRef.current;
          if (typeof cb === "function") cb();
        }
      };
    } catch {
      bcRef.current = null; // BroadcastChannel not available (some old browsers)
    }

    // ── Cross-tab storage event ───────────────────────────────────
    // Fired when localStorage is modified by ANOTHER tab (same origin).
    // If the session key is cleared (logout from another tab) we react.
    const handleStorage = (e) => {
      if (e.key === "sb_session" && !e.newValue && !isLoggingOutRef.current) {
        isLoggingOutRef.current = true;
        clearTimer();
        clearInterval();
        tsClear();
        const cb = onLogoutRef.current;
        if (typeof cb === "function") cb();
      }
    };

    // ── Activity events ───────────────────────────────────────────
    // Covers desktop (mouse/keyboard) + all touch devices (iOS, Android)
    // + pointer API (unified mouse + touch + stylus on modern browsers).
    const ACTIVITY_EVENTS = [
      "mousedown",   // desktop click / drag start
      "mousemove",   // desktop cursor movement
      "keydown",     // desktop keyboard
      "wheel",       // desktop scroll wheel
      "scroll",      // scroll (desktop + mobile momentum scroll)
      "touchstart",  // iOS / Android touch begin — most reliable touch signal
      "touchend",    // touch lift (catches quick taps missed by touchstart)
      "pointerdown", // unified pointer API (mouse + touch + stylus)
      "click",       // catches tap on mobile where touchstart may be suppressed
    ];

    ACTIVITY_EVENTS.forEach((ev) =>
      window.addEventListener(ev, handleActivity, { passive: true })
    );

    // Resume-detection events (all wired to the same handler)
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // pageshow fires when page is restored from the back-forward cache
    // (bfcache) — common on iOS Safari and Chrome mobile when the user
    // navigates back to the app.
    window.addEventListener("pageshow", handleResume);

    // window.focus fires when:
    //   • The user switches back to this browser window from another app
    //   • MacBook lid closes and opens (OS focus is returned to the browser)
    //   • Windows PC wakes from sleep and the browser is foreground
    window.addEventListener("focus",    handleResume);
    window.addEventListener("storage",  handleStorage);

    // ── Boot sequence ─────────────────────────────────────────────
    // On first mount (or remount after enable), check the persistent timestamp
    // BEFORE starting any timer. This handles:
    //   • iOS PWA that was killed and relaunched after being idle
    //   • Any scenario where the hook mounts with a stale timestamp
    if (isIdleNow()) {
      // Already past the idle limit — schedule logout after React settles.
      // setTimeout(0) ensures the component tree is fully mounted first.
      timerRef.current = setTimeout(logoutNow, 0);
    } else {
      // Ensure the storage key exists (first boot after login writes it)
      if (!localStorage.getItem(STORAGE_KEY)) tsWrite();
      startTimer();
      startSafetyInterval();
    }

    // ── Cleanup ───────────────────────────────────────────────────
    return () => {
      clearTimer();
      clearInterval();
      ACTIVITY_EVENTS.forEach((ev) => window.removeEventListener(ev, handleActivity));
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pageshow",  handleResume);
      window.removeEventListener("focus",     handleResume);
      window.removeEventListener("storage",   handleStorage);
      try { bcRef.current?.close(); bcRef.current = null; } catch {}
    };
  }, [enabled]); // re-run only when enabled toggles — everything else via refs
}
