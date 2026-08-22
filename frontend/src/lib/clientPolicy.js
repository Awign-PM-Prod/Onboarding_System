export const WEEK_OFF_PRESETS = [
  { id: 'sat_sun', label: 'Sat + Sun' },
  { id: 'all_sundays', label: 'All Sundays' },
  { id: 'first_sat', label: '1st Sat' },
  { id: 'second_sat', label: '2nd Sat' },
  { id: 'third_sat', label: '3rd Sat' },
  { id: 'fourth_sat', label: '4th Sat' },
  { id: 'fifth_sat', label: '5th Sat' }
];

export const WEEKDAY_OPTIONS = [
  { id: 'monday', label: 'Monday' },
  { id: 'tuesday', label: 'Tuesday' },
  { id: 'wednesday', label: 'Wednesday' },
  { id: 'thursday', label: 'Thursday' },
  { id: 'friday', label: 'Friday' },
  { id: 'saturday', label: 'Saturday' },
  { id: 'sunday', label: 'Sunday' }
];

export const DEFAULT_ATTENDANCE_POLICY = {
  payroll_cycle_start_day: 25,
  payroll_cycle_end_day: 24,
  week_off_config: { presets: ['all_sundays'], weekdays: [] },
  comp_off_applicable: true,
  comp_off_types: ['CO'],
  comp_off_rule: 1,
  paid_comp_off_rule: 1,
  nh_comp_off_applicable: true,
  nh_off_rule: 2,
  nh_pay_rule: 1,
  fh_comp_off_applicable: false,
  fh_off_rule: 1,
  fh_pay_rule: 1,
  incentive_applicable: false,
  incentive_min_days: 26,
  incentive_value: 0
};

export const EMPTY_LEAVE_ALLOWANCE = {
  sick_days: 6,
  paid_days: 12,
  maternity_days: 180,
  paternity_days: 15,
  earned_days: 18
};

/** Default roles for attendance / policy testing (Engineer, Operator, Inspector, Supervisor). */
export const ATTENDANCE_POLICY_ROLES = ['Engineer', 'Operator', 'Inspector', 'Supervisor'];

function designationKey(name) {
  return String(name ?? '').trim().toLowerCase();
}

/** Merge attendance test roles into a designation list without duplicates. */
export function mergeAttendancePolicyRoles(designations, extraRoles = ATTENDANCE_POLICY_ROLES) {
  const seen = new Set();
  const out = [];
  for (const item of [...(designations ?? []), ...(extraRoles ?? [])]) {
    const isObj = item && typeof item === 'object';
    const trimmed = String(isObj ? item.name ?? '' : item ?? '').trim();
    if (!trimmed) continue;
    const key = designationKey(trimmed);
    if (seen.has(key)) continue;
    seen.add(key);
    const skillRaw = isObj ? item.skill_level : null;
    const skill = String(skillRaw ?? 'UNSKILLED').trim().toUpperCase().replace(/[-\s]+/g, '_');
    const skill_level =
      skill === 'SKILLED' || skill === 'SEMI_SKILLED' || skill === 'UNSKILLED'
        ? skill
        : skill === 'SEMISKILLED' || skill === 'SEMI'
          ? 'SEMI_SKILLED'
          : 'UNSKILLED';
    out.push({ name: trimmed, skill_level });
  }
  return out;
}

const WEEKDAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function nthWeekdayOfMonth(year, month, weekday, nth) {
  let count = 0;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  for (let d = 1; d <= last; d += 1) {
    const dt = new Date(Date.UTC(year, month - 1, d));
    if (dt.getUTCDay() === weekday) {
      count += 1;
      if (count === nth) return d;
    }
  }
  return null;
}

