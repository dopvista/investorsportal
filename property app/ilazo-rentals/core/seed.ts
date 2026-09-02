/**
 * Seed data derived from the owner's real transaction history
 * (source_transactions.csv, May 2024 → Mar 2026) and the design prototype.
 *
 * Tenant/next-of-kin phone numbers are placeholders — no real numbers were
 * provided in the handoff.
 *
 * Lease starts / nextDue pointers reconcile exactly with the CSV:
 *  - Ilazo 1 · Sunday Mtaki:    leaseStart 2024-10-24, 20 months paid → nextDue 2026-06-24
 *  - Ilazo 2 · Muhamud Mukhsin: leaseStart 2024-05-20, 24 months paid → nextDue 2026-05-20
 *  - Ilazo 3 · Frederick Mbwana: leaseStart 2026-01-08, 4 months paid → nextDue 2026-05-08
 */
import type { Company, Txn, Unit } from './types';

export const SEED_COMPANY: Company = {
  name: 'Dodoma Contemporary Appartments',
  short: 'Dodoma Contemporary',
  phone: '+255 712 000 000',
  email: 'info@dca.co.tz',
  address: 'P.O. Box 1234, Ilazo, Dodoma, Tanzania',
  tin: '123-456-789',
};

export const PROPERTY_NAME = 'Ilazo';

export const SEED_UNITS: Unit[] = [
  {
    id: 'ilazo1',
    name: 'Ilazo 1',
    type: 'Single',
    rent: 300000,
    tenant: 'Sunday Mtaki',
    phone: '+255 712 000 111',
    leaseStart: '2024-10-24',
    nextDue: '2026-06-24',
    kin: { name: 'Neema Mtaki', phone: '+255 754 110 220', rel: 'Sister' },
  },
  {
    id: 'ilazo2',
    name: 'Ilazo 2',
    type: 'Couples',
    rent: 300000,
    tenant: 'Muhamud Mukhsin',
    phone: '+255 713 000 222',
    leaseStart: '2024-05-20',
    nextDue: '2026-05-20',
    kin: { name: 'Fatma Mukhsin', phone: '+255 755 330 440', rel: 'Spouse' },
  },
  {
    id: 'ilazo3',
    name: 'Ilazo 3',
    type: 'Family',
    rent: 300000,
    tenant: 'Frederick Mbwana',
    phone: '+255 714 000 333',
    leaseStart: '2026-01-08',
    nextDue: '2026-05-08',
    kin: { name: 'Joseph Mbwana', phone: '+255 756 550 660', rel: 'Brother' },
  },
];

/** Ledger, newest first (matching the CSV rows 21 → 1). */
export const SEED_TXNS: Txn[] = [
  { id: 's21', date: '2026-03-25', unit: 'ilazo1', tenant: 'Sunday Mtaki', amount: 900000, method: 'Bank transfer', covers: '3 months · Apr–Jun 2026', type: 'rent' },
  { id: 's20', date: '2026-03-03', unit: 'ilazo2', tenant: 'Muhamud Mukhsin', amount: 900000, method: 'Bank transfer', covers: '3 months · Mar–May 2026', type: 'rent' },
  { id: 's19', date: '2026-01-20', unit: 'ilazo1', tenant: 'Sunday Mtaki', amount: 900000, method: 'Bank transfer', covers: '3 months', type: 'rent' },
  { id: 's18', date: '2026-01-08', unit: 'ilazo3', tenant: 'Frederick Mbwana', amount: 1200000, method: 'Bank transfer', covers: '4 months · Jan–Apr 2026', type: 'rent' },
  { id: 's17', date: '2025-12-01', unit: 'ilazo2', tenant: 'Muhamud Mukhsin', amount: 900000, method: 'Bank transfer', covers: '3 months', type: 'rent' },
  { id: 's16', date: '2025-11-20', unit: 'ilazo3', tenant: 'Lilian Kowero', amount: 900000, method: 'Bank transfer', covers: '3 months', type: 'rent' },
  { id: 's15', date: '2025-09-25', unit: 'ilazo1', tenant: 'Sunday Mtaki', amount: 900000, method: 'Bank transfer', covers: '24 Sep–23 Nov 2025', type: 'rent' },
  { id: 's14', date: '2025-08-24', unit: 'ilazo2', tenant: 'Muhamud Mukhsin', amount: 900000, method: 'Bank transfer', covers: '3 months', type: 'rent' },
  { id: 's13', date: '2025-07-12', unit: 'ilazo1', tenant: 'Sunday Mtaki', amount: 900000, method: 'Bank transfer', covers: '24 Jun–23 Sep 2025', type: 'rent' },
  { id: 's12', date: '2025-06-10', unit: 'ilazo1', tenant: 'Sunday Mtaki', amount: 600000, method: 'Bank transfer', covers: '2 months', type: 'rent' },
  { id: 's11', date: '2025-05-25', unit: 'ilazo2', tenant: 'Muhamud Mukhsin', amount: 900000, method: 'Bank transfer', covers: '3 months', type: 'rent' },
  { id: 's10', date: '2025-04-24', unit: 'ilazo3', tenant: 'Lilian Kowero', amount: 1500000, method: 'Bank transfer', covers: '5 months', type: 'rent' },
  { id: 's09', date: '2025-02-24', unit: 'ilazo2', tenant: 'Muhamud Mukhsin', amount: 900000, method: 'Bank transfer', covers: '20 Feb–21 May 2025', type: 'rent' },
  { id: 's08', date: '2024-12-27', unit: 'ilazo3', tenant: 'Subira Salum', amount: 1200000, method: 'Bank transfer', covers: '20 Dec–19 Apr 2025', type: 'rent' },
  { id: 's07', date: '2024-11-21', unit: 'ilazo2', tenant: 'Muhamud Mukhsin', amount: 900000, method: 'Bank transfer', covers: '3 months', type: 'rent' },
  { id: 's06', date: '2024-10-24', unit: 'ilazo1', tenant: 'Sunday Mtaki', amount: 1800000, method: 'Bank transfer', covers: '6 months', type: 'rent' },
  { id: 's05', date: '2024-10-20', unit: '', tenant: 'Athuman Fundi Bomba', amount: 1500000, method: 'Utilities', covers: 'Plumbing repair + 4,000 L Sintank', type: 'expense', category: 'Utilities' },
  { id: 's04', date: '2024-08-21', unit: 'ilazo2', tenant: 'Muhamud Mukhsin', amount: 900000, method: 'Bank transfer', covers: '3 months', type: 'rent' },
  { id: 's03', date: '2024-08-06', unit: 'ilazo3', tenant: 'Subira Salum', amount: 1200000, method: 'Bank transfer', covers: '4 months', type: 'rent' },
  { id: 's02', date: '2024-07-01', unit: 'ilazo1', tenant: 'Mr. Julius', amount: 810000, method: 'Bank transfer', covers: 'first tenant', type: 'rent' },
  { id: 's01', date: '2024-05-10', unit: 'ilazo2', tenant: 'Muhamud Mukhsin', amount: 900000, method: 'Bank transfer', covers: '3 months', type: 'rent' },
];
