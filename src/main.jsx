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
      isDark =
        window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
    }
    document.documentElement.setAttribute(
      "data-theme",
      isDark ? "dark" : "light"
    );
  } catch {}
})();

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
