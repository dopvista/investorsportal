/** TZS amount formatting/parsing (no Intl dependency — identical output on all platforms). */

/** 1200000 → '1,200,000'. Negatives are shown as their absolute value (labels add context). */
export function fmt(n: number): string {
  const abs = Math.round(Math.abs(n));
  return String(abs).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** '1,200,000 TZS' → 1200000. Returns 0 for anything unparseable. */
export function parseAmt(s: string | number): number {
  const n = parseInt(String(s ?? '').replace(/[^0-9]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}
