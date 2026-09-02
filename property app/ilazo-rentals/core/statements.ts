/**
 * Accounts, statements and receipts — derived entirely from units + txns.
 *
 * A tenant "account" is one unit+tenant pairing across the ledger. A tenant is
 * *current* iff they equal a unit's `tenant` field; otherwise *past*. Former
 * tenants keep all their transactions so statements/receipts stay available.
 */
import type { ISODate, Txn, Unit, UnitType } from './types';
import { addDays, addMonths, fmtDate, yearOf } from './dates';
import { MONTHLY_RENT, chronological, monthsElapsed, splitCover, txnMonths } from './engine';

export interface Account {
  unitId: string;
  unitName: string;
  tenant: string;
  current: boolean;
  type: UnitType | '';
  rent: number;
  /** Current tenants: the unit's leaseStart; former tenants: their first payment date. */
  leaseStart: ISODate;
  /** Last day covered by everything this tenant has paid (former-tenant move-out cap). */
  coverEnd: ISODate;
  /** Calendar years in which this account has payments. */
  years: number[];
  /** This account's rent txns, oldest → newest. */
  txns: Txn[];
  lastPaymentDate: ISODate;
  totalPaid: number;
  totalMonths: number;
}

export function buildAccounts(units: Unit[], txns: Txn[]): Account[] {
  const groups = new Map<string, Txn[]>();
  for (const t of txns) {
    if (t.type !== 'rent') continue;
    const k = `${t.unit}|${t.tenant}`;
    const g = groups.get(k) ?? [];
    g.push(t);
    groups.set(k, g);
  }
  const accounts: Account[] = [];
  for (const [key, group] of groups) {
    const [unitId, tenant] = key.split('|');
    const sorted = chronological(group);
    const unit = units.find((u) => u.id === unitId);
    const current = !!(unit && unit.tenant === tenant);
    const leaseStart = current && unit ? unit.leaseStart : sorted[0].date;
    const totalMonths = sorted.reduce((a, t) => a + txnMonths(t), 0);
    const totalPaid = sorted.reduce((a, t) => a + t.amount, 0);
    accounts.push({
      unitId,
      unitName: unit ? unit.name : '',
      tenant,
      current,
      type: unit ? unit.type : '',
      rent: unit ? unit.rent : MONTHLY_RENT,
      leaseStart,
      coverEnd: addDays(addMonths(leaseStart, totalMonths), -1),
      years: [...new Set(sorted.map((t) => yearOf(t.date)))],
      txns: sorted,
      lastPaymentDate: sorted[sorted.length - 1].date,
      totalPaid,
      totalMonths,
    });
  }
  // Current accounts first, then most recently paying.
  accounts.sort((a, b) => {
    if (a.current !== b.current) return a.current ? -1 : 1;
    return a.lastPaymentDate < b.lastPaymentDate ? 1 : -1;
  });
  return accounts;
}

export interface StatementPayRow {
  date: ISODate;
  /** '3 Months' */
  months: string;
  /** '20 Feb – 19 May 2025' */
  range: string;
  amount: number;
}

export type StatementBalanceKind = 'due' | 'credit' | 'nil';

export interface StatementData {
  tenant: string;
  unitName: string;
  type: string;
  rent: number;
  leaseStart: ISODate;
  coverEnd: ISODate;
  current: boolean;
  /** 'Full account' | 'Full account · former' | 'Year 2025' | 'Former · Year 2025' */
  periodLabel: string;
  /** Rent charged in scope (months occupied). */
  charged: number;
  chargedSub: string;
  /** Payments received in scope. */
  received: number;
  paidSub: string;
  /** Third reconciliation row: outstanding / advance / nil. */
  balance: {
    kind: StatementBalanceKind;
    label: string;
    sub: string;
    /** Absolute TZS amount (0 for nil). */
    amount: number;
  };
  pays: StatementPayRow[];
}

const mw = (n: number) => `${n}${n === 1 ? ' month' : ' months'}`;

/**
 * Build a tenant statement. The reconciliation always balances:
 * Rent charged (months occupied) = Paid + Outstanding.
 *
 * year === null → full account since leaseStart.
 * year set      → that calendar year with opening/closing carry:
 *   closing balance at 31 Dec = monthsElapsed(leaseStart, asOf) × rent − received-through-asOf.
 * Former tenants cap "occupied" at their move-out (coverage end), not today.
 */
