/**
 * The tenure/coverage engine — the heart of the app.
 *
 * Rolling lease coverage: rent accrues monthly from each tenant's leaseStart;
 * payments buy whole months of coverage forward from where the previous
 * coverage ended. `nextDue` is the start of the first month not yet paid for.
 *
 * Every function is pure and takes `today` explicitly so the engine is fully
 * testable and identical on Android, iOS and (later) web.
 */
import type { ISODate, StatusKind, Txn, Unit, UnitStatus } from './types';
import { addDays, addMonths, epochDays } from './dates';
import { rangeStr } from './dates';

export const MONTHLY_RENT = 300000;

/** Months a payment covers = round(amount / rent). E.g. 810,000 → 3 months. */
export function monthsCovered(amount: number, rent: number = MONTHLY_RENT): number {
  return Math.round(amount / rent);
}

/**
 * Months a recorded payment bought. New payments carry a snapshot taken at
 * the rent in force when they were recorded (immune to later rent changes);
 * legacy/seed txns fall back to the original flat 300,000 rate.
 */
export function txnMonths(t: Pick<Txn, 'amount' | 'months'>): number {
  return t.months ?? monthsCovered(t.amount, MONTHLY_RENT);
}

/**
 * Months of rent fallen due right now: count of month-periods (starting at
 * nextDue) whose start date is on or before today.
 */
export function monthsDue(nextDue: ISODate, today: ISODate): number {
  let k = 0;
  while (k < 600 && addMonths(nextDue, k) <= today) k++;
  return k;
}

/** A unit with no current tenant. Registering a tenant fills it. */
export function isVacant(unit: Pick<Unit, 'tenant'>): boolean {
  return unit.tenant.trim().length === 0;
}

/**
 * A unit lived in by the owner: it has an occupant but charges no rent
 * (rent 0). It never accrues dues, is excluded from the rent roll, and
 * cannot take rent payments — but still counts as an occupied unit.
 */
export function isOwnerOccupied(unit: Pick<Unit, 'tenant' | 'rent'>): boolean {
  return !isVacant(unit) && unit.rent <= 0;
}

/** Units that currently have an occupant (tenant or owner). */
export function occupiedUnits(units: Unit[]): Unit[] {
  return units.filter((u) => !isVacant(u));
}

/** Units actually let for rent — occupied AND rent-bearing (excludes owner-occupied). */
export function rentedUnits(units: Unit[]): Unit[] {
  return units.filter((u) => !isVacant(u) && u.rent > 0);
}

/** Amount due now = monthsDue × rent. Vacant and owner-occupied units accrue nothing. */
export function dueOf(unit: Pick<Unit, 'nextDue' | 'rent' | 'tenant'>, today: ISODate): number {
  if (isVacant(unit) || isOwnerOccupied(unit)) return 0;
  return monthsDue(unit.nextDue, today) * unit.rent;
}

/** Recording a payment advances nextDue by the covered months. leaseStart is never touched. */
export function advanceNextDue(nextDue: ISODate, amount: number, rent: number = MONTHLY_RENT): ISODate {
  return addMonths(nextDue, monthsCovered(amount, rent));
}

/** Last covered day = nextDue − 1 day. */
export function coveredThrough(nextDue: ISODate): ISODate {
  return addDays(nextDue, -1);
}

/**
 * due > 0 → Arrears; paid more than a full month past today → Paid ahead;
 * otherwise Up to date.
 */
export function statusOf(due: number, nextDue: ISODate, today: ISODate): UnitStatus {
  if (due > 0) return { kind: 'arrears', label: 'Arrears' };
  if (nextDue > addMonths(today, 1)) return { kind: 'ahead', label: 'Paid ahead' };
  return { kind: 'current', label: 'Up to date' };
}

/** Months elapsed between leaseStart and asOf (period starts on/before asOf). */
export function monthsElapsed(startIso: ISODate, asOf: ISODate): number {
  if (asOf < startIso) return 0;
  let k = 0;
  while (k < 1200 && addMonths(startIso, k) <= asOf) k++;
  return k;
}

/** '3 Months · 20 Feb – 19 May 2025' for a payment covering `months` from `startIso`. */
export function coverLabel(months: number, startIso: ISODate): string {
  const end = addDays(addMonths(startIso, months), -1);
  return `${months}${months === 1 ? ' Month · ' : ' Months · '}${rangeStr(startIso, end)}`;
}

