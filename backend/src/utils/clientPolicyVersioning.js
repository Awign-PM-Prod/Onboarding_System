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
    holiday_source: String(raw.holiday_source ?? '').trim().toLowerCase() === 'default'
      ? 'default'
      : 'custom'
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
    holiday_source: String(bundle.holiday_source ?? '').trim().toLowerCase() === 'default'
      ? 'default'
      : 'custom'
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
