import { addDays, addMonths, epochDays, fmtDate, monthYear, rangeStr, todayISO, yearOf } from '../dates';

describe('date math', () => {
  test('addMonths advances calendar months', () => {
    expect(addMonths('2024-05-20', 3)).toBe('2024-08-20');
    expect(addMonths('2024-10-24', 20)).toBe('2026-06-24');
    expect(addMonths('2026-01-08', 4)).toBe('2026-05-08');
    expect(addMonths('2025-11-15', 2)).toBe('2026-01-15');
  });

  test('addMonths clamps the day to the target month length', () => {
    expect(addMonths('2025-01-31', 1)).toBe('2025-02-28');
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29'); // leap year
    expect(addMonths('2025-03-31', 1)).toBe('2025-04-30');
  });

  test('addMonths accepts negative offsets', () => {
    expect(addMonths('2026-06-24', -1)).toBe('2026-05-24');
    expect(addMonths('2026-01-15', -2)).toBe('2025-11-15');
  });

  test('addDays crosses month and year boundaries', () => {
    expect(addDays('2026-06-24', -1)).toBe('2026-06-23');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2024-02-29', 1)).toBe('2024-03-01');
  });

  test('epochDays is monotonic across a month boundary', () => {
    expect(epochDays('2026-07-01') - epochDays('2026-06-30')).toBe(1);
    expect(epochDays('2026-06-24') - epochDays('2026-05-24')).toBe(31);
  });

  test('formatters', () => {
    expect(fmtDate('2024-07-01')).toBe('01 Jul 2024');
    expect(fmtDate('2026-06-23')).toBe('23 Jun 2026');
    expect(monthYear('2024-10-24')).toBe('Oct 2024');
    expect(yearOf('2025-12-31')).toBe(2025);
  });

  test('rangeStr omits the start year within one calendar year', () => {
    expect(rangeStr('2025-02-20', '2025-05-19')).toBe('20 Feb – 19 May 2025');
    expect(rangeStr('2024-12-06', '2025-04-05')).toBe('06 Dec 2024 – 05 Apr 2025');
  });

  test('todayISO reflects the provided clock', () => {
    expect(todayISO(new Date(2026, 6, 2))).toBe('2026-07-02');
  });
});
