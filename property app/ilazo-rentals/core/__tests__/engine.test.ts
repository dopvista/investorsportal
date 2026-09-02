import {
  MONTHLY_RENT,
  advanceNextDue,
  applyEditTenant,
  applyEditUnit,
  applyNewTenant,
  applyPayment,
  collectedTotal,
  computeCovers,
  coveredThrough,
  coverLabel,
  dueOf,
  expensesTotal,
  isOwnerOccupied,
  isVacant,
  monthRoll,
  occupiedUnits,
  rentedUnits,
  monthsCovered,
  monthsDue,
  monthsElapsed,
  netIncome,
  outstandingTotal,
  periodProgressPct,
  splitCover,
  statusOf,
} from '../engine';
import { SEED_TXNS, SEED_UNITS } from '../seed';
import { fmt, parseAmt } from '../money';
import { initials } from '../names';

describe('monthsCovered — months a payment buys = round(amount / 300,000)', () => {
  test.each([
    [900000, 3],
    [810000, 3], // Mr. Julius' odd first payment rounds 2.7 → 3
    [600000, 2],
    [1200000, 4],
    [1500000, 5],
    [1800000, 6],
    [300000, 1],
  ])('%i TZS → %i months', (amount, months) => {
    expect(monthsCovered(amount, MONTHLY_RENT)).toBe(months);
  });
});

describe('monthsDue / dueOf / status at fixed dates', () => {
  const [ilazo1, ilazo2, ilazo3] = SEED_UNITS;

  test('as of 2026-04-01 all three current tenants are paid ahead', () => {
    for (const u of SEED_UNITS) {
      expect(dueOf(u, '2026-04-01')).toBe(0);
      expect(statusOf(0, u.nextDue, '2026-04-01').kind).toBe('ahead');
    }
  });

  test('as of 2026-07-02 the arrears match the coverage pointers', () => {
    expect(monthsDue(ilazo1.nextDue, '2026-07-02')).toBe(1); // due 24 Jun
    expect(dueOf(ilazo1, '2026-07-02')).toBe(300000);
    expect(monthsDue(ilazo2.nextDue, '2026-07-02')).toBe(2); // due 20 May + 20 Jun
    expect(dueOf(ilazo2, '2026-07-02')).toBe(600000);
    expect(monthsDue(ilazo3.nextDue, '2026-07-02')).toBe(2); // due 8 May + 8 Jun
    expect(dueOf(ilazo3, '2026-07-02')).toBe(600000);
    expect(outstandingTotal(SEED_UNITS, '2026-07-02')).toBe(1500000);
    for (const u of SEED_UNITS) {
      expect(statusOf(dueOf(u, '2026-07-02'), u.nextDue, '2026-07-02').kind).toBe('arrears');
    }
  });

  test('a month falls due exactly on its start date', () => {
    expect(monthsDue('2026-06-24', '2026-06-23')).toBe(0);
    expect(monthsDue('2026-06-24', '2026-06-24')).toBe(1);
  });

  test('up-to-date window: covered but not more than a month ahead', () => {
    // nextDue 2026-07-10, today 2026-06-20 → not due, not a full month ahead
    expect(statusOf(0, '2026-07-10', '2026-06-20').kind).toBe('current');
    expect(statusOf(0, '2026-07-21', '2026-06-20').kind).toBe('ahead');
  });

  test('coveredThrough = nextDue − 1 day', () => {
    expect(coveredThrough('2026-06-24')).toBe('2026-06-23');
    expect(coveredThrough('2026-05-08')).toBe('2026-05-07');
  });
});

describe('replaying the CSV history reproduces the seed coverage pointers', () => {
  test.each([
    ['ilazo1', 'Sunday Mtaki', '2024-10-24', '2026-06-24'],
    ['ilazo2', 'Muhamud Mukhsin', '2024-05-20', '2026-05-20'],
    ['ilazo3', 'Frederick Mbwana', '2026-01-08', '2026-05-08'],
  ])('%s %s: leaseStart %s → nextDue %s', (unitId, tenant, leaseStart, expectedNextDue) => {
    const payments = SEED_TXNS.filter((t) => t.type === 'rent' && t.unit === unitId && t.tenant === tenant)
      .slice()
      .sort((a, b) => (a.date < b.date ? -1 : 1));
    let nextDue = leaseStart;
    for (const p of payments) nextDue = advanceNextDue(nextDue, p.amount);
    expect(nextDue).toBe(expectedNextDue);
    const seedUnit = SEED_UNITS.find((u) => u.id === unitId)!;
    expect(seedUnit.leaseStart).toBe(leaseStart);
    expect(seedUnit.nextDue).toBe(expectedNextDue);
  });
});

