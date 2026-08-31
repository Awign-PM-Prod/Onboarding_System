export {
  WEEK_OFF_PRESETS,
  WEEKDAY_NAMES,
  DEFAULT_WEEK_OFF_CONFIG,
  DEFAULT_ATTENDANCE_POLICY,
  normalizeAttendancePolicy,
  isWeekOffDate,
  getPayrollPeriod,
  payrollCycleLabel,
  datesInPeriod,
  validateAttendancePolicyPayload,
  validateLeaveAllowancesPayload,
  validateHolidaysPayload,
  normalizeHolidaySource,
  normalizeLeaveSource,
  validateLeaveConfigRulesPayload
} from './clientPolicyCore.js';

import { supabaseAdmin } from '../supabase.js';
import {
  DEFAULT_ATTENDANCE_POLICY,
  normalizeAttendancePolicy,
  normalizeHolidaySource,
  normalizeLeaveSource
} from './clientPolicyCore.js';
import {
  assignHolidayCalendarToClient,
  createHolidayCalendarDef,
  getHolidayCalendarDef,
  listHolidayCalendars,
  normalizeHolidayCalendarId,
  normalizeHolidayName,
  replaceAllHolidayCalendars,
  uniqueClientCalendarName
} from './holidayCalendar.js';
import {
  assignLeaveConfigToClient,
  createLeaveConfigDef,
  getLeaveConfigDef,
  listLeaveConfigRules,
  normalizeLeaveConfigId,
  replaceAllLeaveConfigRules,
  uniqueClientLeaveConfigName
} from './leaveConfig.js';
import {
  BASELINE_POLICY_MONTH,
  bundleToPolicyJson,
  monthYmToDate,
  normalizePolicyBundleFromJson,
  selectPolicyBundleForMonth
} from './clientPolicyVersioning.js';

export { BASELINE_POLICY_MONTH, monthYmToDate, selectPolicyBundleForMonth };

function mapCalendarHolidayRows(rows) {
  return (rows ?? []).map((h) => ({
    id: h.id,
    state: h.state || null,
    holiday_date: h.holiday_date,
    holiday_type: h.holiday_type === 'FH' ? 'FH' : 'NH',
    holiday_name: normalizeHolidayName(h.holiday_name)
  }));
}

/** Overlay live calendar dates for Default or a named calendar. Legacy custom snapshots keep stored holidays. */
async function applyAssignedCalendarHolidays(bundle, year) {
  const calendarId = normalizeHolidayCalendarId(bundle?.holiday_calendar_id);
  const source = normalizeHolidaySource(bundle?.holiday_source);
  const useLive = Boolean(calendarId) || source === 'default';
  if (!useLive) return bundle;
  if (!year) {
    return { ...bundle, holidays: [] };
  }
  const rows = await listHolidayCalendars({ year, calendarId });
  return {
    ...bundle,
    holidays: mapCalendarHolidayRows(rows)
  };
}

export function applyHolidayCalendarPayload(body) {
  if (!body || typeof body !== 'object') return body;
  const createNew = body.create_holiday_calendar === true || body.create_holiday_calendar === 'true';
  const calendarId = normalizeHolidayCalendarId(body.holiday_calendar_id ?? body.holidayCalendarId);
  if (Array.isArray(body.holidays)) {
    body.holidays = body.holidays.filter((h) => String(h?.holiday_date ?? '').trim());
  }
  if (createNew && !calendarId) {
    body.holiday_calendar_id = null;
    body.holiday_source = 'custom';
    body.create_holiday_calendar = true;
    return body;
  }
  body.create_holiday_calendar = false;
  body.holiday_calendar_id = calendarId;
  body.holiday_source = calendarId ? 'custom' : 'default';
  return body;
}

export function applyLeaveConfigPayload(body) {
  if (!body || typeof body !== 'object') return body;
  const createNew = body.create_leave_config === true || body.create_leave_config === 'true';
  const configId = normalizeLeaveConfigId(body.leave_config_id ?? body.leaveConfigId);
  if (createNew && !configId) {
    body.leave_config_id = null;
    body.leave_source = 'custom';
    body.create_leave_config = true;
    return body;
  }
  body.create_leave_config = false;
  body.leave_config_id = configId;
  body.leave_source = configId ? 'custom' : 'default';
  return body;
}

