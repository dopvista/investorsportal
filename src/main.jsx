// ── src/main.jsx ──────────────────────────────────────────────────
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { ThemeProvider } from "./lib/theme.jsx";

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

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>
);
