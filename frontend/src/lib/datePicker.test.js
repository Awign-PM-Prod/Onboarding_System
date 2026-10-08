import { describe, expect, it } from 'vitest';
import {
  buildMonthGrid,
  buildYearRange,
  clampIsoDate,
  clampView,
  formatDisplayDate,
  formatDisplayMonth,
  isDayDisabled,
  isMonthDisabled,
  parseIsoDate,
  parseIsoMonth,
  shiftMonth,
  toIsoDate,
  toIsoMonth
} from './datePicker';

describe('parseIsoDate / toIsoDate', () => {
  it('parses a valid YYYY-MM-DD string', () => {
    expect(parseIsoDate('2026-10-08')).toEqual({ year: 2026, month: 9, day: 8 });
  });

  it('rejects malformed or impossible dates', () => {
    expect(parseIsoDate('')).toBeNull();
    expect(parseIsoDate(null)).toBeNull();
    expect(parseIsoDate('2026-1-8')).toBeNull();
    expect(parseIsoDate('2026-02-30')).toBeNull();
    expect(parseIsoDate('2026-13-01')).toBeNull();
  });

  it('accepts timestamps by reading the date part', () => {
    expect(parseIsoDate('2026-10-08T10:00:00Z')).toEqual({ year: 2026, month: 9, day: 8 });
  });

  it('formats zero-padded ISO dates', () => {
    expect(toIsoDate(2026, 0, 5)).toBe('2026-01-05');
  });
});

describe('parseIsoMonth / toIsoMonth', () => {
  it('round-trips YYYY-MM', () => {
    expect(parseIsoMonth('2026-03')).toEqual({ year: 2026, month: 2 });
    expect(toIsoMonth(2026, 2)).toBe('2026-03');
  });

  it('rejects malformed months', () => {
    expect(parseIsoMonth('2026-00')).toBeNull();
    expect(parseIsoMonth('2026-3')).toBeNull();
    expect(parseIsoMonth(undefined)).toBeNull();
  });
});

describe('shiftMonth', () => {
  it('wraps across year boundaries', () => {
    expect(shiftMonth(2026, 11, 1)).toEqual({ year: 2027, month: 0 });
    expect(shiftMonth(2026, 0, -1)).toEqual({ year: 2025, month: 11 });
  });
});

describe('buildMonthGrid', () => {
  it('returns 42 cells starting on Sunday with the month days marked', () => {
    const cells = buildMonthGrid(2026, 9);
    expect(cells).toHaveLength(42);
    // 1 Oct 2026 is a Thursday, so four leading days from September.
    expect(cells[0]).toEqual({ iso: '2026-09-27', day: 27, inMonth: false });
    expect(cells[4]).toEqual({ iso: '2026-10-01', day: 1, inMonth: true });
    expect(cells.filter((c) => c.inMonth)).toHaveLength(31);
  });
});

describe('isDayDisabled / isMonthDisabled', () => {
  it('respects inclusive min and max', () => {
    expect(isDayDisabled('2026-10-08', '2026-10-08', '2026-10-10')).toBe(false);
    expect(isDayDisabled('2026-10-07', '2026-10-08', undefined)).toBe(true);
    expect(isDayDisabled('2026-10-11', undefined, '2026-10-10')).toBe(true);
  });

  it('disables months entirely outside the range', () => {
    expect(isMonthDisabled('2026-09', '2026-10-01', undefined)).toBe(true);
    expect(isMonthDisabled('2026-10', '2026-10-15', undefined)).toBe(false);
    expect(isMonthDisabled('2026-11', undefined, '2026-10')).toBe(true);
  });
});

describe('clampIsoDate / clampView', () => {
  it('clamps dates into the inclusive range', () => {
    expect(clampIsoDate('2026-10-08', '2026-11-01', undefined)).toBe('2026-11-01');
    expect(clampIsoDate('2026-10-08', undefined, '2026-09-30')).toBe('2026-09-30');
    expect(clampIsoDate('2026-10-08', '', '')).toBe('2026-10-08');
  });

  it('moves the visible month into range', () => {
    expect(clampView(2026, 0, '2026-10-15', undefined)).toEqual({ year: 2026, month: 9 });
    expect(clampView(2027, 5, undefined, '2026-12')).toEqual({ year: 2026, month: 11 });
    expect(clampView(2026, 5, '2026-01-01', '2026-12-31')).toEqual({ year: 2026, month: 5 });
  });
});

describe('buildYearRange', () => {
  it('uses min/max years when provided', () => {
    expect(buildYearRange({ min: '2024-05-01', max: '2026-01-01', today: 2026 })).toEqual([
      2024, 2025, 2026
    ]);
  });

  it('defaults around the current year and always includes the selected year', () => {
    const years = buildYearRange({ selectedYear: 1950, today: 2026 });
    expect(years[0]).toBe(1950);
    expect(years.at(-1)).toBe(2036);
    expect(years).toContain(2026);
  });
});

describe('display formatting', () => {
  it('formats dates and months for humans', () => {
    expect(formatDisplayDate('2026-10-08')).toBe('08 Oct 2026');
    expect(formatDisplayMonth('2026-03')).toBe('Mar 2026');
    expect(formatDisplayDate('')).toBe('');
    expect(formatDisplayMonth('bad')).toBe('');
  });
});