export function isWeekOffDate(isoDate, weekOffConfig) {
  const s = String(isoDate ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  const dow = d.getUTCDay();
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const config = weekOffConfig ?? { presets: [], weekdays: [] };

  for (const wd of config.weekdays ?? []) {
    if (WEEKDAY_NAMES.indexOf(wd) === dow) return true;
  }
  for (const preset of config.presets ?? []) {
    if (preset === 'sat_sun' && (dow === 0 || dow === 6)) return true;
    if (preset === 'all_sundays' && dow === 0) return true;
    if (preset === 'first_sat' && dow === 6 && day === nthWeekdayOfMonth(year, month, 6, 1)) return true;
    if (preset === 'second_sat' && dow === 6 && day === nthWeekdayOfMonth(year, month, 6, 2)) return true;
    if (preset === 'third_sat' && dow === 6 && day === nthWeekdayOfMonth(year, month, 6, 3)) return true;
    if (preset === 'fourth_sat' && dow === 6 && day === nthWeekdayOfMonth(year, month, 6, 4)) return true;
    if (preset === 'fifth_sat' && dow === 6 && day === nthWeekdayOfMonth(year, month, 6, 5)) return true;
  }
  return false;
}

export function buildLeaveAllowancesForDesignations(designations, existing = []) {
  const normalizeDesignationKey = (name) =>
    String(name ?? '').trim().toLowerCase().replace(/\s+/g, '');
  const byKey = new Map(
    (existing ?? []).map((r) => [normalizeDesignationKey(r.designation), r])
  );
  return (designations ?? []).map((entry) => {
    const designation =
      entry && typeof entry === 'object' ? String(entry.name ?? '').trim() : String(entry ?? '').trim();
    const prev = byKey.get(normalizeDesignationKey(designation));
    return {
      designation,
      sick_days: prev?.sick_days ?? EMPTY_LEAVE_ALLOWANCE.sick_days,
      paid_days: prev?.paid_days ?? EMPTY_LEAVE_ALLOWANCE.paid_days,
      maternity_days: prev?.maternity_days ?? EMPTY_LEAVE_ALLOWANCE.maternity_days,
      paternity_days: prev?.paternity_days ?? EMPTY_LEAVE_ALLOWANCE.paternity_days,
      earned_days: prev?.earned_days ?? EMPTY_LEAVE_ALLOWANCE.earned_days
    };
  });
}

export function normalizeDesignationKey(name) {
  return String(name ?? '').trim().toLowerCase().replace(/\s+/g, '');
}

export function findLeaveAllowanceForDesignation(leaveAllowances, designation) {
  const key = normalizeDesignationKey(designation);
  if (!key) return null;
  return (
    (leaveAllowances ?? []).find((a) => normalizeDesignationKey(a.designation) === key) ?? null
  );
}

const LEAVE_CODE_TO_ALLOWANCE_FIELD = {
  EL: 'earned_days',
  SL: 'sick_days',
  CL: 'paid_days',
  PL: 'paternity_days',
  ML: 'maternity_days'
};

/** Annual leave quota from policy form for a leave code (EL/SL/CL/PL/ML). */
export function annualLeaveAllowanceFromPolicy(allowance, leaveCode) {
  const field = LEAVE_CODE_TO_ALLOWANCE_FIELD[String(leaveCode ?? '').toUpperCase()];
  if (!field || !allowance) return null;
  return Math.max(0, Number(allowance[field]) || 0);
}

function parseIsoDate(iso) {
  const s = String(iso ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return new Date(`${s}T00:00:00Z`);
}

function isoFromParts(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Payroll period for a given YYYY-MM anchor month (matches backend clientPolicyCore). */
export function getPayrollPeriod(policy, monthYm) {
  const m = String(monthYm ?? '').trim();
  if (!/^\d{4}-\d{2}$/.test(m)) {
    return { start: null, end: null };
  }
  const year = Number(m.slice(0, 4));
  const mon = Number(m.slice(5, 7));
  const startDay = Math.min(31, Math.max(1, Number(policy?.payroll_cycle_start_day) || 1));
  const endDay = Math.min(31, Math.max(1, Number(policy?.payroll_cycle_end_day) || 31));

  let startYear = year;
  let startMonth = mon;
  const endYear = year;
  const endMonth = mon;

  if (startDay > endDay) {
    startMonth = mon === 1 ? 12 : mon - 1;
    startYear = mon === 1 ? year - 1 : year;
  }

  const clampDay = (y, mo, d) => {
    const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    return Math.min(d, last);
  };

  const start = isoFromParts(startYear, startMonth, clampDay(startYear, startMonth, startDay));
  const end = isoFromParts(endYear, endMonth, clampDay(endYear, endMonth, endDay));
  return { start, end };
}

/** Enumerate ISO dates from start to end inclusive. */
export function datesInPeriod(startIso, endIso) {
  const start = parseIsoDate(startIso);
  const end = parseIsoDate(endIso);
  if (!start || !end || end < start) return [];
  const out = [];
  const cur = new Date(start);
  while (cur <= end) {
    out.push(isoFromParts(cur.getUTCFullYear(), cur.getUTCMonth() + 1, cur.getUTCDate()));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

/** Normalize policy for forms — keeps incentive on when a value is set. */
export function normalizeAttendancePolicyForForm(raw) {
  const p = { ...DEFAULT_ATTENDANCE_POLICY, ...(raw ?? {}) };
  const incentive_value = Math.max(0, Number(p.incentive_value) || 0);
  return {
    ...p,
    incentive_value,
    incentive_applicable: Boolean(p.incentive_applicable) || incentive_value > 0
  };
}