export function buildStatement(
  account: Account,
  covers: Record<string, string>,
  year: number | null,
  today: ISODate,
): StatementData {
  const rent = account.rent;
  const stayedCap = account.current ? today : account.coverEnd;

  const pays: StatementPayRow[] = [];
  let scopeReceived = 0;
  for (const t of account.txns) {
    if (year === null || yearOf(t.date) === year) {
      scopeReceived += t.amount;
      const sp = splitCover(covers[t.id] ?? t.covers);
      pays.push({ date: t.date, months: sp.m, range: sp.r, amount: t.amount });
    }
  }
  // Newest first for display.
  pays.reverse();

  let charged: number;
  let chargedSub: string;
  let paidSub: string;
  let periodLabel: string;
  let balance: StatementData['balance'];

  if (year === null) {
    // Months are summed from per-payment snapshots, so the reconciliation
    // stays exact even if the unit's rent has changed since a payment.
    const monthsPaid = account.totalMonths;
    const monthsStayed = monthsElapsed(account.leaseStart, stayedCap);
    const monthsOwed = Math.max(0, monthsStayed - monthsPaid);
    const monthsAhead = Math.max(0, monthsPaid - monthsStayed);
    charged = monthsStayed * rent;
    chargedSub = `${mw(monthsStayed)} occupied`;
    paidSub = `${mw(monthsPaid)} settled`;
    if (monthsOwed > 0) {
      balance = { kind: 'due', label: 'Outstanding', sub: `${mw(monthsOwed)} unpaid`, amount: monthsOwed * rent };
    } else if (monthsAhead > 0) {
      balance = {
        kind: 'credit',
        label: 'Advance / prepaid',
        sub: `${mw(monthsAhead)} ahead`,
        amount: monthsAhead * rent,
      };
    } else {
      balance = { kind: 'nil', label: 'Balance', sub: 'nothing unpaid', amount: 0 };
    }
    periodLabel = account.current ? 'Full account' : 'Full account · former';
  } else {
    const yearEnd: ISODate = `${year}-12-31`;
    const prevEnd: ISODate = `${year - 1}-12-31`;
    const asOf = yearEnd <= stayedCap ? yearEnd : stayedCap;
    const chargedToAsOf = monthsElapsed(account.leaseStart, asOf);
    const monthsChargedYear = Math.max(0, chargedToAsOf - monthsElapsed(account.leaseStart, prevEnd));
    charged = monthsChargedYear * rent;
    chargedSub = `${mw(monthsChargedYear)} in ${year}`;
    let monthsPaidInYear = 0;
    let monthsPaidThroughAsOf = 0;
    for (const t of account.txns) {
      if (yearOf(t.date) === year) monthsPaidInYear += txnMonths(t);
      if (t.date <= asOf) monthsPaidThroughAsOf += txnMonths(t);
    }
    paidSub = `${mw(monthsPaidInYear)} paid in ${year}`;
    // Carry in months (payments buy whole months), valued at the current rent.
    const closing = (chargedToAsOf - monthsPaidThroughAsOf) * rent;
    const label = `Balance at ${yearEnd <= stayedCap ? `31 Dec ${year}` : fmtDate(stayedCap)}`;
    if (closing > 0) {
      balance = { kind: 'due', label, sub: `${mw(Math.round(closing / rent))} unpaid`, amount: closing };
    } else if (closing < 0) {
      balance = { kind: 'credit', label, sub: `${mw(Math.round(-closing / rent))} ahead`, amount: -closing };
    } else {
      balance = { kind: 'nil', label, sub: 'settled', amount: 0 };
    }
    periodLabel = `${account.current ? 'Year ' : 'Former · Year '}${year}`;
  }

  return {
    tenant: account.tenant,
    unitName: account.unitName,
    type: account.type,
    rent,
    leaseStart: account.leaseStart,
    coverEnd: account.coverEnd,
    current: account.current,
    periodLabel,
    charged,
    chargedSub,
    received: scopeReceived,
    paidSub,
    balance,
    pays,
  };
}

export interface Receipt {
  /** 'RCP-001' — numbered chronologically, oldest payment = 001. */
  no: string;
  txnId: string;
  tenant: string;
  unitId: string;
  unitName: string;
  amount: number;
  date: ISODate;
  method: string;
  coverMonths: string;
  coverRange: string;
  /** Attached payment evidence images. */
  evidence: string[];
}

