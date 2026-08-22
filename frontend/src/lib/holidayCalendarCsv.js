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
  const s = String(raw ?? '').trim().split(/[\sT]/)[0];
  if (!s) return null;

  let year;
  let month;
  let day;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]);
    day = Number(iso[3]);
  } else {
    const dmy = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
    if (!dmy) return null;
    day = Number(dmy[1]);
    month = Number(dmy[2]);
    year = Number(dmy[3]);
  }

  if (!Number.isInteger(year) || year < 1900 || year > 2100) return null;
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  if (!Number.isInteger(day) || day < 1 || day > 31) return null;
  const isoDate = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const d = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== isoDate) return null;
  return isoDate;
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
      ['Maharashtra', '2026-01-26', 'Monday', 'NH', 'Republic Day']
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
      errors.push(`Row ${line}: invalid date "${row.date ?? ''}".`);
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
