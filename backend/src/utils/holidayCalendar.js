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

const HOLIDAY_NAME_MAX = 120;
const CALENDAR_NAME_MAX = 100;
const HOLIDAY_CALENDAR_SELECT = 'id, calendar_id, state, holiday_date, weekday, holiday_type, holiday_name';
const DEF_SELECT = 'id, name, is_default, client_id, created_at, updated_at';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFS_MIGRATION = '20260820200000_holiday_calendar_defs.sql';

export function weekdayFromIsoDate(isoDate) {
  const s = String(isoDate ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return HOLIDAY_CALENDAR_WEEKDAYS[d.getUTCDay()] ?? null;
}

export function parseHolidayDate(raw) {
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

export function normalizeHolidayName(raw) {
  const name = String(raw ?? '').trim().slice(0, HOLIDAY_NAME_MAX);
  return name || null;
}

export function normalizeHolidayCalendarId(raw) {
  const s = String(raw ?? '').trim();
  if (!s || s.toLowerCase() === 'default') return null;
  if (!UUID_RE.test(s)) return null;
  return s;
}

export function mapHolidayCalendarRow(row) {
  const holiday_date = String(row?.holiday_date ?? '').slice(0, 10);
  return {
    id: row?.id ?? null,
    calendar_id: row?.calendar_id ?? null,
    state: row?.state ?? '',
    holiday_date,
    weekday: row?.weekday || weekdayFromIsoDate(holiday_date) || '',
    holiday_type: row?.holiday_type === 'FH' ? 'FH' : 'NH',
    holiday_name: normalizeHolidayName(row?.holiday_name)
  };
}

function holidayCalendarDbError(error) {
  const msg = String(error?.message || '');
  if (msg.includes('holiday_calendar_defs') || msg.includes('calendar_id') || msg.includes('holiday_calendar_id')) {
    return new Error(
      `Named holiday calendars are missing. Run migration ${DEFS_MIGRATION} in Supabase.`
    );
  }
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

function badRequest(message, details) {
  const err = new Error(message);
  err.status = 400;
  if (details) err.details = details;
  return err;
}

export function mapHolidayCalendarDef(row) {
  if (!row) return null;
  const client = row.client && typeof row.client === 'object' && !Array.isArray(row.client)
    ? row.client
    : null;
  return {
    id: row.id,
    name: String(row.name ?? '').trim(),
    is_default: row.is_default === true,
    client_id: row.client_id ?? null,
    client_name: client?.client_name ?? row.client_name ?? null,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null
  };
}

export async function getDefaultCalendarDef() {
  const { data, error } = await supabaseAdmin
    .from('holiday_calendar_defs')
    .select(DEF_SELECT)
    .eq('is_default', true)
    .maybeSingle();
  if (error) throw holidayCalendarDbError(error);
  if (!data) {
    throw new Error(`Default holiday calendar is missing. Run migration ${DEFS_MIGRATION} in Supabase.`);
  }
  return mapHolidayCalendarDef(data);
}

export async function getHolidayCalendarDef(id) {
  const raw = String(id ?? '').trim();
  if (!raw || raw.toLowerCase() === 'default') return getDefaultCalendarDef();
  if (!UUID_RE.test(raw)) throw badRequest('Invalid holiday calendar id');
  const { data, error } = await supabaseAdmin
    .from('holiday_calendar_defs')
    .select(`${DEF_SELECT}, client:client_id(id, client_name)`)
    .eq('id', raw)
    .maybeSingle();
  if (error) throw holidayCalendarDbError(error);
  if (!data) {
    const err = new Error('Holiday calendar not found');
    err.status = 404;
    throw err;
  }
  return mapHolidayCalendarDef(data);
}

export async function resolveCalendarId(rawId) {
  const def = rawId ? await getHolidayCalendarDef(rawId) : await getDefaultCalendarDef();
  if (def.is_default) return def.id;
  return def.id;
}

function sortDefs(defs) {
  return [...defs].sort((a, b) => {
    if (a.is_default && !b.is_default) return -1;
    if (!a.is_default && b.is_default) return 1;
    return a.name.localeCompare(b.name);
  });
}

export async function listHolidayCalendarDefs({ forClientId = null, includeAll = false } = {}) {
  const { data, error } = await supabaseAdmin
    .from('holiday_calendar_defs')
    .select(`${DEF_SELECT}, client:client_id(id, client_name)`)
    .order('is_default', { ascending: false })
    .order('name', { ascending: true })
    .limit(2000);
  if (error) throw holidayCalendarDbError(error);
  const mapped = (data ?? []).map(mapHolidayCalendarDef);
  if (includeAll) return sortDefs(mapped);

  const clientId = String(forClientId ?? '').trim() || null;
  return sortDefs(mapped.filter((d) => (
    d.is_default
    || !d.client_id
    || (clientId && d.client_id === clientId)
  )));
}

export async function uniqueClientCalendarName(clientName, clientId) {
  const base = `${String(clientName ?? '').trim() || 'Client'} calendar`.slice(0, 100);
  const suffix = ` (${String(clientId ?? '').replace(/-/g, '').slice(0, 8)})`;
  const { data, error } = await supabaseAdmin
    .from('holiday_calendar_defs')
    .select('name')
    .limit(2000);
  if (error) throw holidayCalendarDbError(error);
  const taken = new Set((data ?? []).map((d) => String(d.name ?? '').trim().toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  const withId = `${base.slice(0, Math.max(1, 100 - suffix.length))}${suffix}`.slice(0, 100);
  if (!taken.has(withId.toLowerCase())) return withId;
  return `${base.slice(0, 80)} ${Date.now()}`.slice(0, 100);
}

export async function createHolidayCalendarDef({ name, states = [], year, items } = {}) {
  const trimmed = String(name ?? '').trim().slice(0, CALENDAR_NAME_MAX);
  if (!trimmed) throw badRequest('Calendar name is required');

  const normalizedStates = [];
  const seenStates = new Set();
  for (const raw of Array.isArray(states) ? states : []) {
    const state = normalizeIndianState(raw);
    if (!state) throw badRequest(`Invalid Indian state/UT "${raw ?? ''}"`);
    if (seenStates.has(state)) continue;
    seenStates.add(state);
    normalizedStates.push(state);
  }

  const csvItems = Array.isArray(items) ? items : [];
  const seedYear = year != null && year !== '' ? parseCalendarYear(year) : null;
  if (!csvItems.length && normalizedStates.length && !seedYear) {
    throw badRequest('year is required when seeding states from Default');
  }

  const { data, error } = await supabaseAdmin
    .from('holiday_calendar_defs')
    .insert({
      name: trimmed,
      is_default: false,
      client_id: null,
      updated_at: new Date().toISOString()
    })
    .select(DEF_SELECT)
    .single();
  if (error) {
    const msg = String(error.message || '');
    if (msg.includes('holiday_calendar_defs_name') || msg.toLowerCase().includes('duplicate')) {
      throw badRequest(`A calendar named "${trimmed}" already exists`);
    }
    throw holidayCalendarDbError(error);
  }

  const created = mapHolidayCalendarDef(data);

  if (csvItems.length) {
    try {
      await replaceHolidayCalendars(csvItems, { calendarId: created.id });
    } catch (err) {
      await supabaseAdmin.from('holiday_calendar_defs').delete().eq('id', created.id);
      throw err;
    }
    return created;
  }

  if (normalizedStates.length && seedYear) {
    const defaultDef = await getDefaultCalendarDef();
    const { data: seedRows, error: seedErr } = await supabaseAdmin
      .from('holiday_calendars')
      .select(HOLIDAY_CALENDAR_SELECT)
      .eq('calendar_id', defaultDef.id)
      .in('state', normalizedStates)
      .gte('holiday_date', `${seedYear}-01-01`)
      .lte('holiday_date', `${seedYear}-12-31`)
      .limit(20000);
    if (seedErr) throw holidayCalendarDbError(seedErr);

    const items = (seedRows ?? []).map((row) => ({
      calendar_id: created.id,
      state: row.state,
      holiday_date: String(row.holiday_date).slice(0, 10),
      weekday: row.weekday || weekdayFromIsoDate(row.holiday_date),
      holiday_type: row.holiday_type === 'FH' ? 'FH' : 'NH',
      holiday_name: normalizeHolidayName(row.holiday_name),
      updated_at: new Date().toISOString()
    }));
    if (items.length) {
      const { error: insErr } = await supabaseAdmin.from('holiday_calendars').insert(items);
      if (insErr) throw holidayCalendarDbError(insErr);
    }
  }

  return created;
}

export async function assignHolidayCalendarToClient(clientId, calendarId) {
  const id = String(clientId ?? '').trim();
  if (!id) throw badRequest('client_id is required');

  const { data: owned, error: ownedErr } = await supabaseAdmin
    .from('holiday_calendar_defs')
    .select('id')
    .eq('client_id', id);
  if (ownedErr) throw holidayCalendarDbError(ownedErr);

  const nextId = normalizeHolidayCalendarId(calendarId);
  if (!nextId) {
    const ownedIds = (owned ?? []).map((r) => r.id).filter(Boolean);
    if (ownedIds.length) {
      const { error: clearErr } = await supabaseAdmin
        .from('holiday_calendar_defs')
        .update({ client_id: null, updated_at: new Date().toISOString() })
        .in('id', ownedIds);
      if (clearErr) throw holidayCalendarDbError(clearErr);
    }
    return null;
  }

  const def = await getHolidayCalendarDef(nextId);
  if (def.is_default) {
    return assignHolidayCalendarToClient(id, null);
  }
  if (def.client_id && def.client_id !== id) {
    throw badRequest(`Calendar "${def.name}" is already assigned to another client`);
  }

  const staleIds = (owned ?? []).map((r) => r.id).filter((oid) => oid !== def.id);
  if (staleIds.length) {
    const { error: clearErr } = await supabaseAdmin
      .from('holiday_calendar_defs')
      .update({ client_id: null, updated_at: new Date().toISOString() })
      .in('id', staleIds);
    if (clearErr) throw holidayCalendarDbError(clearErr);
  }

  if (def.client_id !== id) {
    const { error: asgErr } = await supabaseAdmin
      .from('holiday_calendar_defs')
      .update({ client_id: id, updated_at: new Date().toISOString() })
      .eq('id', def.id);
    if (asgErr) throw holidayCalendarDbError(asgErr);
  }

  return def.id;
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

export async function listHolidayCalendars({ state, year, calendarId } = {}) {
  const resolvedId = await resolveCalendarId(calendarId);
  let query = supabaseAdmin
    .from('holiday_calendars')
    .select(HOLIDAY_CALENDAR_SELECT)
    .eq('calendar_id', resolvedId)
    .order('state', { ascending: true })
    .order('holiday_date', { ascending: true })
    .limit(20000);

  if (state) {
    const normalized = normalizeIndianState(state);
    if (!normalized) {
      throw badRequest('Invalid Indian state/UT');
    }
    query = query.eq('state', normalized);
  }

  if (year != null && year !== '') {
    const y = parseCalendarYear(year);
    if (!y) {
      throw badRequest('year must be a 4-digit calendar year');
    }
    query = query.gte('holiday_date', `${y}-01-01`).lte('holiday_date', `${y}-12-31`);
  }

  const { data, error } = await query;
  if (error) throw holidayCalendarDbError(error);
  return (data ?? []).map(mapHolidayCalendarRow);
}

export async function replaceHolidayCalendars(rawItems, { calendarId } = {}) {
  const def = await getHolidayCalendarDef(calendarId);
  const { items, errors } = normalizeHolidayCalendarItems(rawItems);
  if (errors.length) {
    throw badRequest(errors.join('; '), errors);
  }
  if (!items.length) {
    throw badRequest('items array is required');
  }

  const pairs = stateYearKeys(items);
  for (const { state, year } of pairs) {
    const { error: delErr } = await supabaseAdmin
      .from('holiday_calendars')
      .delete()
      .eq('calendar_id', def.id)
      .eq('state', state)
      .gte('holiday_date', `${year}-01-01`)
      .lte('holiday_date', `${year}-12-31`);
    if (delErr) throw holidayCalendarDbError(delErr);
  }

  const rows = items.map((item) => ({ ...item, calendar_id: def.id }));
  const { data, error } = await supabaseAdmin
    .from('holiday_calendars')
    .insert(rows)
    .select(HOLIDAY_CALENDAR_SELECT);
  if (error) throw holidayCalendarDbError(error);

  return {
    items: (data ?? []).map(mapHolidayCalendarRow),
    replaced: pairs,
    calendar_id: def.id,
    is_default: def.is_default === true
  };
}

export async function replaceAllHolidayCalendars(rawItems, { calendarId } = {}) {
  const def = await getHolidayCalendarDef(calendarId);
  if (def.is_default) {
    throw badRequest('Default calendar dates cannot be replaced from a client form');
  }
  const dated = (rawItems ?? []).filter((h) => String(h?.holiday_date ?? '').trim());
  const { items, errors } = dated.length
    ? normalizeHolidayCalendarItems(dated)
    : { items: [], errors: [] };
  if (errors.length) {
    throw badRequest(errors.join('; '), errors);
  }

  const { error: delErr } = await supabaseAdmin
    .from('holiday_calendars')
    .delete()
    .eq('calendar_id', def.id);
  if (delErr) throw holidayCalendarDbError(delErr);

  if (!items.length) {
    return { items: [], calendar_id: def.id };
  }

  const rows = items.map((item) => ({ ...item, calendar_id: def.id }));
  const { data, error } = await supabaseAdmin
    .from('holiday_calendars')
    .insert(rows)
    .select(HOLIDAY_CALENDAR_SELECT);
  if (error) throw holidayCalendarDbError(error);
  return {
    items: (data ?? []).map(mapHolidayCalendarRow),
    calendar_id: def.id
  };
}

export async function findDefaultCalendarClientIds() {
  const defaultDef = await getDefaultCalendarDef();
  const { data: policies, error: pErr } = await supabaseAdmin
    .from('client_attendance_policies')
    .select('client_id')
    .or(`holiday_calendar_id.is.null,holiday_calendar_id.eq.${defaultDef.id}`);
  if (pErr) throw holidayCalendarDbError(pErr);
  return [...new Set((policies ?? []).map((p) => p.client_id).filter(Boolean))];
}

export async function findClientIdsForCalendarRecalc(calendarId) {
  const def = await getHolidayCalendarDef(calendarId);
  if (def.is_default) return findDefaultCalendarClientIds();
  return def.client_id ? [def.client_id] : [];
}
