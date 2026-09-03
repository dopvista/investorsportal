/**
 * Platform-agnostic domain types for Ilazo Rentals.
 * This module (and everything in core/) must never import React Native —
 * it is shared verbatim with the future web app.
 */

/** Calendar date as 'YYYY-MM-DD'. All core APIs speak ISO strings, never Date objects. */
export type ISODate = string;

export type UnitType = 'Single' | 'Couples' | 'Family';

export interface Kin {
  name: string;
  phone: string;
  rel: string;
}

export interface Unit {
  id: string;
  name: string;
  type: UnitType;
  /** Monthly rent in TZS (flat 300,000 for all Ilazo units). */
  rent: number;
  /** Current tenant's full name. */
  tenant: string;
  phone: string;
  /** Current tenant's tenure start. Never changed by payments. */
  leaseStart: ISODate;
  /** Start of the first month not yet paid for (rolling coverage pointer). */
  nextDue: ISODate;
  kin: Kin;
}

export type TxnType = 'rent' | 'expense';

export type PayMethod = 'Bank transfer (CRDB)' | 'Bank transfer' | 'Cash' | 'Mobile money' | 'Utilities' | string;

export interface Txn {
  id: string;
  date: ISODate;
  tenant: string;
  /** Unit id, or '' for property-level expenses. */
  unit: string;
  amount: number;
  method: PayMethod;
  /** Human label from seed data; the app recomputes canonical labels via computeCovers. */
  covers: string;
  type: TxnType;
  category?: string;
  /** Payment evidence — local URIs of screenshots/photos attached when recording. */
  evidence?: string[];
  /**
   * Months of coverage this payment bought, snapshotted at the rent in force
   * when it was recorded. Keeps history stable when a unit's rent later
   * changes. Absent on legacy/seed txns (all at the original 300,000 rate).
   */
  months?: number;
}

export interface Company {
  name: string;
  short: string;
  phone: string;
  email: string;
  address: string;
  tin: string;
  /** Closing line on receipts and statements — the tenant reads this, so it
      is the company's own words, not a system status. Optional: ledgers
      saved before this existed fall back to DEFAULT_MOTTO. */
  motto?: string;
}

export type StatusKind = 'arrears' | 'ahead' | 'current';

export interface UnitStatus {
  kind: StatusKind;
  label: string;
}
