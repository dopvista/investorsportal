// ── src/lib/theme.jsx ─────────────────────────────────────────────
import { createContext, useCallback, useContext, useEffect, useState } from "react";

// ── Light theme (original app colors) ─────────────────────────────
export const LIGHT_C = {
  navy:       "#0B1F3A",
  navyLight:  "#132844",
  green:      "#00843D",
  greenLight: "#00a34c",
  gold:       "#F59E0B",
  red:        "#EF4444",
  redBg:      "#FEF2F2",
  greenBg:    "#F0FDF4",
  white:      "#FFFFFF",
  gray50:     "#F8FAFC",
  gray100:    "#F1F5F9",
  gray200:    "#E2E8F0",
  gray400:    "#94A3B8",
  gray500:    "#64748B",
  gray600:    "#475569",
  gray800:    "#1E293B",
  text:       "#0F172A",
};

// ── Dark theme ─────────────────────────────────────────────────────
export const DARK_C = {
  navy:       "#0B1F3A",   // sidebar stays dark navy — intentional
  navyLight:  "#132844",
  green:      "#00a84e",   // slightly brighter for dark bg visibility
  greenLight: "#00c45a",
  gold:       "#FBBF24",   // brighter gold for dark bg
  red:        "#F87171",   // softer red on dark
  redBg:      "#2d1515",   // dark red surface
  greenBg:    "#0d2318",   // dark green surface
  white:      "#1e293b",   // dark card / modal surface
  gray50:     "#0f172a",   // page background (darkest)
  gray100:    "#1a2535",   // subtle surface / hover
  gray200:    "#334155",   // border
  gray400:    "#64748b",   // muted text
  gray500:    "#94a3b8",   // secondary text
  gray600:    "#b0bec9",   // body text
  gray800:    "#dde6f0",   // strong secondary text
  text:       "#f1f5f9",   // main text
};

// ── Helpers ────────────────────────────────────────────────────────
function resolveIsDark(setting) {
  if (setting === "dark")  return true;
  if (setting === "light") return false;
  // "default" → follow system preference
  return typeof window !== "undefined"
    ? (window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false)
    : false;
}

function getSavedTheme() {
  try { return localStorage.getItem("app_theme") || "default"; }
  catch { return "default"; }
}

// ── Context ────────────────────────────────────────────────────────
const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(getSavedTheme);
  const [isDark, setIsDark]   = useState(() => resolveIsDark(getSavedTheme()));

  // Sync isDark + <html data-theme> whenever theme setting changes
  useEffect(() => {
    const next = resolveIsDark(theme);
    setIsDark(next);
    document.documentElement.setAttribute("data-theme", next ? "dark" : "light");
  }, [theme]);

  // Watch system preference when in "default" mode
  useEffect(() => {
    if (theme !== "default") return;
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return;
    const handler = (e) => {
      setIsDark(e.matches);
      document.documentElement.setAttribute("data-theme", e.matches ? "dark" : "light");
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  const setTheme = useCallback((newTheme) => {
    try { localStorage.setItem("app_theme", newTheme); } catch {}
    setThemeState(newTheme);
  }, []);

  return (
    <ThemeContext.Provider value={{ C: isDark ? DARK_C : LIGHT_C, theme, setTheme, isDark }}>
      {children}
    </ThemeContext.Provider>
  );
}

// ── Hook ───────────────────────────────────────────────────────────
// Components outside ThemeProvider (LoginPage, ResetPasswordPage, etc.)
// automatically get the light theme as fallback — no changes needed there.
export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) return { C: LIGHT_C, theme: "default", setTheme: () => {}, isDark: false };
  return ctx;
}
