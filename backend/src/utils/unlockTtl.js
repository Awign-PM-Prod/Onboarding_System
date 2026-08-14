import { supabaseAdmin } from '../supabase.js';

/** Approved unlock validity window (unused). */
export const UNLOCK_TTL_MS = 48 * 60 * 60 * 1000;

export function unlockExpiresAtFromNow(now = new Date()) {
  return new Date(now.getTime() + UNLOCK_TTL_MS).toISOString();
}

export function isUnlockExpired(expiresAt, now = new Date()) {
  if (!expiresAt) return true;
  const t = new Date(expiresAt).getTime();
  if (Number.isNaN(t)) return true;
  return t <= now.getTime();
}

const DOJ_UNLOCK_CLEAR = {
  doj_extend_unlock: false,
  doj_extend_max_date: null,
  doj_extend_unlock_expires_at: null,
};

const JOINING_STATUS_UNLOCK_CLEAR = {
  joining_status_unlock: false,
  joining_status_unlock_expires_at: null,
};

/**
 * If DOJ unlock is past TTL, clear employee flags and mark the latest unused APPROVED request EXPIRED.
 * Returns whether unlock is still valid after this check.
 */
export async function ensureDojUnlockValid(employeeRow, { now = new Date() } = {}) {
  if (!employeeRow?.doj_extend_unlock) {
    return { valid: false, expired: false, employee: employeeRow };
  }
  if (!isUnlockExpired(employeeRow.doj_extend_unlock_expires_at, now)) {
    return { valid: true, expired: false, employee: employeeRow };
  }

  const nowIso = now.toISOString();
  const employeeId = employeeRow.id;

  await supabaseAdmin
    .from('employees')
    .update(DOJ_UNLOCK_CLEAR)
    .eq('id', employeeId)
    .eq('doj_extend_unlock', true);

  const { data: approved } = await supabaseAdmin
    .from('doj_extend_requests')
    .select('id')
    .eq('employee_id', employeeId)
    .eq('status', 'APPROVED')
    .order('reviewed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (approved?.id) {
    await supabaseAdmin
      .from('doj_extend_requests')
      .update({ status: 'EXPIRED', updated_at: nowIso })
      .eq('id', approved.id)
      .eq('status', 'APPROVED');
  }

  return {
    valid: false,
    expired: true,
    employee: { ...employeeRow, ...DOJ_UNLOCK_CLEAR },
  };
}

/**
 * If joining-status unlock is past TTL, clear employee flags and mark latest unused APPROVED request EXPIRED.
 */
export async function ensureJoiningStatusUnlockValid(employeeRow, { now = new Date() } = {}) {
  if (!employeeRow?.joining_status_unlock) {
    return { valid: false, expired: false, employee: employeeRow };
  }
  if (!isUnlockExpired(employeeRow.joining_status_unlock_expires_at, now)) {
    return { valid: true, expired: false, employee: employeeRow };
  }

  const nowIso = now.toISOString();
  const employeeId = employeeRow.id;

  await supabaseAdmin
    .from('employees')
    .update(JOINING_STATUS_UNLOCK_CLEAR)
    .eq('id', employeeId)
    .eq('joining_status_unlock', true);

  const { data: approved } = await supabaseAdmin
    .from('joining_status_change_requests')
    .select('id')
    .eq('employee_id', employeeId)
    .eq('status', 'APPROVED')
    .order('reviewed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (approved?.id) {
    await supabaseAdmin
      .from('joining_status_change_requests')
      .update({ status: 'EXPIRED', updated_at: nowIso })
      .eq('id', approved.id)
      .eq('status', 'APPROVED');
  }

  return {
    valid: false,
    expired: true,
    employee: { ...employeeRow, ...JOINING_STATUS_UNLOCK_CLEAR },
  };
}

export { DOJ_UNLOCK_CLEAR, JOINING_STATUS_UNLOCK_CLEAR };