/** Split a cover label into its months part and date-range part for two-line display. */
export function splitCover(cv: string): { m: string; r: string } {
  const i = (cv || '').indexOf(' · ');
  return i < 0 ? { m: cv || '', r: '' } : { m: cv.slice(0, i), r: cv.slice(i + 3) };
}

/**
 * Sort txns oldest → newest. Txns carry only a calendar date, so same-day
 * entries tie — the ledger array is kept newest-first, so a HIGHER array index
 * means an EARLIER recording; use that as the tie-break so several payments
 * recorded on one day keep their true order (receipt numbers, coverage walk).
 */
export function chronological(txns: Txn[]): Txn[] {
  return txns
    .map((t, i) => ({ t, i }))
    .sort((a, b) => (a.t.date < b.t.date ? -1 : a.t.date > b.t.date ? 1 : b.i - a.i))
    .map((x) => x.t);
}

/** Rent txns for one unit+tenant pair, oldest → newest. */
export function rentTxnsFor(txns: Txn[], unitId: string, tenant: string): Txn[] {
  return chronological(txns.filter((t) => t.type === 'rent' && t.unit === unitId && t.tenant === tenant));
}

/**
 * Canonical coverage labels for every rent txn, keyed by txn id.
 *
 * Walks each tenant's payments oldest → newest from their tenure start
 * (current tenants: the unit's leaseStart; former tenants: their first
 * payment date), allocating each payment's months forward.
 */
export function computeCovers(units: Unit[], txns: Txn[]): Record<string, string> {
  const out: Record<string, string> = {};
  const groups = new Map<string, Txn[]>();
  for (const t of txns) {
    if (t.type !== 'rent') continue;
    const k = `${t.unit}|${t.tenant}`;
    const g = groups.get(k) ?? [];
    g.push(t);
    groups.set(k, g);
  }
  for (const [key, group] of groups) {
    const [unitId, tenant] = key.split('|');
    const sorted = chronological(group);
    const unit = units.find((u) => u.id === unitId && u.tenant === tenant);
    let cursor = unit ? unit.leaseStart : sorted[0].date;
    for (const t of sorted) {
      const m = txnMonths(t);
      out[t.id] = coverLabel(m, cursor);
      cursor = addMonths(cursor, m);
    }
  }
  return out;
}

/**
 * How far through the current billing period today is, as a percentage
 * (clamped so the bar is always minimally visible). The current period is
 * [nextDue − 1 month, nextDue].
 */
export function periodProgressPct(nextDue: ISODate, today: ISODate, min = 5): number {
  const ps = addMonths(nextDue, -1);
  const tot = epochDays(nextDue) - epochDays(ps);
  const el = epochDays(today) - epochDays(ps);
  return Math.max(min, Math.min(100, tot > 0 ? Math.round((el / tot) * 100) : 100));
}

// ---- portfolio aggregates -------------------------------------------------

export function outstandingTotal(units: Unit[], today: ISODate): number {
  return units.reduce((a, u) => a + dueOf(u, today), 0);
}

/** Monthly rent roll — rent actually rolling in, i.e. rent-bearing occupied units. */
export function monthRoll(units: Unit[]): number {
  return rentedUnits(units).reduce((a, u) => a + u.rent, 0);
}

export function collectedTotal(txns: Txn[]): number {
  return txns.filter((t) => t.type === 'rent').reduce((a, t) => a + t.amount, 0);
}

export function expensesTotal(txns: Txn[]): number {
  return txns.filter((t) => t.type === 'expense').reduce((a, t) => a + t.amount, 0);
}

export function netIncome(txns: Txn[]): number {
  return collectedTotal(txns) - expensesTotal(txns);
}

// ---- mutations (pure — return new arrays, never mutate) --------------------

export interface RecordPaymentInput {
  unitId: string;
  amount: number;
  date: ISODate;
  /** As selected in the sheet, e.g. 'Bank transfer (CRDB)' — stored without the bank suffix. */
  method: string;
  id: string;
  /** Optional payment evidence (image URIs, e.g. bank-transfer screenshots). */
  evidence?: string[];
}

export interface RecordPaymentResult {
  units: Unit[];
  txns: Txn[];
  txn: Txn;
  newNextDue: ISODate;
  monthsAdded: number;
}

