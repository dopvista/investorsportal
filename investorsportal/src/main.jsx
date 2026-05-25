// ── src/main.jsx ──────────────────────────────────────────────────
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { ThemeProvider } from "./lib/theme.jsx";
import { registerSW } from "virtual:pwa-register";
import ErrorBoundary from "./components/ErrorBoundary.jsx";

// ── Apply saved theme BEFORE first paint to prevent flash ─────────
(function () {
  try {
    const setting = localStorage.getItem("app_theme") || "default";
    let isDark = false;
    if (setting === "dark") {
      isDark = true;
    } else if (setting === "default") {
      isDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
    }
    document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
  } catch {}
})();

// ── Global error handlers ─────────────────────────────────────────
// React's ErrorBoundary only catches synchronous render errors.
// These two handlers catch everything else:
//
// 1. unhandledrejection — Promise rejections that were never .catch()'d.
//    Most common source: async functions in useEffect, event handlers,
//    and Supabase calls that throw outside a try/catch.
//
// 2. error — Uncaught synchronous exceptions thrown outside the React
//    tree (e.g. in setTimeout callbacks, event listeners, PWA handlers).
//
// Both log a structured error in production and are no-ops in dev
// (Vite's overlay already surfaces these during development).
window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;
  // Ignore benign AbortErrors — these are emitted whenever we cancel an
  // in-flight request (CDS switch, modal close, route change). They are not
  // bugs and would otherwise drown the console.
  const name = reason?.name || "";
  const msg  = reason instanceof Error ? reason.message : String(reason || "");
  if (name === "AbortError" || /aborted|cancelled|signal is aborted/i.test(msg)) return;

  console.error(
    "[App] Unhandled Promise Rejection:",
    msg,
    reason instanceof Error ? reason.stack : ""
  );
  // Do NOT call event.preventDefault() — we want the browser to still
  // mark the promise as handled so DevTools can show it correctly.
});

window.addEventListener("error", (event) => {
  // Guard: ignore ResizeObserver loop errors — these are benign browser
  // noise on some platforms and have no impact on app behaviour.
  if (event.message?.includes("ResizeObserver loop")) return;

  console.error(
    "[App] Uncaught Error:",
    event.message,
    `\n  at ${event.filename}:${event.lineno}:${event.colno}`,
    event.error?.stack || ""
  );
});

// ── Capture install prompt as early as possible ───────────────────
// beforeinstallprompt fires very early — often before React mounts.
// We capture it here at module level so InstallBanner can always read it.
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  window.__installPrompt = e;
  window.dispatchEvent(new Event("installprompt:ready"));
}, { once: true });

// ── Register PWA service worker ───────────────────────────────────
const updateSW = registerSW({
  immediate: true,
  onOfflineReady() {
    console.log("PWA ready: cached content available offline.");
    window.dispatchEvent(new CustomEvent("pwa:offline-ready"));
  },
  onNeedRefresh() {
    console.log("New version available. Refresh to update.");
    window.dispatchEvent(new CustomEvent("pwa:update-available"));
  },
});

window.__APP_UPDATE_SW__ = updateSW;

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
