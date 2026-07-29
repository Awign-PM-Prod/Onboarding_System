/** Pure client policy helpers (no database imports). */

export const WEEK_OFF_PRESETS = [
  'sat_sun',
  'all_sundays',
  'first_sat',
  'second_sat',
  'third_sat',
  'fourth_sat'
];

export const WEEKDAY_NAMES = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday'
];

export const DEFAULT_WEEK_OFF_CONFIG = {
  presets: ['sat_sun'],
  weekdays: []
};

export const DEFAULT_ATTENDANCE_POLICY = {
  payroll_cycle_start_day: 1,
  payroll_cycle_end_day: 31,
  week_off_config: DEFAULT_WEEK_OFF_CONFIG,
  comp_off_applicable: false,
  comp_off_types: [],
  comp_off_rule: 1,
  paid_comp_off_rule: 1,
  nh_comp_off_applicable: false,
  nh_off_rule: 1,
  nh_pay_rule: 1,
  fh_comp_off_applicable: false,
  fh_off_rule: 1,
  fh_pay_rule: 1,
  incentive_applicable: false,
  incentive_min_days: 26,
  incentive_value: 0
};

function normalizeWeekOffConfig(raw) {
  const presets = Array.isArray(raw?.presets)
    ? raw.presets.filter((p) => WEEK_OFF_PRESETS.includes(p))
    : DEFAULT_WEEK_OFF_CONFIG.presets;
  const weekdays = Array.isArray(raw?.weekdays)
    ? raw.weekdays.filter((d) => WEEKDAY_NAMES.includes(String(d).toLowerCase()))
    : [];
  return {
    presets: presets.length ? presets : DEFAULT_WEEK_OFF_CONFIG.presets,
    weekdays
  };
}

export function normalizeAttendancePolicy(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_ATTENDANCE_POLICY };
  const compOffTypes = Array.isArray(raw.comp_off_types)
    ? raw.comp_off_types.filter((t) => t === 'CO' || t === 'PAID_CO')
    : [];
  const incentive_value = Math.max(0, Number(raw.incentive_value) || 0);
  const incentive_applicable =
    Boolean(raw.incentive_applicable) || incentive_value > 0;
  return {
    payroll_cycle_start_day: Number(raw.payroll_cycle_start_day) || 1,
    payroll_cycle_end_day: Number(raw.payroll_cycle_end_day) || 31,
    week_off_config: normalizeWeekOffConfig(raw.week_off_config),
    comp_off_applicable: Boolean(raw.comp_off_applicable),
    comp_off_types: compOffTypes,
    comp_off_rule: Number(raw.comp_off_rule) || 1,
    paid_comp_off_rule: Number(raw.paid_comp_off_rule) || 1,
    nh_comp_off_applicable: Boolean(raw.nh_comp_off_applicable),
    nh_off_rule: Number(raw.nh_off_rule) || 1,
    nh_pay_rule: Number(raw.nh_pay_rule) || 1,
    fh_comp_off_applicable: Boolean(raw.fh_comp_off_applicable),
    fh_off_rule: Number(raw.fh_off_rule) || 1,
    fh_pay_rule: Number(raw.fh_pay_rule) || 1,
    incentive_applicable,
    incentive_min_days: Math.max(0, Number(raw.incentive_min_days) || 26),
    incentive_value
  };
}

