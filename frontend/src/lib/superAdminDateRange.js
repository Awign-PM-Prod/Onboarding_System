export const MONTH_OPTIONS = [
  { value: '', label: 'Month' },
  { value: '01', label: 'January' },
  { value: '02', label: 'February' },
  { value: '03', label: 'March' },
  { value: '04', label: 'April' },
  { value: '05', label: 'May' },
  { value: '06', label: 'June' },
  { value: '07', label: 'July' },
  { value: '08', label: 'August' },
  { value: '09', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' }
];

export const WEEK_OPTIONS = [
  { value: '', label: 'Week' },
  { value: 'this', label: 'This week' },
  { value: '1', label: 'Last 1 week' },
  { value: '2', label: 'Last 2 weeks' },
  { value: '3', label: 'Last 3 weeks' },
  { value: '4', label: 'Last 4 weeks' },
  { value: '6', label: 'Last 6 weeks' },
  { value: '8', label: 'Last 8 weeks' },
  { value: '12', label: 'Last 12 weeks' }
];

function pad2(n) {
  return String(n).padStart(2, '0');
}

export function toYmd(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function startOfWeekMonday(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay(); // 0 Sun … 6 Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

/** Relative week presets → inclusive YYYY-MM-DD range ending today. */
export function rangeForWeekPreset(preset, today = new Date()) {
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (preset === 'this') {
    return { from: toYmd(startOfWeekMonday(end)), to: toYmd(end) };
  }
  const weeks = Number(preset);
  if (!Number.isFinite(weeks) || weeks <= 0) return null;
  const start = new Date(end);
  start.setDate(end.getDate() - weeks * 7);
  return { from: toYmd(start), to: toYmd(end) };
}

export function buildYearOptions() {
  const current = new Date().getFullYear();
  const years = [];
  for (let y = current; y >= current - 5; y -= 1) {
    years.push({ value: String(y), label: String(y) });
  }
  return [{ value: '', label: 'Year' }, ...years];
}

/**
 * Priority: custom → week → month(+year) → year → none.
 * @returns {{ from?: string, to?: string }}
 */
export function resolveDateRange({
  month = '',
  year = '',
  week = '',
  customFrom = '',
  customTo = ''
} = {}) {
  if (customFrom || customTo) {
    return {
      from: customFrom || undefined,
      to: customTo || undefined
    };
  }
  if (week) {
    return rangeForWeekPreset(week) || { from: undefined, to: undefined };
  }
  if (month) {
    const y = Number(year) || new Date().getFullYear();
    const m = Number(month);
    const from = `${y}-${pad2(m)}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    const to = `${y}-${pad2(m)}-${pad2(lastDay)}`;
    return { from, to };
  }
  if (year) {
    return { from: `${year}-01-01`, to: `${year}-12-31` };
  }
  return { from: undefined, to: undefined };
}

export function customRangeLabel(customFrom, customTo) {
  if (customFrom && customTo) return `${customFrom} – ${customTo}`;
  if (customFrom) return `From ${customFrom}`;
  if (customTo) return `Until ${customTo}`;
  return 'Custom Date Range';
}