function mapLeaveConfigRuleRows(rows) {
  return (rows ?? []).map((r) => ({
    id: r.id ?? null,
    state: r.state ?? '',
    leave_type: r.leave_type,
    not_applicable: r.not_applicable === true,
    accrual_rules: Array.isArray(r.accrual_rules) ? r.accrual_rules : [],
    fixed_days: r.fixed_days == null || r.fixed_days === '' ? null : Number(r.fixed_days),
    accumulation_limit:
      r.accumulation_limit == null || r.accumulation_limit === ''
        ? null
        : Number(r.accumulation_limit)
  }));
}

/** Overlay live leave-config rules for Default or a named template. */
async function applyAssignedLeaveConfig(bundle) {
  const configId = normalizeLeaveConfigId(bundle?.leave_config_id);
  const source = normalizeLeaveSource(bundle?.leave_source);
  const useLive = Boolean(configId) || source === 'default';
  if (!useLive) {
    return { ...bundle, leave_rules: bundle?.leave_rules ?? [] };
  }
  const rows = await listLeaveConfigRules({ configId });
  let name = bundle?.leave_config_name || null;
  try {
    const def = await getLeaveConfigDef(configId);
    name = def?.name || name;
  } catch {
    // keep snapshot name
  }
  return {
    ...bundle,
    leave_rules: mapLeaveConfigRuleRows(rows),
    leave_config_name: name || (configId ? bundle?.leave_config_name : 'Default'),
    leave_source: configId ? 'custom' : 'default',
    leave_config_id: configId
  };
}

/**
 * Policy bundle effective for a given attendance month (YYYY-MM or YYYY-MM-DD).
 * Uses versioned snapshots; falls back to live tables when no version matches.
 */
export async function fetchClientPolicyBundleForMonth(clientId, monthYm) {
  const monthDate = monthYmToDate(monthYm);
  const year = monthDate ? Number(String(monthDate).slice(0, 4)) : null;
  if (!monthDate) {
    const live = await fetchClientPolicyBundle(clientId);
    return applyAssignedLeaveConfig(await applyAssignedCalendarHolidays(live, year));
  }

  const { data: versions, error: vErr } = await supabaseAdmin
    .from('client_policy_versions')
    .select('policy_json, created_at, effective_from_month')
    .eq('client_id', clientId)
    .lte('effective_from_month', monthDate)
    .order('effective_from_month', { ascending: false });
  if (vErr) throw vErr;

  const bundle = selectPolicyBundleForMonth(versions ?? [], monthYm, normalizeAttendancePolicy);
  if (bundle) {
    return applyAssignedLeaveConfig(await applyAssignedCalendarHolidays(bundle, year));
  }

  const live = await fetchClientPolicyBundle(clientId);
  return applyAssignedLeaveConfig(await applyAssignedCalendarHolidays(live, year));
}

export async function insertClientPolicyVersion(clientId, effectiveFromMonth, bundle, actorUserId = null) {
  const monthDate = monthYmToDate(effectiveFromMonth) ?? monthYmToDate(BASELINE_POLICY_MONTH);
  const policyJson = bundleToPolicyJson(bundle);
  const { error } = await supabaseAdmin
    .from('client_policy_versions')
    .upsert(
      {
        client_id: clientId,
        effective_from_month: monthDate,
        policy_json: policyJson,
        actor_user_id: actorUserId,
        created_at: new Date().toISOString()
      },
      { onConflict: 'client_id,effective_from_month' }
    );
  if (error) {
    const msg = String(error.message || '');
    if (msg.includes('client_policy_versions')) {
      throw new Error(
        'Policy versioning table is missing. Run migration 20260728120000_client_policy_versions.sql in Supabase.'
      );
    }
    throw error;
  }
}

export async function ensureBaselinePolicyVersion(clientId) {
  const { data: existing, error: findErr } = await supabaseAdmin
    .from('client_policy_versions')
    .select('id')
    .eq('client_id', clientId)
    .eq('effective_from_month', BASELINE_POLICY_MONTH)
    .maybeSingle();
  if (findErr) throw findErr;
  if (existing) return;

  const bundle = await fetchClientPolicyBundle(clientId);
  const policyJson = bundleToPolicyJson(bundle);
  const { error } = await supabaseAdmin.from('client_policy_versions').insert({
    client_id: clientId,
    effective_from_month: BASELINE_POLICY_MONTH,
    policy_json: policyJson,
    actor_user_id: null
  });
  if (error) throw error;
}

