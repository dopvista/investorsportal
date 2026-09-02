/**
 * Validates the seed ledger against the owner's real transaction history
 * (source_transactions.csv) — every row must be present with the same date,
 * unit, amount and type, and nothing extra.
 */
import * as fs from 'fs';
import * as path from 'path';
import { SEED_TXNS } from '../seed';

interface CsvRow {
  n: number;
  date: string;
  unit: string;
  type: 'rent' | 'expense';
  amount: number;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQ = false;
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQ = true;
    } else if (c === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

function loadCsv(): CsvRow[] {
  const raw = fs.readFileSync(path.join(__dirname, 'fixtures', 'source_transactions.csv'), 'utf8');
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  return lines.slice(1).map((line) => {
    const f = parseCsvLine(line);
    const unitName = f[4]; // 'Ilazo 2' or ''
    const amount = [f[8], f[9], f[10], f[11]].map((v) => parseFloat(v) || 0).reduce((a, b) => a + b, 0);
    return {
      n: Number(f[0]),
      date: f[1],
      unit: unitName ? unitName.toLowerCase().replace(/\s+/g, '') : '',
      type: f[5] === 'Rent payment' ? 'rent' : 'expense',
      amount: Math.round(amount),
    };
  });
}

describe('seed data vs source_transactions.csv', () => {
  const csv = loadCsv();

  test('the CSV has 21 transactions: 20 rent + 1 expense', () => {
    expect(csv).toHaveLength(21);
    expect(csv.filter((r) => r.type === 'rent')).toHaveLength(20);
    expect(csv.filter((r) => r.type === 'expense')).toHaveLength(1);
  });

  test('every CSV row appears in the seed with identical date/unit/amount/type', () => {
    expect(SEED_TXNS).toHaveLength(csv.length);
    // Seed is newest-first; CSV is oldest-first — align by reversing.
    const seedOldestFirst = SEED_TXNS.slice().reverse();
    csv.forEach((row, i) => {
      const t = seedOldestFirst[i];
      expect({ date: t.date, unit: t.unit, type: t.type, amount: t.amount }).toEqual({
        date: row.date,
        unit: row.unit,
        type: row.type,
        amount: row.amount,
      });
    });
  });

  test('CSV grand totals match the app aggregates', () => {
    const rent = csv.filter((r) => r.type === 'rent').reduce((a, r) => a + r.amount, 0);
    const exp = csv.filter((r) => r.type === 'expense').reduce((a, r) => a + r.amount, 0);
    expect(rent).toBe(20010000);
    expect(exp).toBe(1500000);
  });
});
