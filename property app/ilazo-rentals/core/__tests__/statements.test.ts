import { applyPayment, computeCovers, txnMonths } from '../engine';
import { yearOf } from '../dates';
import {
  buildAccounts,
  buildReceipts,
  buildStatement,
  pastTenants,
  unitOccupiedSince,
  unitTenants,
  unitTotal,
} from '../statements';
import { SEED_TXNS, SEED_UNITS } from '../seed';

const covers = computeCovers(SEED_UNITS, SEED_TXNS);
const accounts = buildAccounts(SEED_UNITS, SEED_TXNS);
const acc = (tenant: string) => accounts.find((a) => a.tenant === tenant)!;

describe('accounts', () => {
  test('one account per unit+tenant pairing, current first', () => {
    expect(accounts).toHaveLength(6);
    expect(accounts.filter((a) => a.current).map((a) => a.tenant).sort()).toEqual([
      'Frederick Mbwana',
      'Muhamud Mukhsin',
      'Sunday Mtaki',
    ]);
    expect(accounts.filter((a) => !a.current).map((a) => a.tenant).sort()).toEqual([
      'Lilian Kowero',
      'Mr. Julius',
      'Subira Salum',
    ]);
    expect(accounts.slice(0, 3).every((a) => a.current)).toBe(true);
  });

  test('former tenants: leaseStart = first payment, coverEnd = move-out', () => {
    expect(acc('Mr. Julius')).toMatchObject({ leaseStart: '2024-07-01', coverEnd: '2024-09-30', totalMonths: 3 });
    expect(acc('Subira Salum')).toMatchObject({ leaseStart: '2024-08-06', coverEnd: '2025-04-05', totalMonths: 8 });
    expect(acc('Lilian Kowero')).toMatchObject({ leaseStart: '2025-04-24', coverEnd: '2025-12-23', totalMonths: 8 });
  });

  test('current tenants: coverEnd matches the unit coverage pointer − 1 day', () => {
    expect(acc('Sunday Mtaki').coverEnd).toBe('2026-06-23');
    expect(acc('Muhamud Mukhsin').coverEnd).toBe('2026-05-19');
    expect(acc('Frederick Mbwana').coverEnd).toBe('2026-05-07');
  });
});

describe('full-account statements (as of 2026-07-02)', () => {
  const TODAY = '2026-07-02';

  test('Muhamud Mukhsin: 26 months occupied = 24 paid + 2 outstanding', () => {
    const s = buildStatement(acc('Muhamud Mukhsin'), covers, null, TODAY);
    expect(s.charged).toBe(7800000);
    expect(s.received).toBe(7200000);
    expect(s.balance.kind).toBe('due');
    expect(s.balance.amount).toBe(600000);
    expect(s.chargedSub).toBe('26 months occupied');
    expect(s.paidSub).toBe('24 months settled');
    expect(s.periodLabel).toBe('Full account');
    expect(s.pays).toHaveLength(8);
  });

  test('former tenants cap occupancy at move-out, not today', () => {
    for (const name of ['Subira Salum', 'Lilian Kowero']) {
      const s = buildStatement(acc(name), covers, null, TODAY);
      expect(s.balance.kind).toBe('nil');
      expect(s.charged).toBe(s.received);
      expect(s.periodLabel).toBe('Full account · former');
    }
    // Mr. Julius paid an odd 810,000 — the engine quantizes to whole months
    // (round(810,000 / 300,000) = 3), so 3 months occupied = 3 paid → Nil,
    // even though the cash received was 810,000 against 900,000 charged.
    const julius = buildStatement(acc('Mr. Julius'), covers, null, TODAY);
    expect(julius.balance.kind).toBe('nil');
    expect(julius.charged).toBe(900000);
    expect(julius.received).toBe(810000);
    expect(julius.chargedSub).toBe('3 months occupied');
    expect(julius.paidSub).toBe('3 months settled');
    expect(julius.periodLabel).toBe('Full account · former');
  });

  test('reconciliation identity holds for every account: months occupied = months paid + outstanding − ahead', () => {
    for (const a of accounts) {
      for (const today of ['2026-03-26', '2026-07-02', '2027-01-15']) {
        const s = buildStatement(a, covers, null, today);
        const signed = s.balance.kind === 'due' ? s.balance.amount : s.balance.kind === 'credit' ? -s.balance.amount : 0;
        // Payments buy whole months (round(amount/rent)), so the identity is
        // month-quantized: charged = quantized-paid + outstanding − credit.
        const paidQuantized = Math.round(s.received / a.rent) * a.rent;
        expect(s.charged).toBe(paidQuantized + signed);
      }
    }
  });
});

