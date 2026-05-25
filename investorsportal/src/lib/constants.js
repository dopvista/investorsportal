// ── src/lib/constants.js ──────────────────────────────────────────
export const ROLE_META = {
  SA: { label: "Super Admin",  color: "#0A2540" },
  AD: { label: "Admin",        color: "#1E3A5F" },
  DE: { label: "Data Entrant", color: "#1D4ED8" },
  VR: { label: "Verifier",     color: "#065F46" },
  RO: { label: "Read Only",    color: "#374151" },
};

// ── Time zone ─────────────────────────────────────────────────────
// The Investors Portal serves Dar es Salaam (DSE listed companies) and the
// business day is defined in East Africa Time. EAT is a fixed UTC+3 offset
// (no DST), but we still go through Intl so a future move to anywhere with
// DST will not require revisiting these call sites.
export const APP_TZ = "Africa/Dar_es_Salaam";

const _dateFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TZ, year: "numeric", month: "2-digit", day: "2-digit",
});

// Returns today's date in the app's time zone as a "YYYY-MM-DD" ISO date
// string. Use everywhere a "today" comparison is done against stored ISO
// date columns (transaction.date, dividend.closure_date, etc.) — going
// through `new Date().toISOString().split("T")[0]` instead would give UTC's
// "today", which is off by up to 3 hours and can flip the wrong way around
// midnight EAT.
export function todayInAppTz() {
  return _dateFmt.format(new Date()); // en-CA renders as YYYY-MM-DD
}

// Parses a stored "YYYY-MM-DD" ISO date string into a Date that represents
// midnight EAT — avoids the "off by one day" shift you get from
// `new Date("2026-04-12")` (which is parsed as UTC midnight, then displayed
// in browser TZ).
export function parseIsoDateInAppTz(iso) {
  if (!iso || typeof iso !== "string") return null;
  // Already includes a time? Trust it.
  if (iso.includes("T")) return new Date(iso);
  // Date-only: pin to the EAT offset (UTC+3) so the resulting Date lands on
  // the same calendar day everywhere.
  return new Date(iso + "T00:00:00+03:00");
}