describe('coverage labels (computeCovers)', () => {
  const covers = computeCovers(SEED_UNITS, SEED_TXNS);

  test('current tenants walk from leaseStart', () => {
    // Mukhsin's 4th payment (2025-02-24) covers months 10-12 of his lease
    expect(covers['s09']).toBe('3 Months · 20 Feb – 19 May 2025');
    // Mtaki's 3rd payment (2025-07-12); CSV note says "24th June hadi 23rd September 2025"
    expect(covers['s13']).toBe('3 Months · 24 Jun – 23 Sep 2025');
    // Mbwana's only payment: 4 months from his 2026-01-08 lease start
    expect(covers['s18']).toBe('4 Months · 08 Jan – 07 May 2026');
    // Mtaki's first payment: 6 months from lease start
    expect(covers['s06']).toBe('6 Months · 24 Oct 2024 – 23 Apr 2025');
  });

  test('former tenants walk from their first payment date', () => {
    expect(covers['s02']).toBe('3 Months · 01 Jul – 30 Sep 2024'); // Mr. Julius
    expect(covers['s03']).toBe('4 Months · 06 Aug – 05 Dec 2024'); // Subira Salum
    expect(covers['s08']).toBe('4 Months · 06 Dec 2024 – 05 Apr 2025');
    expect(covers['s10']).toBe('5 Months · 24 Apr – 23 Sep 2025'); // Lilian Kowero
    expect(covers['s16']).toBe('3 Months · 24 Sep – 23 Dec 2025');
  });

  test('expenses get no coverage label', () => {
    expect(covers['s05']).toBeUndefined();
  });

  test('splitCover separates months from range', () => {
    expect(splitCover('3 Months · 20 Feb – 19 May 2025')).toEqual({ m: '3 Months', r: '20 Feb – 19 May 2025' });
    expect(splitCover('plain')).toEqual({ m: 'plain', r: '' });
    expect(coverLabel(1, '2026-01-08')).toBe('1 Month · 08 Jan – 07 Feb 2026');
  });
});

describe('portfolio aggregates against the CSV', () => {
  test('lifetime totals', () => {
    expect(collectedTotal(SEED_TXNS)).toBe(20010000);
    expect(expensesTotal(SEED_TXNS)).toBe(1500000);
    expect(netIncome(SEED_TXNS)).toBe(18510000);
    expect(monthRoll(SEED_UNITS)).toBe(900000);
  });
});

