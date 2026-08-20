import { supabaseAdmin } from '../supabase.js';
import { normalizeIndianState } from './indianStates.js';

export const HOLIDAY_CALENDAR_WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday'
];

export function weekdayFromIsoDate(isoDate) {
  const s = String(isoDate ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return HOLIDAY_CALENDAR_WEEKDAYS[d.getUTCDay()] ?? null;
}

export function parseHolidayDate(raw) {
  const s = String(raw ?? '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  if (d.toISOString().slice(0, 10) !== s) return null;
  return s;
}

export function normalizeHolidayType(raw) {
  const t = String(raw ?? '').trim().toUpperCase();
  if (t === 'FH') return 'FH';
  if (t === 'NH') return 'NH';
  return null;
}

export function yearFromIsoDate(isoDate) {
  const s = String(isoDate ?? '').slice(0, 4);
  const y = Number(s);
  return Number.isInteger(y) && y >= 1900 && y <= 2100 ? y : null;
}

export function parseCalendarYear(raw) {
  const y = Number(String(raw ?? '').trim());
  if (!Number.isInteger(y) || y < 1900 || y > 2100) return null;
  return y;
}

const HOLIDAY_NAME_MAX = 120;
const HOLIDAY_CALENDAR_SELECT = 'id, state, holiday_date, weekday, holiday_type, holiday_name';

export function normalizeHolidayName(raw) {
  const name = String(raw ?? '').trim().slice(0, HOLIDAY_NAME_MAX);
  return name || null;
}

export function mapHolidayCalendarRow(row) {
  const holiday_date = String(row?.holiday_date ?? '').slice(0, 10);
  return {
    id: row?.id ?? null,
    state: row?.state ?? '',
    holiday_date,
    weekday: row?.weekday || weekdayFromIsoDate(holiday_date) || '',
    holiday_type: row?.holiday_type === 'FH' ? 'FH' : 'NH',
    holiday_name: normalizeHolidayName(row?.holiday_name)
  };
}

function holidayCalendarDbError(error) {
  const msg = String(error?.message || '');
  if (msg.includes('holiday_name')) {
    return new Error(
      'Holiday name column is missing. Run migration 20260820170000_holiday_calendars_name.sql in Supabase.'
    );
  }
  if (msg.includes('holiday_calendars')) {
    return new Error(
      'Holiday calendar table is missing. Run migration 20260820140000_holiday_calendars.sql in Supabase.'
    );
  }
  return error;
}

export function normalizeHolidayCalendarItems(rawItems) {
  const errors = [];
  const items = [];
  const seen = new Set();

  if (!Array.isArray(rawItems)) {
    return { items, errors: ['items array is required'] };
  }

  for (let i = 0; i < rawItems.length; i += 1) {
    const raw = rawItems[i];
    const state = normalizeIndianState(raw?.state);
    if (!state) {
      errors.push(`Item ${i + 1}: invalid state "${raw?.state ?? ''}"`);
      continue;
    }
    const holiday_date = parseHolidayDate(raw?.holiday_date ?? raw?.date);
    if (!holiday_date) {
      errors.push(`Item ${i + 1}: invalid date "${raw?.holiday_date ?? raw?.date ?? ''}"`);
      continue;
    }
    const holiday_type = normalizeHolidayType(raw?.holiday_type ?? raw?.['NH/FH']);
    if (!holiday_type) {
      errors.push(`Item ${i + 1}: NH/FH must be NH or FH`);
      continue;
    }
    const key = `${state}|${holiday_date}`;
    if (seen.has(key)) {
      errors.push(`Item ${i + 1}: duplicate ${state} ${holiday_date}`);
      continue;
    }
    seen.add(key);
    items.push({
      state,
      holiday_date,
      weekday: weekdayFromIsoDate(holiday_date),
      holiday_type,
      holiday_name: normalizeHolidayName(raw?.holiday_name ?? raw?.['Holiday Name'] ?? raw?.name),
      updated_at: new Date().toISOString()
    });
  }

  return { items, errors };
}

function stateYearKeys(items) {
  const pairs = [];
  const seen = new Set();
  for (const item of items ?? []) {
    const year = yearFromIsoDate(item.holiday_date);
    if (!item.state || !year) continue;
    const key = `${item.state}|${year}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push({ state: item.state, year });
  }
  return pairs;
}

export async function listHolidayCalendars({ state, year } = {}) {
  let query = supabaseAdmin
    .from('holiday_calendars')
    .select(HOLIDAY_CALENDAR_SELECT)
    .order('state', { ascending: true })
    .order('holiday_date', { ascending: true })
    .limit(20000);

  if (state) {
    const normalized = normalizeIndianState(state);
    if (!normalized) {
      const err = new Error('Invalid Indian state/UT');
      err.status = 400;
      throw err;
    }
    query = query.eq('state', normalized);
  }

  if (year != null && year !== '') {
    const y = parseCalendarYear(year);
    if (!y) {
      const err = new Error('year must be a 4-digit calendar year');
      err.status = 400;
      throw err;
    }
    query = query.gte('holiday_date', `${y}-01-01`).lte('holiday_date', `${y}-12-31`);
  }

  const { data, error } = await query;
  if (error) throw holidayCalendarDbError(error);
  return (data ?? []).map(mapHolidayCalendarRow);
}

export async function replaceHolidayCalendars(rawItems) {
  const { items, errors } = normalizeHolidayCalendarItems(rawItems);
  if (errors.length) {
    const err = new Error(errors.join('; '));
    err.status = 400;
    err.details = errors;
    throw err;
  }
  if (!items.length) {
    const err = new Error('items array is required');
    err.status = 400;
    throw err;
  }

  const pairs = stateYearKeys(items);
  for (const { state, year } of pairs) {
    const { error: delErr } = await supabaseAdmin
      .from('holiday_calendars')
      .delete()
      .eq('state', state)
      .gte('holiday_date', `${year}-01-01`)
      .lte('holiday_date', `${year}-12-31`);
    if (delErr) throw delErr;
  }

  const { data, error } = await supabaseAdmin
    .from('holiday_calendars')
    .insert(items)
    .select(HOLIDAY_CALENDAR_SELECT);
  if (error) throw holidayCalendarDbError(error);

  return {
    items: (data ?? []).map(mapHolidayCalendarRow),
    replaced: pairs
  };
}

export async function findDefaultCalendarClientIds() {
  const { data: policies, error: pErr } = await supabaseAdmin
    .from('client_attendance_policies')
    .select('client_id')
    .eq('holiday_source', 'default');
  if (pErr) throw pErr;
  return [...new Set((policies ?? []).map((p) => p.client_id).filter(Boolean))];
}
