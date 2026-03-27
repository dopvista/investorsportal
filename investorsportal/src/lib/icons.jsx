// ── src/lib/icons.jsx ─────────────────────────────────────────────
// Shared SVG icon system (Lucide-style). All UI icons should be
// rendered via <Icon name="..." /> for theme-aware, consistent sizing.
//
// Usage:
//   import { Icon, ICON_PATHS } from "../lib/icons";
//   <Icon name="shield" size={14} stroke={C.gray500} />

import React from "react";

/**
 * Render a Lucide-style SVG icon from the ICON_PATHS map.
 * @param {string} name       — key from ICON_PATHS
 * @param {number} [size=14]  — width & height in px
 * @param {string} [stroke]   — stroke color (defaults to currentColor)
 * @param {number} [sw=1.8]   — strokeWidth
 * @param {string} [className]
 * @param {object} [style]
 */
export function Icon({ name, size = 14, stroke = "currentColor", sw = 2, className, style }) {
  const paths = ICON_PATHS[name];
  if (!paths) {
    if (process.env.NODE_ENV !== "production") console.warn(`Icon: unknown name "${name}"`);
    return null;
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      style={style}
    >
      {paths.map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

/**
 * Icon inside a rounded-rect badge with themed background.
 * Use for section headers, stat cards, and anywhere icons need visual weight.
 * Automatically adapts opacity for dark/light themes when `isDark` is provided.
 *
 * @param {string}  name     — key from ICON_PATHS
 * @param {string}  color    — primary color (used for icon stroke + tinted bg)
 * @param {number}  [size=28] — outer badge size
 * @param {number}  [iconSize] — icon size (defaults to size * 0.5)
 * @param {number}  [radius=7] — border-radius
 * @param {boolean} [isDark]  — dark mode flag (increases contrast)
 * @param {object}  [style]  — extra styles on outer div
 */
export function IconBadge({ name, color, size = 28, iconSize, radius = 7, isDark, style }) {
  const iSize = iconSize || Math.round(size * 0.5);
  // Strong colored backgrounds for visibility in both themes
  const bgAlpha  = isDark ? "40" : "22";
  const bdrAlpha = isDark ? "60" : "40";
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: `${color}${bgAlpha}`,
        border: `1.5px solid ${color}${bdrAlpha}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        ...style,
      }}
    >
      <Icon name={name} size={iSize} stroke={color} sw={2.2} />
    </div>
  );
}

/**
 * All available icon paths, keyed by name.
 * Each value is an array of SVG <path> `d` attributes.
 */
export const ICON_PATHS = {
  // ── Navigation & Structure ─────────────────────────────────────
  home:         ["M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z", "M9 22V12h6v10"],
  menu:         ["M3 12h18", "M3 6h18", "M3 18h18"],
  chevronDown:  ["M6 9l6 6 6-6"],
  chevronRight: ["M9 18l6-6-6-6"],
  chevronLeft:  ["M15 18l-6-6 6-6"],
  x:            ["M18 6L6 18", "M6 6l12 12"],
  search:       ["M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16z", "M21 21l-4.35-4.35"],
  refresh:      ["M1 4v6h6", "M23 20v-6h-6", "M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"],
  externalLink: ["M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6", "M15 3h6v6", "M10 14L21 3"],

  // ── Security & Auth ────────────────────────────────────────────
  shield:       ["M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"],
  lock:         ["M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2z", "M7 11V7a5 5 0 0 1 10 0v4"],
  key:          ["M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.78 7.78 5.5 5.5 0 0 1 7.78-7.78zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"],
  fingerprint:  ["M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4", "M14 13.12c0 2.38 0 6.38-1 8.88", "M17.29 21.02c.12-.6.43-2.3.5-3.02", "M2 12a10 10 0 0 1 18-6", "M2 16h.01", "M21.8 16c.2-2 .131-5.354 0-6", "M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2", "M8.65 22c.21-.66.45-1.32.57-2", "M9 6.8a6 6 0 0 1 9 5.2v2"],
  eye:          ["M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z", "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"],
  eyeOff:       ["M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24", "M1 1l22 22"],

  // ── Users & People ─────────────────────────────────────────────
  user:         ["M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2", "M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"],
  users:        ["M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2", "M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z", "M23 21v-2a4 4 0 0 0-3-3.87", "M16 3.13a4 4 0 0 1 0 7.75"],

  // ── Buildings & Business ───────────────────────────────────────
  building:     ["M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18z", "M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2", "M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2", "M10 6h4", "M10 10h4", "M10 14h4", "M10 18h4"],
  briefcase:    ["M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z", "M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"],

  // ── Documents & Data ───────────────────────────────────────────
  clipboard:    ["M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2", "M15 2H9a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1z"],
  fileText:     ["M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z", "M14 2v6h6", "M16 13H8", "M16 17H8", "M10 9H8"],
  barChart:     ["M12 20V10", "M18 20V4", "M6 20v-4"],
  trendingUp:   ["M23 6l-9.5 9.5-5-5L1 18"],
  pieChart:     ["M21.21 15.89A10 10 0 1 1 8 2.83", "M22 12A10 10 0 0 0 12 2v10z"],

  // ── Actions ────────────────────────────────────────────────────
  edit:         ["M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7", "M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"],
  trash:        ["M3 6h18", "M19 6l-1 14H6L5 6", "M10 11v6", "M14 11v6", "M9 6V4h6v2"],
  save:         ["M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z", "M17 21v-8H7v8", "M7 3v5h8"],
  plus:         ["M12 5v14", "M5 12h14"],
  minus:        ["M5 12h14"],
  download:     ["M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", "M7 10l5 5 5-5", "M12 15V3"],
  upload:       ["M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", "M17 8l-5-5-5 5", "M12 3v12"],

  // ── Status & Feedback ──────────────────────────────────────────
  check:        ["M20 6L9 17l-5-5"],
  checkCircle:  ["M22 11.08V12a10 10 0 1 1-5.93-9.14", "M22 4L12 14.01l-3-3"],
  xCircle:      ["M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z", "M15 9l-6 6", "M9 9l6 6"],
  alertTriangle:["M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z", "M12 9v4", "M12 17h.01"],
  alertCircle:  ["M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z", "M12 8v4", "M12 16h.01"],
  info:         ["M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z", "M12 16v-4", "M12 8h.01"],
  ban:          ["M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z", "M4.93 4.93l14.14 14.14"],
  clock:        ["M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z", "M12 6v6l4 2"],
  hourglass:    ["M5 22h14", "M5 2h14", "M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22", "M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"],

  // ── Finance & Money ────────────────────────────────────────────
  dollarSign:   ["M12 1v22", "M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"],
  wallet:       ["M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4", "M4 6v12a2 2 0 0 0 2 2h14v-4", "M18 12a2 2 0 0 0 0 4h4v-4h-4z"],
  trophy:       ["M6 9H4.5a2.5 2.5 0 0 1 0-5H6", "M18 9h1.5a2.5 2.5 0 0 0 0-5H18", "M4 22h16", "M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20 7 22", "M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20 17 22", "M18 2H6v7a6 6 0 0 0 12 0V2z"],

  // ── Media ──────────────────────────────────────────────────────
  image:        ["M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z", "M8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z", "M21 15l-5-5L5 21"],
  camera:       ["M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z", "M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"],

  // ── Location ───────────────────────────────────────────────────
  mapPin:       ["M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z", "M12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"],
  globe:        ["M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z", "M2 12h20", "M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"],

  // ── Theme ──────────────────────────────────────────────────────
  sun:          ["M12 1v2", "M12 21v2", "M4.22 4.22l1.42 1.42", "M18.36 18.36l1.42 1.42", "M1 12h2", "M21 12h2", "M4.22 19.78l1.42-1.42", "M18.36 5.64l1.42-1.42", "M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z"],
  moon:         ["M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"],
  settings:     ["M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z", "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"],

  // ── Arrows & Navigation ────────────────────────────────────────
  arrowLeft:    ["M19 12H5", "M12 19l-7-7 7-7"],
  arrowRight:   ["M5 12h14", "M12 5l7 7-7 7"],
  arrowUp:      ["M12 19V5", "M5 12l7-7 7 7"],
  arrowDown:    ["M12 5v14", "M19 12l-7 7-7-7"],
  undo:         ["M3 7v6h6", "M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6.69 3L3 13"],

  // ── Misc ───────────────────────────────────────────────────────
  inbox:        ["M22 12h-6l-2 3H10l-2-3H2", "M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"],
  send:         ["M22 2L11 13", "M22 2l-7 20-4-9-9-4 20-7z"],
  pointUp:      ["M12 19V5", "M5 12l7-7 7 7"],
  filter:       ["M22 3H2l8 9.46V19l4 2v-8.54L22 3z"],
  tag:          ["M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z", "M7 7h.01"],
};

export default Icon;