describe('applyPayment', () => {
  test('advances nextDue, prepends the txn, strips the bank suffix', () => {
    const res = applyPayment(SEED_UNITS, SEED_TXNS, {
      unitId: 'ilazo2',
      amount: 600000,
      date: '2026-07-02',
      method: 'Bank transfer (CRDB)',
      id: 'p1',
    });
    expect(res.monthsAdded).toBe(2);
    expect(res.newNextDue).toBe('2026-07-20');
    expect(res.units.find((u) => u.id === 'ilazo2')!.nextDue).toBe('2026-07-20');
    expect(res.units.find((u) => u.id === 'ilazo2')!.leaseStart).toBe('2024-05-20'); // never touched
    expect(res.txns[0]).toMatchObject({
      id: 'p1',
      tenant: 'Muhamud Mukhsin',
      unit: 'ilazo2',
      amount: 600000,
      method: 'Bank transfer',
      type: 'rent',
    });
    expect(res.txns[0].covers).toBe('2 Months · 20 May – 19 Jul 2026');
    expect(res.txns).toHaveLength(SEED_TXNS.length + 1);
    // source arrays are not mutated
    expect(SEED_UNITS.find((u) => u.id === 'ilazo2')!.nextDue).toBe('2026-05-20');
    expect(SEED_TXNS).toHaveLength(21);
  });

  test('after paying everything due, the tenant is paid up', () => {
    const today = '2026-07-02';
    const due = dueOf(SEED_UNITS[1], today);
    const res = applyPayment(SEED_UNITS, SEED_TXNS, {
      unitId: 'ilazo2',
      amount: due,
      date: today,
      method: 'Cash',
      id: 'p2',
    });
    expect(dueOf(res.units.find((u) => u.id === 'ilazo2')!, today)).toBe(0);
  });

  test('payment evidence images are stored on the transaction', () => {
    const res = applyPayment(SEED_UNITS, SEED_TXNS, {
      unitId: 'ilazo1',
      amount: 300000,
      date: '2026-07-02',
      method: 'Mobile money',
      id: 'pev',
      evidence: ['file:///evidence/ev-1.jpg', 'file:///evidence/ev-2.png'],
    });
    expect(res.txn.evidence).toEqual(['file:///evidence/ev-1.jpg', 'file:///evidence/ev-2.png']);
    // No evidence → the field is omitted entirely
    const bare = applyPayment(SEED_UNITS, SEED_TXNS, {
      unitId: 'ilazo1',
      amount: 300000,
      date: '2026-07-02',
      method: 'Cash',
      id: 'pev2',
      evidence: [],
    });
    expect(bare.txn.evidence).toBeUndefined();
  });

  test('rejects unknown units and non-positive amounts', () => {
    expect(() =>
      applyPayment(SEED_UNITS, SEED_TXNS, { unitId: 'nope', amount: 1, date: '2026-01-01', method: 'Cash', id: 'x' }),
    ).toThrow();
    expect(() =>
      applyPayment(SEED_UNITS, SEED_TXNS, { unitId: 'ilazo1', amount: 0, date: '2026-01-01', method: 'Cash', id: 'x' }),
    ).toThrow();
  });
});

describe('applyEditUnit — rent rises and drops', () => {
  test('rent change never touches lease pointers or bought coverage', () => {
    const units = applyEditUnit(SEED_UNITS, { unitId: 'ilazo2', name: 'Ilazo 2', type: 'Couples', rent: 350000 });
    const u = units.find((x) => x.id === 'ilazo2')!;
    expect(u.rent).toBe(350000);
    expect(u.leaseStart).toBe('2024-05-20');
    expect(u.nextDue).toBe('2026-05-20'); // covered months stay covered
    // Future arrears accrue at the NEW rate: 2 months due on 2026-07-02
    expect(dueOf(u, '2026-07-02')).toBe(700000);
    // A new payment buys months at the new rate
    const res = applyPayment(units, SEED_TXNS, {
      unitId: 'ilazo2',
      amount: 700000,
      date: '2026-07-02',
      method: 'Cash',
      id: 'newrate',
    });
    expect(res.monthsAdded).toBe(2);
    expect(res.txn.months).toBe(2);
    expect(res.newNextDue).toBe('2026-07-20');
  });

  test('historical coverage labels are immune to a later rent change', () => {
    // Record a payment at 300k, then raise the rent to 400k.
    const paid = applyPayment(SEED_UNITS, SEED_TXNS, {
      unitId: 'ilazo1',
      amount: 900000,
      date: '2026-07-02',
      method: 'Cash',
      id: 'pre-rise',
    });
    const raised = applyEditUnit(paid.units, { unitId: 'ilazo1', name: 'Ilazo 1', type: 'Single', rent: 400000 });
    const covers = computeCovers(raised, paid.txns);
    // Still the 3 months it bought at 300k — NOT round(900k/400k) = 2.
    expect(covers['pre-rise']).toBe('3 Months · 24 Jun – 23 Sep 2026');
  });

  test('validates name uniqueness, empty name and negative rent', () => {
    expect(() => applyEditUnit(SEED_UNITS, { unitId: 'ilazo1', name: 'Ilazo 2', type: 'Single', rent: 300000 })).toThrow(
      /already exists/,
    );
    expect(() => applyEditUnit(SEED_UNITS, { unitId: 'ilazo1', name: '  ', type: 'Single', rent: 300000 })).toThrow();
    expect(() => applyEditUnit(SEED_UNITS, { unitId: 'ilazo1', name: 'Ilazo 1', type: 'Single', rent: -1 })).toThrow();
    // Rent 0 is allowed — it marks the unit owner-occupied.
    const owner = applyEditUnit(SEED_UNITS, { unitId: 'ilazo1', name: 'Ilazo 1', type: 'Single', rent: 0 });
    expect(owner.find((u) => u.id === 'ilazo1')).toMatchObject({ rent: 0 });
    // Renaming a unit to its own name is fine
    const same = applyEditUnit(SEED_UNITS, { unitId: 'ilazo1', name: 'Ilazo 1', type: 'Family', rent: 320000 });
    expect(same.find((u) => u.id === 'ilazo1')).toMatchObject({ type: 'Family', rent: 320000 });
  });
});