export async function fetchClientPolicyBundle(clientId) {
  const { data: policy, error: pErr } = await supabaseAdmin
    .from('client_attendance_policies')
    .select('*')
    .eq('client_id', clientId)
    .maybeSingle();
  if (pErr) throw pErr;

  const { data: allowances, error: aErr } = await supabaseAdmin
    .from('client_leave_allowances')
    .select('*')
    .eq('client_id', clientId)
    .order('designation', { ascending: true });
  if (aErr) throw aErr;

  const calendarId = normalizeHolidayCalendarId(policy?.holiday_calendar_id);
  let calendarDef = null;
  try {
    calendarDef = await getHolidayCalendarDef(calendarId);
  } catch (defErr) {
    if (defErr?.status !== 404) throw defErr;
  }
  const namedId = calendarDef && !calendarDef.is_default ? calendarDef.id : null;

  const leaveConfigId = normalizeLeaveConfigId(policy?.leave_config_id);
  let leaveConfigDef = null;
  try {
    leaveConfigDef = await getLeaveConfigDef(leaveConfigId);
  } catch (defErr) {
    if (defErr?.status !== 404) throw defErr;
  }
  const namedLeaveId = leaveConfigDef && !leaveConfigDef.is_default ? leaveConfigDef.id : null;

  let holidays = [];
  if (namedId) {
    holidays = mapCalendarHolidayRows(await listHolidayCalendars({ calendarId: namedId }));
  } else if (normalizeHolidaySource(policy?.holiday_source) !== 'default') {
    const { data: legacyHolidays, error: hErr } = await supabaseAdmin
      .from('client_holidays')
      .select('id, holiday_date, holiday_type, state, holiday_name')
      .eq('client_id', clientId)
      .order('holiday_date', { ascending: true });
    if (hErr) {
      const msg = String(hErr.message || '');
      if (msg.includes('holiday_name')) {
        throw new Error(
          'Client holiday name column is missing. Run migration 20260820180000_client_holidays_name.sql in Supabase.'
        );
      }
      throw hErr;
    }
    holidays = (legacyHolidays ?? []).map((h) => ({
      id: h.id,
      state: String(h.state ?? '').trim() || null,
      holiday_date: String(h.holiday_date).slice(0, 10),
      holiday_type: h.holiday_type === 'FH' ? 'FH' : 'NH',
      holiday_name: normalizeHolidayName(h.holiday_name)
    }));
  }

  const bundle = {
    attendance_policy: policy
      ? normalizeAttendancePolicy(policy)
      : { ...DEFAULT_ATTENDANCE_POLICY },
    policy_updated_at: policy?.updated_at ?? null,
    leave_allowances: (allowances ?? []).map((a) => ({
      designation: a.designation,
      sick_days: Number(a.sick_days) || 0,
      paid_days: Number(a.paid_days) || 0,
      maternity_days: Number(a.maternity_days) || 0,
      paternity_days: Number(a.paternity_days) || 0,
      earned_days: Number(a.earned_days) || 0
    })),
    holidays,
    holiday_source: namedId ? 'custom' : 'default',
    holiday_calendar_id: namedId,
    holiday_calendar_name: namedId ? calendarDef.name : (calendarDef?.name || 'Default'),
    leave_source: namedLeaveId ? 'custom' : 'default',
    leave_config_id: namedLeaveId,
    leave_config_name: namedLeaveId ? leaveConfigDef.name : (leaveConfigDef?.name || 'Default'),
    leave_rules: []
  };
  try {
    return await applyAssignedLeaveConfig(bundle);
  } catch (err) {
    const msg = String(err?.message || '');
    if (msg.includes('leave_config') || msg.includes('Leave configuration')) {
      return bundle;
    }
    throw err;
  }
}