/** One receipt per rent payment, returned newest first. */
export function buildReceipts(units: Unit[], txns: Txn[], covers: Record<string, string>): Receipt[] {
  const rent = chronological(txns.filter((t) => t.type === 'rent'));
  const unitName = (id: string) => units.find((u) => u.id === id)?.name ?? '';
  return rent
    .map((t, i) => {
      const sp = splitCover(covers[t.id] ?? t.covers);
      return {
        no: `RCP-${String(i + 1).padStart(3, '0')}`,
        txnId: t.id,
        tenant: t.tenant,
        unitId: t.unit,
        unitName: unitName(t.unit),
        amount: t.amount,
        date: t.date,
        method: t.method,
        coverMonths: sp.m,
        coverRange: sp.r,
        evidence: t.evidence ?? [],
      };
    })
    .reverse();
}

export interface PastTenant {
  name: string;
  unitId: string;
  unitName: string;
  lastPaymentDate: ISODate;
}

/** Tenants appearing in the ledger who are not any unit's current tenant. */
export function pastTenants(units: Unit[], txns: Txn[]): PastTenant[] {
  const currentNames = new Set(units.map((u) => u.tenant));
  const seen = new Set<string>();
  const out: PastTenant[] = [];
  // Newest first (reverse chronological) so lastPaymentDate is the latest.
  const sorted = chronological(txns.filter((t) => t.type === 'rent')).reverse();
  for (const t of sorted) {
    if (currentNames.has(t.tenant) || seen.has(t.tenant)) continue;
    seen.add(t.tenant);
    out.push({
      name: t.tenant,
      unitId: t.unit,
      unitName: units.find((u) => u.id === t.unit)?.name ?? '',
      lastPaymentDate: t.date,
    });
  }
  return out;
}

export interface UnitTenantSummary {
  name: string;
  current: boolean;
  /** Tenure start (current: leaseStart, former: first payment). */
  start: ISODate;
  /** Coverage end for their payments. */
  end: ISODate;
  months: number;
  totalPaid: number;
  /** Payment rows newest-first with canonical cover labels. */
  rows: StatementPayRow[];
}

/** Every tenant who ever occupied a unit (current + past); totals reconcile to the unit total. */
export function unitTenants(
  units: Unit[],
  txns: Txn[],
  unitId: string,
  covers: Record<string, string>,
): UnitTenantSummary[] {
  const unit = units.find((u) => u.id === unitId);
  const groups = new Map<string, Txn[]>();
  for (const t of txns) {
    if (t.type !== 'rent' || t.unit !== unitId) continue;
    const g = groups.get(t.tenant) ?? [];
    g.push(t);
    groups.set(t.tenant, g);
  }
  const out: UnitTenantSummary[] = [];
  for (const [name, group] of groups) {
    const sorted = chronological(group);
    const totalPaid = sorted.reduce((a, t) => a + t.amount, 0);
    const months = sorted.reduce((a, t) => a + txnMonths(t), 0);
    const current = !!(unit && unit.tenant === name);
    const start = current && unit ? unit.leaseStart : sorted[0].date;
    out.push({
      name,
      current,
      start,
      end: addDays(addMonths(start, months), -1),
      months,
      totalPaid,
      rows: sorted
        .map((t) => {
          const sp = splitCover(covers[t.id] ?? t.covers);
          return { date: t.date, months: sp.m, range: sp.r, amount: t.amount };
        })
        .reverse(),
    });
  }
  out.sort((a, b) => {
    if (a.current !== b.current) return a.current ? -1 : 1;
    const la = a.rows[0]?.date ?? '';
    const lb = b.rows[0]?.date ?? '';
    return la < lb ? 1 : -1;
  });
  return out;
}

/** Lifetime rent generated by a unit across all tenants. */
export function unitTotal(txns: Txn[], unitId: string): number {
  return txns.filter((t) => t.type === 'rent' && t.unit === unitId).reduce((a, t) => a + t.amount, 0);
}

/** Earliest rent payment date for a unit ('occupied since'). */
export function unitOccupiedSince(txns: Txn[], unitId: string): ISODate | null {
  let min: ISODate | null = null;
  for (const t of txns) {
    if (t.type !== 'rent' || t.unit !== unitId) continue;
    if (min === null || t.date < min) min = t.date;
  }
  return min;
}
