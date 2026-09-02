import { createAppStore, STORAGE_KEY, StorageAdapter } from '../createStore';
import { dueOf, isOwnerOccupied } from '../../core/engine';

/** In-memory AsyncStorage-compatible adapter. */
function memoryStorage(backing = new Map<string, string>()): StorageAdapter & { map: Map<string, string> } {
  return {
    map: backing,
    async getItem(k) {
      return backing.has(k) ? backing.get(k)! : null;
    },
    async setItem(k, v) {
      backing.set(k, v);
    },
    async removeItem(k) {
      backing.delete(k);
    },
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('app store', () => {
  test('first run seeds units, txns and company', async () => {
    const store = createAppStore(memoryStorage());
    await flush();
    const s = store.getState();
    expect(s.units).toHaveLength(3);
    expect(s.txns).toHaveLength(21);
    expect(s.company.name).toBe('Dodoma Contemporary Appartments');
    expect(s.hydrated).toBe(true);
  });

  test('recordPayment advances coverage and persists', async () => {
    const mem = memoryStorage();
    const store = createAppStore(mem);
    await flush();

    const txn = store.getState().recordPayment({
      unitId: 'ilazo2',
      amount: 900000,
      date: '2026-07-02',
      method: 'Bank transfer (CRDB)',
    });
    expect(txn.method).toBe('Bank transfer');
    expect(store.getState().txns).toHaveLength(22);
    expect(store.getState().units.find((u) => u.id === 'ilazo2')!.nextDue).toBe('2026-08-20');
    await flush();

    // Everything survives an app restart (new store on the same storage).
    const reloaded = createAppStore(mem);
    await flush();
    const s = reloaded.getState();
    expect(s.txns).toHaveLength(22);
    expect(s.txns[0].amount).toBe(900000);
    expect(s.units.find((u) => u.id === 'ilazo2')!.nextDue).toBe('2026-08-20');
    expect(dueOf(s.units.find((u) => u.id === 'ilazo2')!, '2026-07-02')).toBe(0);
  });

  test('payment evidence persists across restarts', async () => {
    const mem = memoryStorage();
    const store = createAppStore(mem);
    await flush();
    store.getState().recordPayment({
      unitId: 'ilazo1',
      amount: 300000,
      date: '2026-07-02',
      method: 'Mobile money',
      evidence: ['file:///doc/evidence/ev-123.jpg'],
    });
    await flush();

    const reloaded = createAppStore(mem);
    await flush();
    expect(reloaded.getState().txns[0].evidence).toEqual(['file:///doc/evidence/ev-123.jpg']);
  });

  test('registerTenant starts a fresh lease and persists; old ledger intact', async () => {
    const mem = memoryStorage();
    const store = createAppStore(mem);
    await flush();

    store.getState().registerTenant({
      unitId: 'ilazo1',
      name: 'Amina Hassan',
      phone: '+255 700 111 222',
      start: '2026-07-15',
      kin: { name: 'Neema Hassan', phone: '+255 700 333 444', rel: 'Sister' },
    });
    await flush();

    const reloaded = createAppStore(mem);
    await flush();
    const u = reloaded.getState().units.find((x) => x.id === 'ilazo1')!;
    expect(u.tenant).toBe('Amina Hassan');
    expect(u.leaseStart).toBe('2026-07-15');
    expect(u.nextDue).toBe('2026-07-15');
    expect(reloaded.getState().txns.filter((t) => t.tenant === 'Sunday Mtaki')).toHaveLength(6);
  });

  test('editTenant renames history and persists', async () => {
    const mem = memoryStorage();
    const store = createAppStore(mem);
    await flush();

    store.getState().editTenant({
      unitId: 'ilazo3',
      name: 'Frederick J. Mbwana',
      phone: '+255 714 000 333',
      kin: { name: 'Joseph Mbwana', phone: '+255 756 550 660', rel: 'Brother' },
    });
    await flush();

    const reloaded = createAppStore(mem);
    await flush();
    expect(reloaded.getState().units.find((x) => x.id === 'ilazo3')!.tenant).toBe('Frederick J. Mbwana');
    expect(reloaded.getState().txns.filter((t) => t.tenant === 'Frederick J. Mbwana')).toHaveLength(1);
    expect(reloaded.getState().txns.filter((t) => t.tenant === 'Frederick Mbwana')).toHaveLength(0);
  });

  test('addUnit creates a vacant unit that persists and can then be let', async () => {
    const mem = memoryStorage();
    const store = createAppStore(mem);
    await flush();

    store.getState().addUnit({ name: 'Ilazo 4', type: 'Single', rent: 350000, date: '2026-07-03' });
    await flush();

    const reloaded = createAppStore(mem);
    await flush();
    expect(reloaded.getState().units).toHaveLength(4);
    const u = reloaded.getState().units.find((x) => x.name === 'Ilazo 4')!;
    expect(u).toMatchObject({ type: 'Single', rent: 350000, tenant: '' });

    // Fill it with the normal register-tenant flow
    reloaded.getState().registerTenant({
      unitId: u.id,
      name: 'Halima Juma',
      phone: '+255 700 999 888',
      start: '2026-08-01',
      kin: { name: '', phone: '', rel: '' },
    });
    expect(reloaded.getState().units.find((x) => x.id === u.id)!.tenant).toBe('Halima Juma');
  });

  test('addUnit with an owner creates an owner-occupied unit (rent 0) that persists', async () => {
    const mem = memoryStorage();
    const store = createAppStore(mem);
    await flush();

    store.getState().addUnit({
      name: 'Ilazo 5',
      type: 'Family',
      rent: 300000, // ignored when owner is set
      date: '2026-07-04',
      owner: 'Dodoma Contemporary (owner)',
    });
    await flush();

    const reloaded = createAppStore(mem);
    await flush();
    const u = reloaded.getState().units.find((x) => x.name === 'Ilazo 5')!;
    expect(u).toMatchObject({ rent: 0, tenant: 'Dodoma Contemporary (owner)' });
    expect(isOwnerOccupied(u)).toBe(true);
    expect(dueOf(u, '2030-01-01')).toBe(0);
  });

  test('saveCompany persists edits', async () => {
    const mem = memoryStorage();
    const store = createAppStore(mem);
    await flush();
    store.getState().saveCompany({ ...store.getState().company, short: 'DCA', tin: '999-888-777' });
    await flush();

    const reloaded = createAppStore(mem);
    await flush();
    expect(reloaded.getState().company.short).toBe('DCA');
    expect(reloaded.getState().company.tin).toBe('999-888-777');
  });

  test('resetToSeed restores pristine data', async () => {
    const mem = memoryStorage();
    const store = createAppStore(mem);
    await flush();
    store.getState().recordPayment({ unitId: 'ilazo1', amount: 300000, date: '2026-07-02', method: 'Cash' });
    expect(store.getState().txns).toHaveLength(22);
    store.getState().resetToSeed();
    expect(store.getState().txns).toHaveLength(21);
    expect(store.getState().units.find((u) => u.id === 'ilazo1')!.nextDue).toBe('2026-06-24');
  });

  test('derived state is never persisted — only units, txns, company', async () => {
    const mem = memoryStorage();
    createAppStore(mem);
    await flush();
    // trigger a write
    const store = createAppStore(mem);
    await flush();
    store.getState().saveCompany(store.getState().company);
    await flush();
    const raw = JSON.parse(mem.map.get(STORAGE_KEY)!);
    expect(Object.keys(raw.state).sort()).toEqual(['company', 'txns', 'units']);
  });
});
