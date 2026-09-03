import { mergeLedgers, recomputeNextDue, type Ledger } from '../merge';
import { dueOf } from '../engine';
import { SEED_COMPANY, SEED_TXNS, SEED_UNITS } from '../seed';
import type { Txn, Unit } from '../types';

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const base = (): Ledger => clone({ units: SEED_UNITS, txns: SEED_TXNS, company: SEED_COMPANY });

/** A payment recorded the way applyPayment would record it. */
function pay(id: string, unit: Unit, date: string, months: number): Txn {
  return {
    id, date, tenant: unit.tenant, unit: unit.id,
    amount: months * unit.rent, method: 'Bank transfer',
    covers: `${months} months`, type: 'rent', months,
  };
}

describe('recomputeNextDue', () => {
  test('reproduces the seed pointers exactly (no drift vs the engine)', () => {
    for (const u of SEED_UNITS) {
      expect(recomputeNextDue(u, SEED_TXNS)).toBe(u.nextDue);
    }
  });
});

describe('mergeLedgers', () => {
  test('keeps payments made on BOTH phones offline (the whole point)', () => {
    const local = base();
    const remote = base();
    const u = local.units[0];

    local.txns = [pay('L1', u, '2026-07-10', 1), ...local.txns];
    local.units = local.units.map((x) => (x.id === u.id ? { ...x, nextDue: recomputeNextDue(x, local.txns) } : x));

    remote.txns = [pay('R1', u, '2026-07-11', 2), ...remote.txns];
    remote.units = remote.units.map((x) => (x.id === u.id ? { ...x, nextDue: recomputeNextDue(x, remote.txns) } : x));

    const merged = mergeLedgers(local, remote, true);
    const ids = merged.txns.map((t) => t.id);
    expect(ids).toContain('L1');
    expect(ids).toContain('R1');

    // 3 extra months of coverage, not 1 and not 2.
    const seedUnit = SEED_UNITS.find((x) => x.id === u.id)!;
    const mergedUnit = merged.units.find((x) => x.id === u.id)!;
    const expected = recomputeNextDue({ ...seedUnit }, merged.txns);
    expect(mergedUnit.nextDue).toBe(expected);
    expect(mergedUnit.nextDue).not.toBe(local.units.find((x) => x.id === u.id)!.nextDue);
  });

  test('is idempotent — merging twice changes nothing', () => {
    const local = base();
    const remote = base();
    remote.txns = [pay('R1', remote.units[1], '2026-07-01', 1), ...remote.txns];
    const once = mergeLedgers(local, remote, false);
    const twice = mergeLedgers(once, remote, false);
    expect(twice).toEqual(once);
  });

  test('is order-independent for the additive part (both phones agree)', () => {
    const a = base(); const b = base();
    a.txns = [pay('A1', a.units[0], '2026-07-02', 1), ...a.txns];
    b.txns = [pay('B1', b.units[0], '2026-07-03', 1), ...b.txns];
    const ab = mergeLedgers(a, b, false);
    const ba = mergeLedgers(b, a, true);
    expect(ab.txns.map((t) => t.id).sort()).toEqual(ba.txns.map((t) => t.id).sort());
    expect(ab.units.find((u) => u.id === a.units[0].id)!.nextDue)
      .toBe(ba.units.find((u) => u.id === a.units[0].id)!.nextDue);
  });

  test('never double-counts a payment both phones already had', () => {
    const local = base();
    const remote = base();
    const merged = mergeLedgers(local, remote, true);
    expect(merged.txns).toHaveLength(SEED_TXNS.length);
    for (const u of merged.units) {
      expect(u.nextDue).toBe(SEED_UNITS.find((x) => x.id === u.id)!.nextDue);
    }
  });

  test('a unit added on only one phone survives the merge', () => {
    const local = base();
    const remote = base();
    const extra: Unit = {
      id: 'ilazo9', name: 'Ilazo 9', type: 'Single', rent: 300000,
      tenant: 'New Person', phone: '', leaseStart: '2026-06-01', nextDue: '2026-06-01',
      kin: { name: '', phone: '', rel: '' },
    };
    remote.units = [...remote.units, extra];
    const merged = mergeLedgers(local, remote, false);
    expect(merged.units.map((u) => u.id)).toContain('ilazo9');
  });

  test('preferLocal decides edited fields (company / rent), not payments', () => {
    const local = base(); const remote = base();
    local.company = { ...local.company, name: 'Local Co' };
    remote.company = { ...remote.company, name: 'Remote Co' };
    expect(mergeLedgers(local, remote, true).company.name).toBe('Local Co');
    expect(mergeLedgers(local, remote, false).company.name).toBe('Remote Co');
  });

  // The Fold case: a phone that sat unopened for days, then signed in. The
  // provider passes preferLocal=false for a phone that has never synced, so
  // its staleness must not travel upward — while anything only it has is
  // still kept.
  test('a stale phone signing in does not push its staleness over the cloud', () => {
    const remote = base();                       // the good, current cloud copy
    const stale = base();
    stale.units = stale.units.slice(0, 4);       // missing the newest unit
    stale.txns = stale.txns.slice(5);            // missing the newest payments
    stale.units[0] = { ...stale.units[0], rent: 111 };      // an old rent figure
    stale.company = { ...stale.company, name: 'Stale Co' };
    const onlyHere = pay('FOLD1', stale.units[1], '2026-08-20', 1);
    stale.txns = [onlyHere, ...stale.txns];      // ...but one payment only it has

    const merged = mergeLedgers(stale, remote, false);

    // Nothing stale wins.
    expect(merged.units).toHaveLength(remote.units.length);
    expect(merged.units.find((u) => u.id === remote.units[0].id)!.rent).toBe(remote.units[0].rent);
    expect(merged.company.name).toBe(remote.company.name);
    // Every payment the cloud had is still there...
    for (const t of remote.txns) expect(merged.txns.map((x) => x.id)).toContain(t.id);
    // ...and the one the stale phone alone held is kept, not discarded.
    expect(merged.txns.map((t) => t.id)).toContain('FOLD1');
  });

  test('merged balance stays consistent with the engine', () => {
    const local = base(); const remote = base();
    const u = remote.units[1];
    remote.txns = [pay('R9', u, '2026-08-01', 2), ...remote.txns];
    const merged = mergeLedgers(local, remote, false);
    const mu = merged.units.find((x) => x.id === u.id)!;
    // dueOf must not throw and must agree with the recomputed pointer.
    expect(dueOf(mu, '2026-09-03')).toBe(dueOf({ ...mu, nextDue: recomputeNextDue(mu, merged.txns) }, '2026-09-03'));
  });
});
