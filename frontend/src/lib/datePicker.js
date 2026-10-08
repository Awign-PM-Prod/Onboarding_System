/** Pure date helpers for the DatePicker / MonthPicker components. Months are 0-based. */

export const MONTH_SHORT_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

export const MONTH_LONG_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export const WEEKDAY_SHORT_NAMES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const pad2 = (n) => String(n).padStart(2, '0');

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

export function parseIsoDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? '').trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  if (month < 0 || month > 11 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

export function parseIsoMonth(value) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(value ?? '').trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  if (month < 0 || month > 11) return null;
  return { year, month };
}

export function toIsoDate(year, month, day) {
  return `${year}-${pad2(month + 1)}-${pad2(day)}`;
}

export function toIsoMonth(year, month) {
  return `${year}-${pad2(month + 1)}`;
}

export function todayIsoDate() {
  const now = new Date();
  return toIsoDate(now.getFullYear(), now.getMonth(), now.getDate());
}

export function shiftMonth(year, month, delta) {
  const total = year * 12 + month + delta;
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
}

/** 6 weeks x 7 days, Sunday first, including spill-over days from adjacent months. */
export function buildMonthGrid(year, month) {
  const leading = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const cells = [];
  for (let i = 0; i < 42; i += 1) {
    const d = new Date(Date.UTC(year, month, 1 - leading + i));
    cells.push({
      iso: toIsoDate(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
      day: d.getUTCDate(),
      inMonth: d.getUTCMonth() === month
    });
  }
  return cells;
}

/** ISO strings compare correctly as plain strings; min/max are inclusive. */
export function isDayDisabled(iso, min, max) {
  if (min && iso < String(min).slice(0, 10)) return true;
  if (max && iso > String(max).slice(0, 10)) return true;
  return false;
}

export function isMonthDisabled(isoMonth, min, max) {
  if (min && isoMonth < String(min).slice(0, 7)) return true;
  if (max && isoMonth > String(max).slice(0, 7)) return true;
  return false;
}

export function clampIsoDate(iso, min, max) {
  const lo = min ? String(min).slice(0, 10) : '';
  const hi = max ? String(max).slice(0, 10) : '';
  if (lo && iso < lo) return lo;
  if (hi && iso > hi) return hi;
  return iso;
}

/** Keeps a {year, month} view inside the min/max range (bounds may be YYYY-MM or YYYY-MM-DD). */
export function clampView(year, month, min, max) {
  const key = toIsoMonth(year, month);
  const lo = min ? String(min).slice(0, 7) : '';
  const hi = max ? String(max).slice(0, 7) : '';
  const target = (lo && key < lo && lo) || (hi && key > hi && hi) || '';
  return parseIsoMonth(target) ?? { year, month };
}

export function buildYearRange({ min, max, selectedYear, today = new Date().getFullYear() } = {}) {
  const minYear = Number(String(min ?? '').slice(0, 4)) || null;
  const maxYear = Number(String(max ?? '').slice(0, 4)) || null;
  let start = minYear ?? today - 50;
  let end = maxYear ?? today + 10;
  if (Number.isFinite(selectedYear)) {
    start = Math.min(start, selectedYear);
    end = Math.max(end, selectedYear);
  }
  const years = [];
  for (let y = start; y <= end; y += 1) years.push(y);
  return years;
}

export function formatDisplayDate(value) {
  const parsed = parseIsoDate(value);
  if (!parsed) return '';
  return `${pad2(parsed.day)} ${MONTH_SHORT_NAMES[parsed.month]} ${parsed.year}`;
}

export function formatDisplayMonth(value) {
  const parsed = parseIsoMonth(value);
  if (!parsed) return '';
  return `${MONTH_SHORT_NAMES[parsed.month]} ${parsed.year}`;
}