describe('annual statements with opening/closing carry', () => {
  const TODAY = '2026-07-02';
  const mukhsin = acc('Muhamud Mukhsin');

  test('year 2025: 12 months charged, 12 paid, closes 1 month in credit', () => {
    const s = buildStatement(mukhsin, covers, 2025, TODAY);
    expect(s.charged).toBe(3600000);
    expect(s.chargedSub).toBe('12 months in 2025');
    expect(s.received).toBe(3600000);
    expect(s.balance).toMatchObject({ kind: 'credit', amount: 300000, label: 'Balance', at: 'at 31 Dec 2025' });
    expect(s.periodLabel).toBe('Year 2025');
  });

  test('year 2024: 8 months charged, 9 paid → 1 month credit', () => {
    const s = buildStatement(mukhsin, covers, 2024, TODAY);
    expect(s.charged).toBe(2400000);
    expect(s.received).toBe(2700000);
    expect(s.balance).toMatchObject({ kind: 'credit', amount: 300000 });
  });

  test('current year caps as-of at today', () => {
    const s = buildStatement(mukhsin, covers, 2026, TODAY);
    expect(s.charged).toBe(1800000); // months 21–26 of the lease fall in 2026 up to 2 Jul
    expect(s.received).toBe(900000);
    expect(s.balance).toMatchObject({ kind: 'due', amount: 600000, label: 'Balance', at: 'at 02 Jul 2026' });
  });

  test('the carry chains in months: closing(y) = closing(y−1) + charged(y) − months paid(y)', () => {
    // Payments buy whole months, so the carry is month-quantized and valued
    // at the unit's rent — exact even for odd amounts (e.g. Julius' 810k = 3 months).
    for (const a of accounts) {
      let prevClosing = 0;
      for (const year of [2024, 2025, 2026]) {
        const s = buildStatement(a, covers, year, TODAY);
        const closing = s.balance.kind === 'due' ? s.balance.amount : s.balance.kind === 'credit' ? -s.balance.amount : 0;
        const monthsPaidInYear = a.txns.filter((t) => yearOf(t.date) === year).reduce((n, t) => n + txnMonths(t), 0);
        expect(closing).toBe(prevClosing + s.charged - monthsPaidInYear * a.rent);
        prevClosing = closing;
      }
    }
  });

  test('former tenant annual scope caps at move-out', () => {
    const s = buildStatement(acc('Subira Salum'), covers, 2025, TODAY);
    expect(s.charged).toBe(900000); // Jan–Apr periods up to her 5 Apr 2025 move-out
    expect(s.received).toBe(0); // both her payments were in 2024
    expect(s.balance).toMatchObject({ kind: 'nil', label: 'Balance', at: 'at 05 Apr 2025' });
    expect(s.periodLabel).toBe('Former · Year 2025');
  });
});

describe('same-day payments keep their recording order', () => {
  test('receipt numbers and coverage labels follow insertion order on ties', () => {
    // Record two payments on the same calendar day (ledger is newest-first,
    // so the second recording sits at index 0).
    const first = applyPayment(SEED_UNITS, SEED_TXNS, {
      unitId: 'ilazo1',
      amount: 300000,
      date: '2026-07-02',
      method: 'Cash',
      id: 'day1-first',
    });
    const second = applyPayment(first.units, first.txns, {
      unitId: 'ilazo1',
      amount: 300000,
      date: '2026-07-02',
      method: 'Cash',
      id: 'day1-second',
    });
    const covers2 = computeCovers(second.units, second.txns);
    // First recorded payment covers the earlier month, second the later one.
    expect(covers2['day1-first']).toBe('1 Month · 24 Jun – 23 Jul 2026');
    expect(covers2['day1-second']).toBe('1 Month · 24 Jul – 23 Aug 2026');
    // Receipt numbering: the earlier recording gets the lower number.
    const receipts2 = buildReceipts(second.units, second.txns, covers2);
    const noOf = (id: string) => receipts2.find((r) => r.txnId === id)!.no;
    expect(noOf('day1-first')).toBe('RCP-021');
    expect(noOf('day1-second')).toBe('RCP-022');
  });
});

describe('receipts', () => {
  const receipts = buildReceipts(SEED_UNITS, SEED_TXNS, covers);

  test('one per rent payment, numbered chronologically, newest first', () => {
    expect(receipts).toHaveLength(20); // 21 txns − 1 expense
    expect(receipts[0]).toMatchObject({ no: 'RCP-020', date: '2026-03-25', tenant: 'Sunday Mtaki', unitName: 'Ilazo 1' });
    expect(receipts[receipts.length - 1]).toMatchObject({ no: 'RCP-001', date: '2024-05-10', tenant: 'Muhamud Mukhsin' });
    expect(new Set(receipts.map((r) => r.no)).size).toBe(20);
  });

  test('receipts carry the canonical coverage period split across two lines', () => {
    const r = receipts.find((x) => x.txnId === 's09')!;
    expect(r.coverMonths).toBe('3 Months');
    expect(r.coverRange).toBe('20 Feb – 19 May 2025');
  });
});

describe('tenant lists', () => {
  test('past tenants are everyone in the ledger not currently on a unit', () => {
    const past = pastTenants(SEED_UNITS, SEED_TXNS);
    expect(past.map((p) => p.name)).toEqual(['Lilian Kowero', 'Subira Salum', 'Mr. Julius']);
    expect(past[0]).toMatchObject({ unitName: 'Ilazo 3', lastPaymentDate: '2025-11-20' });
  });

  test('tenants of a unit reconcile to the unit lifetime total', () => {
    const list = unitTenants(SEED_UNITS, SEED_TXNS, 'ilazo3', covers);
    expect(list.map((t) => t.name)).toEqual(['Frederick Mbwana', 'Lilian Kowero', 'Subira Salum']);
    expect(list[0].current).toBe(true);
    expect(list.reduce((a, t) => a + t.totalPaid, 0)).toBe(unitTotal(SEED_TXNS, 'ilazo3'));
    expect(unitTotal(SEED_TXNS, 'ilazo3')).toBe(6000000);
  });

  test('unit lifetime totals sum to everything ever collected', () => {
    const total = ['ilazo1', 'ilazo2', 'ilazo3'].reduce((a, id) => a + unitTotal(SEED_TXNS, id), 0);
    expect(total).toBe(20010000);
    expect(unitTotal(SEED_TXNS, 'ilazo1')).toBe(6810000);
    expect(unitTotal(SEED_TXNS, 'ilazo2')).toBe(7200000);
  });

  test('occupied since = first rent payment on the unit', () => {
    expect(unitOccupiedSince(SEED_TXNS, 'ilazo1')).toBe('2024-07-01');
    expect(unitOccupiedSince(SEED_TXNS, 'ilazo3')).toBe('2024-08-06');
  });
});
