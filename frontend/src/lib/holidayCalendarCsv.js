import Papa from 'papaparse';
import { INDIAN_STATES } from './indianStates';

export const HOLIDAY_CALENDAR_CSV_HEADERS = ['state', 'date', 'day', 'NH/FH', 'Holiday Name'];

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const STATE_LOOKUP = new Map(INDIAN_STATES.map((s) => [s.toLowerCase(), s]));
const HOLIDAY_NAME_MAX = 120;

export function weekdayFromIsoDate(isoDate) {
  const s = String(isoDate ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '';
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  return WEEKDAYS[d.getUTCDay()] ?? '';
}

/** Display date like 15 Aug 2026. CSV/storage stay YYYY-MM-DD. */
export function formatHolidayDisplayDate(isoDate) {
  const s = String(isoDate ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s || '';
  const year = s.slice(0, 4);
  const month = MONTH_ABBR[Number(s.slice(5, 7)) - 1];
  const day = Number(s.slice(8, 10));
  if (!month || !Number.isInteger(day) || day < 1) return s;
  return `${day} ${month} ${year}`;
}

export function normalizeHolidayName(raw) {
  const name = String(raw ?? '').trim().slice(0, HOLIDAY_NAME_MAX);
  return name || null;
}

function normalizeStateName(raw) {
  const key = String(raw ?? '').trim().toLowerCase();
  if (!key) return null;
  return STATE_LOOKUP.get(key) ?? null;
}

function parseHolidayDate(raw) {
  const s = String(raw ?? '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return null;
  return s;
}

function normalizeHolidayType(raw) {
  const t = String(raw ?? '').trim().toUpperCase();
  if (t === 'FH') return 'FH';
  if (t === 'NH') return 'NH';
  return null;
}

function isBlank(raw) {
  return raw === undefined || raw === null || String(raw).trim() === '';
}

function normalizeHeader(h) {
  const raw = String(h ?? '').trim().toLowerCase();
  if (raw === 'nh/fh' || raw === 'nh-fh' || raw === 'type' || raw === 'holiday_type' || raw === 'holidaytype') {
    return 'holiday_type';
  }
  if (raw === 'date' || raw === 'holiday_date' || raw === 'holidaydate') return 'date';
  if (raw === 'day' || raw === 'weekday') return 'day';
  if (raw === 'state') return 'state';
  if (raw === 'holiday name' || raw === 'holiday_name' || raw === 'holidayname' || raw === 'name') {
    return 'holiday_name';
  }
  return raw.replace(/\s+/g, '_');
}

export function buildHolidayCalendarTemplateCsv() {
  return Papa.unparse({
    fields: HOLIDAY_CALENDAR_CSV_HEADERS,
    data: [
      ['Maharashtra', '2026-01-26', 'Monday', 'NH', 'Republic Day'],
      ['Maharashtra', '2026-08-15', 'Saturday', 'NH', 'Independence Day'],
      ['Karnataka', '2026-11-01', 'Sunday', 'FH', 'Kannada Rajyotsava']
    ]
  });
}

export function buildHolidayCalendarCsv(rows) {
  return Papa.unparse({
    fields: HOLIDAY_CALENDAR_CSV_HEADERS,
    data: (rows ?? []).map((r) => {
      const date = String(r.holiday_date ?? r.date ?? '').slice(0, 10);
      return [
        r.state ?? '',
        date,
        r.weekday || r.day || weekdayFromIsoDate(date),
        r.holiday_type === 'FH' ? 'FH' : 'NH',
        r.holiday_name ?? r['Holiday Name'] ?? ''
      ];
    })
  });
}

export function parseHolidayCalendarCsvText(text) {
  const parsed = Papa.parse(String(text ?? ''), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: normalizeHeader
  });

  if (parsed.errors?.length) {
    throw new Error(parsed.errors[0]?.message || 'Could not parse CSV.');
  }

  const items = [];
  const errors = [];
  const seen = new Set();

  for (let i = 0; i < (parsed.data ?? []).length; i += 1) {
    const row = parsed.data[i];
    const line = i + 2;
    if (
      isBlank(row.state)
      && isBlank(row.date)
      && isBlank(row.holiday_type)
      && isBlank(row.day)
      && isBlank(row.holiday_name)
    ) {
      continue;
    }

    const state = normalizeStateName(row.state);
    if (!state) {
      errors.push(`Row ${line}: invalid state "${row.state ?? ''}".`);
      continue;
    }
    const holiday_date = parseHolidayDate(row.date);
    if (!holiday_date) {
      errors.push(`Row ${line}: invalid date "${row.date ?? ''}" (use YYYY-MM-DD).`);
      continue;
    }
    const holiday_type = normalizeHolidayType(row.holiday_type);
    if (!holiday_type) {
      errors.push(`Row ${line}: NH/FH must be NH or FH.`);
      continue;
    }
    const key = `${state}|${holiday_date}`;
    if (seen.has(key)) {
      errors.push(`Row ${line}: duplicate ${state} ${holiday_date}.`);
      continue;
    }
    seen.add(key);
    items.push({
      state,
      holiday_date,
      weekday: weekdayFromIsoDate(holiday_date),
      holiday_type,
      holiday_name: normalizeHolidayName(row.holiday_name)
    });
  }

  return { items, errors };
}

export function buildHolidayCalendarImportSummary(items) {
  const byKey = new Map();
  for (const item of items ?? []) {
    const year = String(item.holiday_date ?? '').slice(0, 4);
    const key = `${item.state}|${year}`;
    if (!byKey.has(key)) {
      byKey.set(key, { state: item.state, year, count: 0, nh: 0, fh: 0 });
    }
    const entry = byKey.get(key);
    entry.count += 1;
    if (item.holiday_type === 'FH') entry.fh += 1;
    else entry.nh += 1;
  }
  return [...byKey.values()];
}
