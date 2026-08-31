import { normalizeAttendancePolicy } from './clientPolicyCore.js';

const BASELINE_POLICY_MONTH = '2000-01-01';

export { BASELINE_POLICY_MONTH };

export function monthYmToDate(monthYm) {
  const s = String(monthYm ?? '').trim();
  if (/^\d{4}-\d{2}$/.test(s)) return `${s}-01`;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return `${s.slice(0, 7)}-01`;
  return null;
}

export function normalizePolicyBundleFromJson(policyJson, normalizeAttendancePolicy) {
  const raw = policyJson ?? {};
  return {
    attendance_policy: normalizeAttendancePolicy(raw.attendance_policy ?? {}),
    policy_updated_at: null,
    leave_allowances: (raw.leave_allowances ?? []).map((a) => ({
      designation: a.designation,
      sick_days: Number(a.sick_days) || 0,
      paid_days: Number(a.paid_days) || 0,
      maternity_days: Number(a.maternity_days) || 0,
      paternity_days: Number(a.paternity_days) || 0,
      earned_days: Number(a.earned_days) || 0
    })),
    holidays: (raw.holidays ?? []).map((h) => ({
      id: h.id ?? null,
      state: String(h.state ?? '').trim() || null,
      holiday_date: String(h.holiday_date).slice(0, 10),
      holiday_type: h.holiday_type === 'FH' ? 'FH' : 'NH',
      holiday_name: String(h.holiday_name ?? '').trim() || null
    })),
    holiday_calendar_id: String(raw.holiday_calendar_id ?? '').trim() || null,
    holiday_calendar_name: String(raw.holiday_calendar_name ?? '').trim() || null,
    holiday_source: String(raw.holiday_calendar_id ?? '').trim()
      ? 'custom'
      : (String(raw.holiday_source ?? '').trim().toLowerCase() === 'default' ? 'default' : 'custom'),
    leave_config_id: String(raw.leave_config_id ?? '').trim() || null,
    leave_config_name: String(raw.leave_config_name ?? '').trim() || null,
    leave_source: String(raw.leave_config_id ?? '').trim()
      ? 'custom'
      : (String(raw.leave_source ?? '').trim().toLowerCase() === 'default' ? 'default' : 'custom'),
    leave_rules: (raw.leave_rules ?? []).map((r) => ({
      id: r.id ?? null,
      state: String(r.state ?? '').trim(),
      leave_type: String(r.leave_type ?? '').trim(),
      not_applicable: r.not_applicable === true,
      accrual_rules: Array.isArray(r.accrual_rules) ? r.accrual_rules : [],
      fixed_days: r.fixed_days == null || r.fixed_days === '' ? null : Number(r.fixed_days),
      accumulation_limit:
        r.accumulation_limit == null || r.accumulation_limit === ''
          ? null
          : Number(r.accumulation_limit)
    }))
  };
}

export function bundleToPolicyJson(bundle) {
  return {
    attendance_policy: bundle.attendance_policy,
    leave_allowances: bundle.leave_allowances ?? [],
    holidays: (bundle.holidays ?? []).map((h) => ({
      state: String(h.state ?? '').trim() || null,
      holiday_date: String(h.holiday_date).slice(0, 10),
      holiday_type: h.holiday_type === 'FH' ? 'FH' : 'NH',
      holiday_name: String(h.holiday_name ?? '').trim() || null
    })),
    holiday_calendar_id: String(bundle.holiday_calendar_id ?? '').trim() || null,
    holiday_calendar_name: String(bundle.holiday_calendar_name ?? '').trim() || null,
    holiday_source: String(bundle.holiday_calendar_id ?? '').trim()
      ? 'custom'
      : (String(bundle.holiday_source ?? '').trim().toLowerCase() === 'default' ? 'default' : 'custom'),
    leave_config_id: String(bundle.leave_config_id ?? '').trim() || null,
    leave_config_name: String(bundle.leave_config_name ?? '').trim() || null,
    leave_source: String(bundle.leave_config_id ?? '').trim()
      ? 'custom'
      : (String(bundle.leave_source ?? '').trim().toLowerCase() === 'default' ? 'default' : 'custom'),
    leave_rules: (bundle.leave_rules ?? []).map((r) => ({
      state: String(r.state ?? '').trim(),
      leave_type: String(r.leave_type ?? '').trim(),
      not_applicable: r.not_applicable === true,
      accrual_rules: Array.isArray(r.accrual_rules) ? r.accrual_rules : [],
      fixed_days: r.fixed_days == null || r.fixed_days === '' ? null : Number(r.fixed_days),
      accumulation_limit:
        r.accumulation_limit == null || r.accumulation_limit === ''
          ? null
          : Number(r.accumulation_limit)
    }))
  };
}

/**
 * Pick the policy version effective for a month from an in-memory list (newest effective_from <= month).
 */
export function selectPolicyBundleForMonth(versions, monthYm, normalizeAttendancePolicy) {
  const monthDate = monthYmToDate(monthYm);
  if (!monthDate || !versions?.length) return null;

  let best = null;
  let bestDate = '';
  for (const version of versions) {
    const effective = String(version.effective_from_month ?? '').slice(0, 10);
    if (!effective || effective > monthDate) continue;
    if (!best || effective > bestDate) {
      best = version;
      bestDate = effective;
    }
  }

  if (!best?.policy_json) return null;
  const bundle = normalizePolicyBundleFromJson(best.policy_json, normalizeAttendancePolicy);
  bundle.policy_updated_at = best.created_at ?? null;
  return bundle;
}
