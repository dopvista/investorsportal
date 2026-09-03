/**
 * App state: persisted source of truth is exactly { units, txns, company }.
 * Everything else (balances, coverage, statements, active/former) is derived
 * on read from core/. The storage backend is injected so the same store runs
 * on AsyncStorage (app) and an in-memory adapter (tests / future web).
 */
import { createStore as createZustandStore } from 'zustand/vanilla';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Company, ISODate, Txn, Unit, UnitType } from '../core/types';
import { applyEditTenant, applyEditUnit, applyNewTenant, applyPayment } from '../core/engine';
import type { EditTenantInput, EditUnitInput, RegisterTenantInput } from '../core/engine';
import { SEED_COMPANY, SEED_TXNS, SEED_UNITS } from '../core/seed';

export interface StorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface RecordPaymentArgs {
  unitId: string;
  amount: number;
  date: ISODate;
  method: string;
  /** Optional payment evidence image URIs (already persisted to app storage). */
  evidence?: string[];
}

export interface AddUnitArgs {
  name: string;
  type: UnitType;
  rent: number;
  /** Today — placeholder lease dates until a tenant is registered. */
  date: ISODate;
  /**
   * Occupant name when the unit is owner-occupied (no rent). When set, the
   * unit starts occupied by this person with rent 0 instead of vacant.
   */
  owner?: string;
}

export interface AppState {
  units: Unit[];
  txns: Txn[];
  company: Company;
  hydrated: boolean;
  addUnit(args: AddUnitArgs): void;
  updateUnit(args: EditUnitInput): void;
  recordPayment(args: RecordPaymentArgs): Txn;
  registerTenant(args: RegisterTenantInput): void;
  editTenant(args: EditTenantInput): void;
  saveCompany(company: Company): void;
  /** Replace the entire ledger from a backup file (Import / restore). */
  importData(data: { units: Unit[]; txns: Txn[]; company: Company }): void;
  /**
   * Rewrite the evidence entries of specific transactions.
   *
   * Used when a legacy device-local image path is migrated to a shared key.
   * Nothing else on the transaction is touched.
   */
  setTxnEvidence(patches: { id: string; evidence: string[] }[]): void;
  resetToSeed(): void;
  markHydrated(): void;
}

export const STORAGE_KEY = 'ilazo-rentals-v1';

let txnCounter = 0;
function nextTxnId(): string {
  txnCounter += 1;
  return `u${Date.now().toString(36)}-${txnCounter}`;
}

export function createAppStore(storage: StorageAdapter) {
  return createZustandStore<AppState>()(
    persist(
      (set, get) => ({
        units: SEED_UNITS,
        txns: SEED_TXNS,
        company: SEED_COMPANY,
        hydrated: false,

        addUnit(args) {
          const owner = args.owner?.trim() ?? '';
          const unit: Unit = {
            id: `u${Date.now().toString(36)}${(txnCounter += 1)}`,
            name: args.name.trim(),
            type: args.type,
            // Owner-occupied units charge no rent.
            rent: owner ? 0 : args.rent,
            // Owner-occupied: starts occupied by the owner. Otherwise vacant
            // until a tenant is registered; lease dates are placeholders.
            tenant: owner,
            phone: '',
            leaseStart: args.date,
            nextDue: args.date,
            kin: { name: '', phone: '', rel: '' },
          };
          set({ units: [...get().units, unit] });
        },

        updateUnit(args) {
          set({ units: applyEditUnit(get().units, args) });
        },

        recordPayment(args) {
          const res = applyPayment(get().units, get().txns, { ...args, id: nextTxnId() });
          set({ units: res.units, txns: res.txns });
          return res.txn;
        },

        registerTenant(args) {
          set({ units: applyNewTenant(get().units, args) });
        },

        editTenant(args) {
          const res = applyEditTenant(get().units, get().txns, args);
          set({ units: res.units, txns: res.txns });
        },

        saveCompany(company) {
          set({ company });
        },

        importData(data) {
          set({ units: data.units, txns: data.txns, company: data.company });
        },

        setTxnEvidence(patches) {
          if (patches.length === 0) return;
          const by = new Map(patches.map((p) => [p.id, p.evidence]));
          set({
            txns: get().txns.map((t) => (by.has(t.id) ? { ...t, evidence: by.get(t.id)! } : t)),
          });
        },

        resetToSeed() {
          set({ units: SEED_UNITS, txns: SEED_TXNS, company: SEED_COMPANY });
        },

        markHydrated() {
          set({ hydrated: true });
        },
      }),
      {
        name: STORAGE_KEY,
        version: 1,
        storage: createJSONStorage(() => storage),
        partialize: (s) => ({ units: s.units, txns: s.txns, company: s.company }),
        onRehydrateStorage: () => (state) => {
          state?.markHydrated();
        },
      },
    ),
  );
}

export type AppStore = ReturnType<typeof createAppStore>;