describe('owner-occupied units (rent 0, has occupant)', () => {
  const ownerUnit = {
    id: 'ilazo5',
    name: 'Ilazo 5',
    type: 'Family' as const,
    rent: 0,
    tenant: 'Dodoma Contemporary (owner)',
    phone: '',
    leaseStart: '2026-07-03',
    nextDue: '2026-07-03',
    kin: { name: '', phone: '', rel: '' },
  };
  const unitsWithOwner = [...SEED_UNITS, ownerUnit];

  test('classified owner-occupied, not vacant', () => {
    expect(isOwnerOccupied(ownerUnit)).toBe(true);
    expect(isVacant(ownerUnit)).toBe(false);
  });

  test('accrues nothing and never shows due', () => {
    expect(dueOf(ownerUnit, '2030-01-01')).toBe(0);
    // Adding the owner-occupied unit leaves portfolio arrears unchanged.
    expect(outstandingTotal(unitsWithOwner, '2026-07-03')).toBe(outstandingTotal(SEED_UNITS, '2026-07-03'));
  });

  test('counts as occupied but is excluded from the rent roll', () => {
    expect(occupiedUnits(unitsWithOwner)).toHaveLength(4); // 3 seed + owner
    expect(rentedUnits(unitsWithOwner)).toHaveLength(3); // owner excluded
    expect(monthRoll(unitsWithOwner)).toBe(900000); // owner adds 0
  });

  test('rejects rent payments (would divide by zero rent)', () => {
    expect(() =>
      applyPayment(unitsWithOwner, SEED_TXNS, {
        unitId: 'ilazo5',
        amount: 300000,
        date: '2026-07-03',
        method: 'Cash',
        id: 'x',
      }),
    ).toThrow(/owner-occupied/);
  });
});

describe('vacant units', () => {
  const vacantUnit = {
    id: 'ilazo4',
    name: 'Ilazo 4',
    type: 'Single' as const,
    rent: 300000,
    tenant: '',
    phone: '',
    leaseStart: '2026-07-03',
    nextDue: '2026-07-03',
    kin: { name: '', phone: '', rel: '' },
  };
  const unitsWithVacant = [...SEED_UNITS, vacantUnit];

  test('vacant units accrue nothing and are excluded from occupancy/roll', () => {
    expect(isVacant(vacantUnit)).toBe(true);
    expect(dueOf(vacantUnit, '2027-01-01')).toBe(0);
    expect(occupiedUnits(unitsWithVacant)).toHaveLength(3);
    expect(monthRoll(unitsWithVacant)).toBe(900000); // roll counts occupied only
    expect(outstandingTotal(unitsWithVacant, '2026-04-01')).toBe(0);
  });

  test('payments are rejected on vacant units', () => {
    expect(() =>
      applyPayment(unitsWithVacant, SEED_TXNS, {
        unitId: 'ilazo4',
        amount: 300000,
        date: '2026-07-03',
        method: 'Cash',
        id: 'x',
      }),
    ).toThrow(/vacant/);
  });

  test('registering a tenant fills the vacant unit with a fresh lease', () => {
    const units = applyNewTenant(unitsWithVacant, {
      unitId: 'ilazo4',
      name: 'Halima Juma',
      phone: '+255 700 999 888',
      start: '2026-08-01',
      kin: { name: '', phone: '', rel: '' },
    });
    const u = units.find((x) => x.id === 'ilazo4')!;
    expect(isVacant(u)).toBe(false);
    expect(u).toMatchObject({ tenant: 'Halima Juma', leaseStart: '2026-08-01', nextDue: '2026-08-01' });
    expect(dueOf(u, '2026-08-01')).toBe(300000); // accrues from tenure start
  });
});

