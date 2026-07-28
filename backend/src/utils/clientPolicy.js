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
  validateHolidaysPayload
} from './clientPolicyCore.js';

import { supabaseAdmin } from '../supabase.js';
import {
  DEFAULT_ATTENDANCE_POLICY,
  normalizeAttendancePolicy
} from './clientPolicyCore.js';
import {
  BASELINE_POLICY_MONTH,
  bundleToPolicyJson,
  monthYmToDate,
  normalizePolicyBundleFromJson,
  selectPolicyBundleForMonth
} from './clientPolicyVersioning.js';

export { BASELINE_POLICY_MONTH, monthYmToDate, selectPolicyBundleForMonth };

/**
 * Policy bundle effective for a given attendance month (YYYY-MM or YYYY-MM-DD).
 * Uses versioned snapshots; falls back to live tables when no version matches.
 */
export async function fetchClientPolicyBundleForMonth(clientId, monthYm) {
  const monthDate = monthYmToDate(monthYm);
  if (!monthDate) return fetchClientPolicyBundle(clientId);

  const { data: versions, error: vErr } = await supabaseAdmin
    .from('client_policy_versions')
    .select('policy_json, created_at, effective_from_month')
    .eq('client_id', clientId)
    .lte('effective_from_month', monthDate)
    .order('effective_from_month', { ascending: false });
  if (vErr) throw vErr;

  const bundle = selectPolicyBundleForMonth(versions ?? [], monthYm, normalizeAttendancePolicy);
  if (bundle) return bundle;

  return fetchClientPolicyBundle(clientId);
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

  const { data: holidays, error: hErr } = await supabaseAdmin
    .from('client_holidays')
    .select('id, holiday_date, holiday_type')
    .eq('client_id', clientId)
    .order('holiday_date', { ascending: true });
  if (hErr) throw hErr;

  return {
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
    holidays: (holidays ?? []).map((h) => ({
      id: h.id,
      holiday_date: String(h.holiday_date).slice(0, 10),
      holiday_type: 'NH'
    }))
  };
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
    fh_comp_off_applicable: false,
    fh_off_rule: 1,
    fh_pay_rule: 1,
    incentive_applicable: policy.incentive_applicable,
    incentive_min_days: policy.incentive_min_days,
    incentive_value: policy.incentive_value,
    updated_at: new Date().toISOString()
  };
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
  const holidayRows = (body.holidays ?? []).map((h) => ({
    client_id: clientId,
    holiday_date: String(h.holiday_date).slice(0, 10),
    holiday_type: 'NH'
  }));
  if (holidayRows.length) {
    const { error: hErr } = await supabaseAdmin.from('client_holidays').insert(holidayRows);
    if (hErr) throw hErr;
  }

  return normalizeAttendancePolicy(saved);
}