export async function upsertClientPolicyBundle(clientId, body) {
  const policy = normalizeAttendancePolicy(body.attendance_policy);
  const row = {
    client_id: clientId,
    payroll_cycle_start_day: policy.payroll_cycle_start_day,
    payroll_cycle_end_day: policy.payroll_cycle_end_day,
    week_off_config: policy.week_off_config,
    comp_off_applicable: policy.comp_off_applicable,
    comp_off_types: policy.comp_off_types,
    comp_off_rule: policy.comp_off_rule,
    paid_comp_off_rule: policy.paid_comp_off_rule,
    nh_comp_off_applicable: policy.nh_comp_off_applicable,
    nh_off_rule: policy.nh_off_rule,
    nh_pay_rule: policy.nh_pay_rule,
    fh_comp_off_applicable: policy.fh_comp_off_applicable,
    fh_off_rule: policy.fh_off_rule,
    fh_pay_rule: policy.fh_pay_rule,
    incentive_applicable: policy.incentive_applicable,
    incentive_min_days: policy.incentive_min_days,
    incentive_value: policy.incentive_value,
    holiday_source: normalizeHolidaySource(body.holiday_source ?? body.attendance_policy?.holiday_source),
    holiday_calendar_id: normalizeHolidayCalendarId(body.holiday_calendar_id),
    leave_source: normalizeLeaveSource(body.leave_source ?? body.attendance_policy?.leave_source),
    leave_config_id: normalizeLeaveConfigId(body.leave_config_id),
    updated_at: new Date().toISOString()
  };

  const createNew = body.create_holiday_calendar === true && !row.holiday_calendar_id;
  if (createNew) {
    const { data: clientRow, error: clientErr } = await supabaseAdmin
      .from('clients')
      .select('client_name')
      .eq('id', clientId)
      .maybeSingle();
    if (clientErr) throw clientErr;
    const name = await uniqueClientCalendarName(clientRow?.client_name, clientId);
    const created = await createHolidayCalendarDef({ name });
    row.holiday_calendar_id = await assignHolidayCalendarToClient(clientId, created.id);
  } else {
    row.holiday_calendar_id = await assignHolidayCalendarToClient(clientId, row.holiday_calendar_id);
  }
  row.holiday_source = row.holiday_calendar_id ? 'custom' : 'default';

  const createLeaveNew = body.create_leave_config === true && !row.leave_config_id;
  if (createLeaveNew) {
    const { data: clientRow, error: clientErr } = await supabaseAdmin
      .from('clients')
      .select('client_name')
      .eq('id', clientId)
      .maybeSingle();
    if (clientErr) throw clientErr;
    const name = await uniqueClientLeaveConfigName(clientRow?.client_name, clientId);
    const created = await createLeaveConfigDef({ name });
    row.leave_config_id = await assignLeaveConfigToClient(clientId, created.id);
  } else {
    row.leave_config_id = await assignLeaveConfigToClient(clientId, row.leave_config_id);
  }
  row.leave_source = row.leave_config_id ? 'custom' : 'default';

  const { data: saved, error: pErr } = await supabaseAdmin
    .from('client_attendance_policies')
    .upsert(row, { onConflict: 'client_id' })
    .select('*')
    .single();
  if (pErr) {
    const msg = String(pErr.message || '');
    if (msg.includes('incentive_')) {
      throw new Error(
        'Incentive policy columns are missing in the database. Run migration 20260727170000_client_incentive_policy.sql in Supabase.'
      );
    }
    if (msg.includes('holiday_calendar_id') || msg.includes('holiday_calendar_defs')) {
      throw new Error(
        'Named holiday calendars are missing. Run migration 20260820200000_holiday_calendar_defs.sql in Supabase.'
      );
    }
    if (msg.includes('holiday_source')) {
      throw new Error(
        'Holiday calendar column is missing in the database. Run migration 20260820140000_holiday_calendars.sql in Supabase.'
      );
    }
    if (msg.includes('leave_config_id') || msg.includes('leave_config_defs') || msg.includes('leave_source')) {
      throw new Error(
        'Leave configuration columns are missing. Run migration 20260831120000_leave_config.sql in Supabase.'
      );
    }
    if (msg.includes('client_holidays') && msg.includes('state')) {
      throw new Error(
        'Client holiday state column is missing. Run migration 20260820153000_client_holidays_state.sql in Supabase.'
      );
    }
    throw pErr;
  }

  await supabaseAdmin.from('client_leave_allowances').delete().eq('client_id', clientId);
  const allowanceRows = (body.leave_allowances ?? []).map((a) => ({
    client_id: clientId,
    designation: String(a.designation).trim(),
    sick_days: Number(a.sick_days) || 0,
    paid_days: Number(a.paid_days) || 0,
    maternity_days: Number(a.maternity_days) || 0,
    paternity_days: Number(a.paternity_days) || 0,
    earned_days: Number(a.earned_days) || 0
  }));
  if (allowanceRows.length) {
    const { error: aErr } = await supabaseAdmin.from('client_leave_allowances').insert(allowanceRows);
    if (aErr) throw aErr;
  }

  await supabaseAdmin.from('client_holidays').delete().eq('client_id', clientId);
  if (row.holiday_calendar_id) {
    await replaceAllHolidayCalendars(body.holidays ?? [], { calendarId: row.holiday_calendar_id });
  }
  if (row.leave_config_id) {
    await replaceAllLeaveConfigRules(body.leave_rules ?? [], { configId: row.leave_config_id });
  }

  return normalizeAttendancePolicy(saved);
}