function parseIsoDate(iso) {
  const s = String(iso ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return new Date(`${s}T00:00:00Z`);
}

function isoFromParts(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

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

/**
 * Returns true if the date is a configured week off (union of presets + weekdays).
 */
export function isWeekOffDate(isoDate, weekOffConfig) {
  const d = parseIsoDate(isoDate);
  if (!d) return false;
  const dow = d.getUTCDay();
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const config = normalizeWeekOffConfig(weekOffConfig);

  for (const wd of config.weekdays) {
    if (WEEKDAY_NAMES.indexOf(wd) === dow) return true;
  }

  for (const preset of config.presets) {
    if (preset === 'sat_sun' && (dow === 0 || dow === 6)) return true;
    if (preset === 'all_sundays' && dow === 0) return true;
    if (preset === 'first_sat' && dow === 6 && day === nthWeekdayOfMonth(year, month, 6, 1)) return true;
    if (preset === 'second_sat' && dow === 6 && day === nthWeekdayOfMonth(year, month, 6, 2)) return true;
    if (preset === 'third_sat' && dow === 6 && day === nthWeekdayOfMonth(year, month, 6, 3)) return true;
    if (preset === 'fourth_sat' && dow === 6 && day === nthWeekdayOfMonth(year, month, 6, 4)) return true;
  }
  return false;
}

/**
 * Payroll period for a given YYYY-MM anchor month.
 * If start_day > end_day, period spans previous month start to current month end.
 */
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
  let endYear = year;
  let endMonth = mon;

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

/**
 * Calendar-month period for a YYYY-MM anchor month (1st to last day).
 * Attendance calculations use this window so it always matches the grid.
 */
export function getCalendarMonthPeriod(monthYm) {
  const m = String(monthYm ?? '').trim().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(m)) {
    return { start: null, end: null };
  }
  const year = Number(m.slice(0, 4));
  const mon = Number(m.slice(5, 7));
  const lastDay = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  return {
    start: isoFromParts(year, mon, 1),
    end: isoFromParts(year, mon, lastDay)
  };
}

export function payrollCycleLabel(policy) {
  const start = Number(policy?.payroll_cycle_start_day) || 1;
  const end = Number(policy?.payroll_cycle_end_day) || 31;
  return `${start} to ${end}`;
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

export function validateAttendancePolicyPayload(policy, errors, prefix = 'attendance_policy') {
  if (!policy || typeof policy !== 'object') {
    errors[prefix] = 'required';
    return;
  }
  const start = Number(policy.payroll_cycle_start_day);
  const end = Number(policy.payroll_cycle_end_day);
  if (!Number.isInteger(start) || start < 1 || start > 31) {
    errors[`${prefix}.payroll_cycle_start_day`] = 'must be 1-31';
  }
  if (!Number.isInteger(end) || end < 1 || end > 31) {
    errors[`${prefix}.payroll_cycle_end_day`] = 'must be 1-31';
  }
  if (policy.comp_off_applicable) {
    if (!Array.isArray(policy.comp_off_types) || policy.comp_off_types.length === 0) {
      errors[`${prefix}.comp_off_types`] = 'at least one type required when comp off applicable';
    }
    if (Number(policy.comp_off_rule) <= 0) {
      errors[`${prefix}.comp_off_rule`] = 'must be > 0';
    }
    if (policy.comp_off_types?.includes('PAID_CO') && Number(policy.paid_comp_off_rule) <= 0) {
      errors[`${prefix}.paid_comp_off_rule`] = 'must be > 0';
    }
  }
  if (policy.nh_comp_off_applicable) {
    if (Number(policy.nh_off_rule) <= 0) errors[`${prefix}.nh_off_rule`] = 'must be > 0';
    if (Number(policy.nh_pay_rule) <= 0) errors[`${prefix}.nh_pay_rule`] = 'must be > 0';
  }
  if (policy.incentive_applicable) {
    if (!Number.isFinite(Number(policy.incentive_min_days)) || Number(policy.incentive_min_days) < 0) {
      errors[`${prefix}.incentive_min_days`] = 'must be >= 0';
    }
    if (!Number.isFinite(Number(policy.incentive_value)) || Number(policy.incentive_value) < 0) {
      errors[`${prefix}.incentive_value`] = 'must be >= 0';
    }
  }
}

export function validateLeaveAllowancesPayload(allowances, designations, errors) {
  if (!Array.isArray(allowances)) {
    errors.leave_allowances = 'must be an array';
    return;
  }
  const desigSet = new Set(designations.map((d) => d.toLowerCase()));
  const seen = new Set();
  for (const row of allowances) {
    const desig = String(row?.designation ?? '').trim();
    if (!desig) {
      errors.leave_allowances = 'each row needs designation';
      return;
    }
    const key = desig.toLowerCase();
    if (!desigSet.has(key)) {
      errors[`leave_allowances.${desig}`] = 'designation must be in designations list';
    }
    if (seen.has(key)) {
      errors[`leave_allowances.${desig}`] = 'duplicate designation';
    }
    seen.add(key);
    for (const field of ['sick_days', 'paid_days', 'maternity_days', 'paternity_days', 'earned_days']) {
      const v = Number(row[field]);
      if (!Number.isFinite(v) || v < 0) {
        errors[`leave_allowances.${desig}.${field}`] = 'must be >= 0';
      }
    }
  }
  for (const d of designations) {
    if (!seen.has(d.toLowerCase())) {
      errors[`leave_allowances.${d}`] = 'allowance row required';
    }
  }
}

export function validateHolidaysPayload(holidays, errors) {
  if (!Array.isArray(holidays)) {
    errors.holidays = 'must be an array';
    return;
  }
  const seen = new Set();
  for (let i = 0; i < holidays.length; i += 1) {
    const h = holidays[i];
    const date = String(h?.holiday_date ?? '').slice(0, 10);
    const type = h?.holiday_type == null || h?.holiday_type === ''
      ? 'NH'
      : String(h.holiday_type).toUpperCase();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      errors[`holidays.${i}.holiday_date`] = 'invalid date';
    }
    if (type !== 'NH' && type !== 'FH') {
      errors[`holidays.${i}.holiday_type`] = 'must be NH or FH';
    }
    if (seen.has(date)) {
      errors[`holidays.${i}`] = 'duplicate';
    }
    seen.add(date);
  }
}