describe('applyNewTenant — tenant handover', () => {
  test('fresh rolling lease; previous occupant keeps their ledger', () => {
    const units = applyNewTenant(SEED_UNITS, {
      unitId: 'ilazo1',
      name: 'Amina Hassan',
      phone: '+255 700 000 001',
      start: '2026-08-01',
      kin: { name: 'Neema Hassan', phone: '+255 700 000 002', rel: 'Sister' },
    });
    const u = units.find((x) => x.id === 'ilazo1')!;
    expect(u.tenant).toBe('Amina Hassan');
    expect(u.leaseStart).toBe('2026-08-01');
    expect(u.nextDue).toBe('2026-08-01');
    expect(u.kin.rel).toBe('Sister');
    // Rent accrues immediately from the tenure start
    expect(dueOf(u, '2026-08-01')).toBe(300000);
    // Sunday Mtaki's transactions are all still present
    expect(SEED_TXNS.filter((t) => t.tenant === 'Sunday Mtaki')).toHaveLength(6);
  });
});

describe('applyEditTenant — rename propagates to history only for that unit', () => {
  test('renames unit + matching txns, leaves lease untouched', () => {
    const { units, txns } = applyEditTenant(SEED_UNITS, SEED_TXNS, {
      unitId: 'ilazo1',
      name: 'Sunday M. Mtaki',
      phone: '+255 712 000 999',
      kin: { name: 'Neema Mtaki', phone: '+255 754 110 220', rel: 'Sister' },
    });
    const u = units.find((x) => x.id === 'ilazo1')!;
    expect(u.tenant).toBe('Sunday M. Mtaki');
    expect(u.leaseStart).toBe('2024-10-24');
    expect(u.nextDue).toBe('2026-06-24');
    expect(txns.filter((t) => t.tenant === 'Sunday M. Mtaki')).toHaveLength(6);
    expect(txns.filter((t) => t.tenant === 'Sunday Mtaki')).toHaveLength(0);
    // Other tenants untouched
    expect(txns.filter((t) => t.tenant === 'Muhamud Mukhsin')).toHaveLength(8);
  });
});

describe('monthsElapsed & periodProgressPct', () => {
  test('monthsElapsed counts month-period starts on/before asOf', () => {
    expect(monthsElapsed('2024-05-20', '2026-07-02')).toBe(26);
    expect(monthsElapsed('2024-07-01', '2024-09-30')).toBe(3);
    expect(monthsElapsed('2024-07-01', '2024-06-30')).toBe(0);
  });

  test('progress through the current billing period is clamped', () => {
    expect(periodProgressPct('2026-06-24', '2026-06-23')).toBe(97); // 30/31 days
    expect(periodProgressPct('2026-06-24', '2026-07-30')).toBe(100);
    expect(periodProgressPct('2026-06-24', '2026-05-24')).toBe(5); // period just started
  });
});

describe('formatters', () => {
  test('fmt uses thousands separators', () => {
    expect(fmt(20010000)).toBe('20,010,000');
    expect(fmt(300000)).toBe('300,000');
    expect(fmt(-600000)).toBe('600,000');
    expect(fmt(0)).toBe('0');
  });

  test('parseAmt strips formatting', () => {
    expect(parseAmt('1,200,000')).toBe(1200000);
    expect(parseAmt('900000')).toBe(900000);
    expect(parseAmt('')).toBe(0);
    expect(parseAmt('abc')).toBe(0);
  });

  test('initials strip honorifics', () => {
    expect(initials('Mr. Julius')).toBe('J');
    expect(initials('Sunday Mtaki')).toBe('SM');
    expect(initials('Dodoma Contemporary Appartments')).toBe('DC');
  });
});
