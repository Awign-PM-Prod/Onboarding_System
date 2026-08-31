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

export const LEAVE_TYPE_TO_CODE = {
  earned_privileged: 'EL',
  casual: 'CL',
  sick: 'SL',
  maternity: 'ML',
  paternity: 'PL'
};

export const CODE_TO_LEAVE_TYPE = {
  EL: 'earned_privileged',
  CL: 'casual',
  SL: 'sick',
  ML: 'maternity',
  PL: 'paternity'
};

export const LEAVE_CODE_TO_ALLOWANCE_FIELD = {
  EL: 'earned_days',
  SL: 'sick_days',
  CL: 'paid_days',
  PL: 'paternity_days',
  ML: 'maternity_days'
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function normalizeLeaveType(raw) {
  const key = String(raw ?? '').trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  if (!key) return null;
  const compact = key.replace(/\s+/g, '_');
  return LEAVE_TYPE_ALIASES.get(key) || LEAVE_TYPE_ALIASES.get(compact) || null;
}

export function normalizeLeaveConfigId(raw) {
  const s = String(raw ?? '').trim();
  if (!s || s.toLowerCase() === 'default') return null;
  if (!UUID_RE.test(s)) return null;
  return s;
}

export function normalizeLeaveSource(raw) {
  return String(raw ?? '').trim().toLowerCase() === 'default' ? 'default' : 'custom';
}

/** Parse "5/60;18/240" into accrual clause objects. Returns null if invalid (non-empty garbage). */
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

export function normalizeAccrualRules(raw) {
  if (raw == null || raw === '') return [];
  let list = raw;
  if (typeof raw === 'string') {
    const parsed = parseAccrualString(raw);
    if (parsed == null) return null;
    list = parsed;
  }
  if (!Array.isArray(list)) return null;
  const out = [];
  const seen = new Set();
  for (const item of list) {
    const days = Number(item?.days);
    const per = Number(item?.per_days_worked ?? item?.perDaysWorked);
    if (!Number.isFinite(days) || days <= 0) return null;
    if (!Number.isFinite(per) || per <= 0) return null;
    const key = `${days}|${per}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ days, per_days_worked: per });
  }
  return out;
}

export function formatAccrualString(rules) {
  return (rules ?? [])
    .map((r) => `${r.days}/${r.per_days_worked}`)
    .join(';');
}

export function parseApplicableFlag(raw) {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return true;
  if (['no', 'n', 'false', '0', 'na', 'n/a', 'not applicable'].includes(s)) return false;
  if (['yes', 'y', 'true', '1'].includes(s)) return true;
  return null;
}

export function computeAccruedDays(daysWorked, clauses) {
  const worked = Math.max(0, Number(daysWorked) || 0);
  let best = 0;
  for (const c of clauses ?? []) {
    const per = Number(c.per_days_worked);
    const days = Number(c.days);
    if (!(per > 0) || !(days >= 0)) continue;
    best = Math.max(best, Math.floor(worked / per) * days);
  }
  return best;
}

export function daysWorkedFromLegendTotals(totals) {
  const t = totals ?? {};
  return (
    (Number(t.P) || 0)
    + (Number(t['P-NH']) || 0)
    + (Number(t['P-FH']) || 0)
    + 0.5 * (Number(t.HD) || 0)
  );
}

export function leaveRuleForEmployee(rules, employeeState, leaveType) {
  const state = String(employeeState ?? '').trim().toLowerCase();
  const type = normalizeLeaveType(leaveType) || leaveType;
  if (!state || !type) return null;
  return (rules ?? []).find((r) => (
    String(r?.state ?? '').trim().toLowerCase() === state
    && (normalizeLeaveType(r?.leave_type) || r?.leave_type) === type
  )) ?? null;
}

export function resolveAnnualEntitlement({
  rule,
  daysWorked = 0,
  carryIn = 0,
  fallbackAnnual = 0
} = {}) {
  if (!rule) {
    return {
      annual: Math.max(0, Number(fallbackAnnual) || 0),
      source: 'designation',
      not_applicable: false,
      accrued: null,
      carry_in: 0
    };
  }
  if (rule.not_applicable) {
    return {
      annual: 0,
      source: 'na',
      not_applicable: true,
      accrued: 0,
      carry_in: 0
    };
  }

  const clauses = Array.isArray(rule.accrual_rules) ? rule.accrual_rules : [];
  let earned = 0;
  if (clauses.length) {
    earned = computeAccruedDays(daysWorked, clauses);
  } else if (rule.fixed_days != null && rule.fixed_days !== '') {
    earned = Math.max(0, Number(rule.fixed_days) || 0);
  }

  const carry = Math.max(0, Number(carryIn) || 0);
  let annual = earned + carry;
  if (rule.accumulation_limit != null && rule.accumulation_limit !== '') {
    const cap = Number(rule.accumulation_limit);
    if (Number.isFinite(cap) && cap >= 0) {
      annual = Math.min(annual, cap);
    }
  }

  return {
    annual: Math.max(0, annual),
    source: 'state',
    not_applicable: false,
    accrued: earned,
    carry_in: carry
  };
}