/** Apply a rent payment: advance the unit's nextDue and prepend the ledger entry. */
export function applyPayment(units: Unit[], txns: Txn[], input: RecordPaymentInput): RecordPaymentResult {
  const unit = units.find((u) => u.id === input.unitId);
  if (!unit) throw new Error(`Unknown unit: ${input.unitId}`);
  if (isVacant(unit)) throw new Error(`Unit ${unit.name} is vacant — register a tenant first`);
  if (isOwnerOccupied(unit)) throw new Error(`Unit ${unit.name} is owner-occupied — no rent is charged`);
  if (!(input.amount > 0)) throw new Error('Payment amount must be positive');
  const months = monthsCovered(input.amount, unit.rent);
  const newNextDue = addMonths(unit.nextDue, months);
  const txn: Txn = {
    id: input.id,
    date: input.date,
    tenant: unit.tenant,
    unit: unit.id,
    amount: input.amount,
    method: input.method.replace(' (CRDB)', ''),
    covers: coverLabel(months, unit.nextDue),
    type: 'rent',
    // Snapshot at today's rent so a future rent change can't rewrite history.
    months,
    ...(input.evidence && input.evidence.length > 0 ? { evidence: input.evidence } : {}),
  };
  return {
    units: units.map((u) => (u.id === unit.id ? { ...u, nextDue: newNextDue } : u)),
    txns: [txn, ...txns],
    txn,
    newNextDue,
    monthsAdded: months,
  };
}

export interface RegisterTenantInput {
  unitId: string;
  name: string;
  phone: string;
  start: ISODate;
  kin: { name: string; phone: string; rel: string };
}

/**
 * Register a new tenant on a unit: fresh rolling lease from the tenure start
 * (leaseStart = nextDue = start). The previous occupant implicitly becomes a
 * "Former tenant" — all their transactions stay in the ledger.
 */
export function applyNewTenant(units: Unit[], input: RegisterTenantInput): Unit[] {
  return units.map((u) =>
    u.id === input.unitId
      ? {
          ...u,
          tenant: input.name.trim(),
          phone: input.phone.trim() || u.phone,
          leaseStart: input.start,
          nextDue: input.start,
          kin: {
            name: input.kin.name.trim(),
            phone: input.kin.phone.trim(),
            rel: input.kin.rel.trim(),
          },
        }
      : u,
  );
}

export interface EditUnitInput {
  unitId: string;
  name: string;
  type: Unit['type'];
  /**
   * New monthly rent. Applies to months not yet paid for; bought coverage is
   * untouched. 0 marks the unit owner-occupied (no rent charged).
   */
  rent: number;
}

/**
 * Update a unit's own details (name/type/rent). Lease pointers are never
 * touched: coverage already bought stays bought (payments carry a months
 * snapshot), and future dues accrue at the new rent from `nextDue` onward.
 * A rent of 0 marks the unit owner-occupied.
 */
export function applyEditUnit(units: Unit[], input: EditUnitInput): Unit[] {
  const unit = units.find((u) => u.id === input.unitId);
  if (!unit) throw new Error(`Unknown unit: ${input.unitId}`);
  const name = input.name.trim();
  if (!name) throw new Error('Unit name is required');
  if (units.some((u) => u.id !== input.unitId && u.name.trim().toLowerCase() === name.toLowerCase())) {
    throw new Error(`${name} already exists`);
  }
  if (!(input.rent >= 0) || !Number.isFinite(input.rent)) throw new Error('Monthly rent cannot be negative');
  return units.map((u) => (u.id === input.unitId ? { ...u, name, type: input.type, rent: input.rent } : u));
}

export interface EditTenantInput {
  unitId: string;
  name: string;
  phone: string;
  kin: { name: string; phone: string; rel: string };
}

/**
 * Update the current tenant's contact details. Lease dates and balances are
 * unaffected; a rename propagates to that tenant's historical transactions.
 */
export function applyEditTenant(
  units: Unit[],
  txns: Txn[],
  input: EditTenantInput,
): { units: Unit[]; txns: Txn[] } {
  const unit = units.find((u) => u.id === input.unitId);
  if (!unit) throw new Error(`Unknown unit: ${input.unitId}`);
  const oldName = unit.tenant;
  const name = input.name.trim();
  const nextUnits = units.map((u) =>
    u.id === input.unitId
      ? {
          ...u,
          tenant: name,
          phone: input.phone,
          kin: {
            name: input.kin.name.trim(),
            phone: input.kin.phone.trim(),
            rel: input.kin.rel.trim(),
          },
        }
      : u,
  );
  const nextTxns =
    name !== oldName
      ? txns.map((t) => (t.unit === input.unitId && t.tenant === oldName ? { ...t, tenant: name } : t))
      : txns;
  return { units: nextUnits, txns: nextTxns };
}
