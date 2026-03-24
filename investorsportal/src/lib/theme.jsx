// ── src/lib/theme.jsx ─────────────────────────────────────────────
import { createContext, useCallback, useContext, useEffect, useState } from "react";

// ── Light theme ────────────────────────────────────────────────────
// Brand colors (navy, green, gold, red) are untouched.
// Backgrounds shifted from pure white to soft blue-gray for eye comfort.
// Text pulled back from near-black to dark charcoal (15:1 vs 19:1 contrast).
export const LIGHT_C = {
  navy:       "#0B1F3A",  // brand — unchanged
  navyLight:  "#132844",  // brand — unchanged
  green:      "#00843D",  // brand — unchanged
  greenLight: "#00a34c",  // brand — unchanged
  gold:       "#F59E0B",  // brand — unchanged
  red:        "#EF4444",  // brand — unchanged
  redBg:      "#FEF2F2",  // unchanged
  greenBg:    "#F0FDF4",  // unchanged
  white:      "#FAFBFC",  // pure white → barely off-white, less harsh on cards
  gray50:     "#F0F4F8",  // page background — softened for eye comfort
  gray100:    "#E8EDF3",  // section headers — slightly more depth/separation
  gray200:    "#D4DCE6",  // borders — crisper card definition
  gray400:    "#94A3B8",  // unchanged
  gray500:    "#64748B",  // unchanged
  gray600:    "#475569",  // unchanged
  gray800:    "#1E293B",  // unchanged
  text:       "#182235",  // near-black → dark charcoal, 15:1 contrast (was #0F172A)
};

// ── Dark theme ─────────────────────────────────────────────────────
// Navy sidebar is intentionally unchanged — it is a brand anchor.
// Page bg lifted from abyss-black to elevated dark (Notion/Linear approach).
// Text pulled from near-white 95% to comfortable 82% — biggest fatigue reducer.
// Accent colors slightly warmed/desaturated — less neon on dark surfaces.
export const DARK_C = {
  navy:       "#0B1F3A",  // sidebar brand color — intentionally unchanged
  navyLight:  "#132844",  // unchanged
  green:      "#28C062",  // warmer, clearly visible, not neon (was #00a84e)
  greenLight: "#32D670",  // matches green shift (was #00c45a)
  gold:       "#F0B429",  // slightly warmer/amber, less electric-yellow (was #FBBF24)
  red:        "#EF6E6E",  // 1 shade softer, less alarming on dark (was #F87171)
  redBg:      "#2A1919",  // warmer dark red surface, distinct from page bg (was #2d1515)
  greenBg:    "#152B1E",  // brighter dark green surface, clearly visible (was #0d2318)
  white:      "#1D2E42",  // card surface — clearly lifts above page bg (was #1e293b)
  gray50:     "#141C27",  // page background — elevated dark, not abyss-black (was #0f172a)
  gray100:    "#1E2D3F",  // hover/subtle surfaces — perceptible step above bg (was #1a2535)
  gray200:    "#2C3E55",  // borders — more defined against dark surfaces (was #334155)
  gray400:    "#7A8FA6",  // muted text — was too dim to read (was #64748b)
  gray500:    "#96AABB",  // secondary text — slight warmth added (was #94a3b8)
  gray600:    "#AABDCC",  // body text — slight warmth (was #b0bec9)
  gray800:    "#C8D8E8",  // strong secondary — pulled back from near-white (was #dde6f0)
  text:       "#D0DCE8",  // main text — 82% white, biggest fatigue reducer (was #f1f5f9)
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
