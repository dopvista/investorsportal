/**
 * Merging two copies of the ledger (this phone vs the cloud).
 *
 * Why a real merge instead of last-write-wins: both phones can record payments
 * while offline. Overwriting one side with the other would silently destroy
 * money that was actually collected.
 *
 * The rules, and why they are safe:
 *
 * 1. txns — union by `id`. Payments are append-mostly and each carries a unique
 *    id, so the union is exactly "every payment either phone knows about". When
 *    the same id exists on both sides the fields can still differ (editTenant
 *    renames the tenant on historical rows), so the newer side wins that row.
 *
 * 2. units — a unit's `nextDue` is NOT merged. It is derived: applyPayment
 *    advances it by each payment's months, and computeCovers walks exactly the
 *    same path from `leaseStart`. So after the txns are merged we RECOMPUTE
 *    nextDue from the merged ledger. Picking one side's nextDue would either
 *    lose or double-count coverage.
 *    The remaining unit fields (tenant, rent, kin, leaseStart) are edits rather
 *    than accumulations, so the newer side wins those.
 *
 * 3. company — a small edited record: newer side wins.
 *
 * Known, accepted limitation: two payments on the same unit with the same date
 * can end up ordered differently than on either phone, because insertion order
 * is not shared between devices. That only affects each row's cosmetic "covers"
 * label — the month total, and therefore the balance, is identical either way.
 */
import { addMonths } from './dates';
import { rentTxnsFor, txnMonths } from './engine';
import type { Company, Txn, Unit } from './types';

export interface Ledger {
  units: Unit[];
  txns: Txn[];
  company: Company;
}

/**
 * The nextDue implied by a unit's lease start plus every payment its CURRENT
 * tenant has made. Mirrors the cursor walk in computeCovers/applyPayment.
 */
export function recomputeNextDue(unit: Unit, txns: Txn[]): string {
  const months = rentTxnsFor(txns, unit.id, unit.tenant).reduce((n, t) => n + txnMonths(t), 0);
  return months > 0 ? addMonths(unit.leaseStart, months) : unit.leaseStart;
}

/** Newest-first by date, deterministic for ties so both phones agree. */
function newestFirst(txns: Txn[]): Txn[] {
  return [...txns].sort((a, b) => (a.date > b.date ? -1 : a.date < b.date ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * Merge two ledgers. `preferLocal` decides who wins for edited (non-additive)
 * fields — pass true when this phone has unsynced changes.
 */
export function mergeLedgers(local: Ledger, remote: Ledger, preferLocal: boolean): Ledger {
  const winner = preferLocal ? local : remote;
  const loser = preferLocal ? remote : local;

  // 1. txns: union by id, winner's version of any shared row.
  const byId = new Map<string, Txn>();
  for (const t of loser.txns) byId.set(t.id, t);
  for (const t of winner.txns) byId.set(t.id, t);
  const txns = newestFirst([...byId.values()]);

  // 2. units: union by id, winner's fields, then derive coverage from the
  //    merged ledger so no payment is lost or counted twice.
  const unitsById = new Map<string, Unit>();
  for (const u of loser.units) unitsById.set(u.id, u);
  for (const u of winner.units) unitsById.set(u.id, u);
  const units = [...unitsById.values()].map((u) => ({ ...u, nextDue: recomputeNextDue(u, txns) }));

  // 3. company: a small edited record.
  return { units, txns, company: winner.company };
}
