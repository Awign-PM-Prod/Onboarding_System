import Papa from 'papaparse';
import { normalizeIndianState } from './indianStates.js';
import {
  normalizeHolidayName,
  normalizeHolidayType,
  parseHolidayDate,
  weekdayFromIsoDate
} from './holidayCalendar.js';

export const HOLIDAY_CALENDAR_CSV_HEADERS = ['state', 'date', 'day', 'NH/FH', 'Holiday Name'];

const SAMPLE_ROWS = [
  {
    state: 'Maharashtra',
    date: '2026-01-26',
    day: 'Monday',
    'NH/FH': 'NH',
    'Holiday Name': 'Republic Day'
  }
];

export function buildHolidayCalendarTemplateCsv() {
  return Papa.unparse({
    fields: HOLIDAY_CALENDAR_CSV_HEADERS,
    data: SAMPLE_ROWS.map((r) => [r.state, r.date, r.day, r['NH/FH'], r['Holiday Name']])
  });
}

export function buildHolidayCalendarCsv(rows) {
  const data = (rows ?? []).map((r) => {
    const date = String(r.holiday_date ?? r.date ?? '').slice(0, 10);
    return [
      r.state ?? '',
      date,
      r.weekday || r.day || weekdayFromIsoDate(date) || '',
      r.holiday_type === 'FH' ? 'FH' : 'NH',
      r.holiday_name ?? r['Holiday Name'] ?? ''
    ];
  });
  return Papa.unparse({
    fields: HOLIDAY_CALENDAR_CSV_HEADERS,
    data
  });
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

function isBlank(raw) {
  return raw === undefined || raw === null || String(raw).trim() === '';
}

export function parseHolidayCalendarCsvText(text) {
  const parsed = Papa.parse(String(text ?? ''), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: normalizeHeader
  });

  if (parsed.errors?.length) {
    const msg = parsed.errors[0]?.message || 'Could not parse CSV.';
    const err = new Error(msg);
    err.status = 400;
    throw err;
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

    const state = normalizeIndianState(row.state);
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
