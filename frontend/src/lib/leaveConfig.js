export const LEAVE_TYPES = [
  'earned_privileged',
  'casual',
  'sick',
  'maternity',
  'paternity'
];

export const LEAVE_TYPE_LABELS = {
  earned_privileged: 'Earned / Privileged Leave',
  casual: 'Casual Leave',
  sick: 'Sick Leave',
  maternity: 'Maternity Leave',
  paternity: 'Paternity Leave'
};

const LEAVE_TYPE_ALIASES = new Map([
  ['earned_privileged', 'earned_privileged'],
  ['earned', 'earned_privileged'],
  ['el', 'earned_privileged'],
  ['privileged', 'earned_privileged'],
  ['earned leave', 'earned_privileged'],
  ['privileged leave', 'earned_privileged'],
  ['earned / privileged leave', 'earned_privileged'],
  ['earned/privileged leave', 'earned_privileged'],
  ['earned / privileged', 'earned_privileged'],
  ['casual', 'casual'],
  ['cl', 'casual'],
  ['paid', 'casual'],
  ['casual leave', 'casual'],
  ['sick', 'sick'],
  ['sl', 'sick'],
  ['sick leave', 'sick'],
  ['maternity', 'maternity'],
  ['ml', 'maternity'],
  ['maternity leave', 'maternity'],
  ['paternity', 'paternity'],
  ['paternity leave', 'paternity']
]);

export function normalizeLeaveType(raw) {
  const key = String(raw ?? '').trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  if (!key) return null;
  const compact = key.replace(/\s+/g, '_');
  return LEAVE_TYPE_ALIASES.get(key) || LEAVE_TYPE_ALIASES.get(compact) || null;
}

export function parseAccrualString(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return [];
  const parts = s.split(/[;|,]+/).map((p) => p.trim()).filter(Boolean);
  const out = [];
  for (const part of parts) {
    const m = part.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
    if (!m) return null;
    const days = Number(m[1]);
    const per = Number(m[2]);
    if (!Number.isFinite(days) || days <= 0 || !Number.isFinite(per) || per <= 0) return null;
    out.push({ days, per_days_worked: per });
  }
  return out;
}

export function formatAccrualString(rules) {
  return (rules ?? [])
    .map((r) => `${r.days}/${r.per_days_worked}`)
    .join(';');
}

export function formatAccrualDisplay(rules) {
  const list = rules ?? [];
  if (!list.length) return '—';
  return list
    .map((r) => `${r.days} day${Number(r.days) === 1 ? '' : 's'} (for every ${r.per_days_worked} days worked)`)
    .join('; ');
}

export function parseApplicableFlag(raw) {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return true;
  if (['no', 'n', 'false', '0', 'na', 'n/a', 'not applicable'].includes(s)) return false;
  if (['yes', 'y', 'true', '1'].includes(s)) return true;
  return null;
}

export function describeLeaveRule(rule) {
  if (!rule) return '—';
  if (rule.not_applicable) return 'Not Applicable';
  const parts = [];
  if ((rule.accrual_rules ?? []).length) parts.push(formatAccrualDisplay(rule.accrual_rules));
  if (rule.fixed_days != null && rule.fixed_days !== '') {
    parts.push(`${rule.fixed_days} days (fixed)`);
  }
  if (rule.accumulation_limit != null && rule.accumulation_limit !== '') {
    parts.push(`Accumulation limit is ${rule.accumulation_limit} days`);
  }
  return parts.length ? parts.join(' · ') : '—';
}

export function emptyLeaveRule(state, leaveType) {
  return {
    state,
    leave_type: leaveType,
    not_applicable: false,
    accrual_rules: [],
    fixed_days: null,
    accumulation_limit: null
  };
}
