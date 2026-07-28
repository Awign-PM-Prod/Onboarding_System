import { computeLegendTotals, normalizeAttendanceCode } from './attendanceLegend.js';
import {
  datesInPeriod,
  getCalendarMonthPeriod,
  isWeekOffDate
} from './clientPolicyCore.js';

const PAID_FULL = new Set(['P', 'W', 'NH', 'FH', 'EL', 'SL', 'CL', 'PL', 'ML', 'RH', 'CO']);
const NOT_CONSIDERED = new Set(['R', 'T', '-']);
/** Day marks that count toward a consecutive present-day streak for incentive. */
const STREAK_PRESENT = new Set(['P', 'P-NH', 'P-FH', 'HD']);

function parseIso(iso) {
  const s = String(iso ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

function isActiveOnDate(iso, doj, lwd) {
  const d = parseIso(iso);
  if (!d) return false;
  const join = parseIso(doj);
  const leave = parseIso(lwd);
  if (join && d < join) return false;
  if (leave && d > leave) return false;
  return true;
}

function normalizeDesignationKey(name) {
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

export function annualLeaveAllowanceFromPolicy(allowance, leaveCode) {
  const field = LEAVE_CODE_TO_ALLOWANCE_FIELD[String(leaveCode ?? '').toUpperCase()];
  if (!field || !allowance) return null;
  return Math.max(0, Number(allowance[field]) || 0);
}

function findAllowance(leaveAllowances, designation) {
  return findLeaveAllowanceForDesignation(leaveAllowances, designation);
}

function holidaysInPeriod(holidays, start, end) {
  const nh = [];
  const fh = [];
  for (const h of holidays ?? []) {
    const d = parseIso(h.holiday_date);
    if (!d || d < start || d > end) continue;
    if (h.holiday_type === 'NH') nh.push(d);
    if (h.holiday_type === 'FH') fh.push(d);
  }
  return { nh, fh };
}

function emptyYtd() {
  return { EL: 0, SL: 0, CL: 0, PL: 0, ML: 0, RH: 0, CO: 0, NH: 0, FH: 0 };
}

/** Sum legend totals from prior rows in the same calendar year. */
export function mergeYtdTaken(priorRowsLegendTotals) {
  const ytd = emptyYtd();
  const map = {
    EL: 'EL', SL: 'SL', CL: 'CL', PL: 'PL', ML: 'ML', RH: 'RH', CO: 'CO', NH: 'NH', FH: 'FH'
  };
  for (const totals of priorRowsLegendTotals ?? []) {
    for (const [code, key] of Object.entries(map)) {
      ytd[key] += Number(totals?.[code] ?? 0);
    }
  }
  return ytd;
}

function paidWeightForCode(code, policy) {
  const c = normalizeAttendanceCode(code);
  if (!c) return 0;
  if (c === 'HD') return 0.5;
  if (PAID_FULL.has(c)) return 1;
  if (c === 'P-NH') {
    if (policy.comp_off_applicable && policy.comp_off_types?.includes('PAID_CO')) {
      return Number(policy.paid_comp_off_rule) || 1;
    }
    if (policy.nh_comp_off_applicable) return Number(policy.nh_pay_rule) || 1;
    return 1;
  }
  if (c === 'P-FH') {
    if (policy.comp_off_applicable && policy.comp_off_types?.includes('PAID_CO')) {
      return Number(policy.paid_comp_off_rule) || 1;
    }
    if (policy.fh_comp_off_applicable) return Number(policy.fh_pay_rule) || 1;
    return 1;
  }
  return 0;
}

/**
 * Longest run of consecutive calendar days (within active employment) marked present.
 * Present = P, P-NH, P-FH, HD. Week-offs, holidays, leave, absent, and empty cells break the streak.
 */
export function computeMaxConsecutivePresentStreak(periodDates, marksByDate, employee) {
  let streak = 0;
  let max = 0;
  for (const d of periodDates ?? []) {
    if (!isActiveOnDate(d, employee?.doj, employee?.lwd)) continue;
    const code = marksByDate.get(d);
    if (code && STREAK_PRESENT.has(code)) {
      streak += 1;
      if (streak > max) max = streak;
    } else {
      streak = 0;
    }
  }
  return max;
}

/** Incentive when longest consecutive present-day streak meets the policy minimum. */
export function computeIncentiveFromPolicy(consecutivePresentDays, attendancePolicy) {
  const policy = attendancePolicy ?? {};
  if (!policy.incentive_applicable) return null;
  const minDays = Number(policy.incentive_min_days) || 0;
  const value = Number(policy.incentive_value) || 0;
  if (Number(consecutivePresentDays) >= minDays) return value;
  return 0;
}

/**
 * Compute row summary fields from day marks and client policy.
 *
 * Assumptions (see plan):
 * - Calculations cover the sheet's calendar month (1st to last day), matching the
 *   attendance grid. The payroll cycle stays as payout metadata only.
 * - Leave allowances are annual; ytdTaken is from prior months in calendar year.
 * - NH/FH quota = holidays of that type in the calendar month.
 * - HD = 0.5 paid day.
 */
export function computeRowSummary({
  dayMarks,
  policyBundle,
  employee,
  monthYm,
  ytdTaken = emptyYtd(),
  openingCoBalance = 0
}) {
  const policy = policyBundle?.attendance_policy ?? {};
  const leaveAllowances = policyBundle?.leave_allowances ?? [];
  const holidays = policyBundle?.holidays ?? [];

  const period = getCalendarMonthPeriod(monthYm);
  const periodDates = datesInPeriod(period.start, period.end);
  const marksByDate = new Map();
  for (const m of dayMarks ?? []) {
    const d = parseIso(m.mark_date);
    if (d) marksByDate.set(d, normalizeAttendanceCode(m.code) ?? String(m.code).trim().toUpperCase());
  }

  const codes = periodDates.map((d) => marksByDate.get(d)).filter(Boolean);
  const legend_totals = computeLegendTotals(codes);

  let paid_days = 0;
  let lop = 0;
  let not_considered = 0;

  for (const d of periodDates) {
    if (!isActiveOnDate(d, employee?.doj, employee?.lwd)) {
      not_considered += 1;
      continue;
    }
    const code = marksByDate.get(d);
    if (!code) continue;
    if (NOT_CONSIDERED.has(code)) {
      not_considered += 1;
      continue;
    }
    if (code === 'A') {
      lop += 1;
      continue;
    }
    paid_days += paidWeightForCode(code, policy);
  }

  const total_days = periodDates.filter((d) => isActiveOnDate(d, employee?.doj, employee?.lwd)).length;

  const allowance = findAllowance(leaveAllowances, employee?.designation);
  const { nh: nhDates, fh: fhDates } = holidaysInPeriod(holidays, period.start, period.end);

  const periodTaken = {
    EL: legend_totals.EL ?? 0,
    SL: legend_totals.SL ?? 0,
    CL: legend_totals.CL ?? 0,
    PL: legend_totals.PL ?? 0,
    ML: legend_totals.ML ?? 0,
    RH: legend_totals.RH ?? 0,
    CO: legend_totals.CO ?? 0,
    NH: legend_totals.NH ?? 0,
    FH: legend_totals.FH ?? 0
  };

  const ytd = { ...emptyYtd(), ...ytdTaken };
  const ytdWithPeriod = {};
  for (const k of Object.keys(emptyYtd())) {
    ytdWithPeriod[k] = (ytd[k] ?? 0) + (periodTaken[k] ?? 0);
  }

  let coEarned = 0;
  if (policy.comp_off_applicable && policy.comp_off_types?.includes('CO')) {
    if (policy.nh_comp_off_applicable) {
      coEarned += (legend_totals['P-NH'] ?? 0) * (Number(policy.nh_off_rule) || 1);
    }
    if (policy.fh_comp_off_applicable) {
      coEarned += (legend_totals['P-FH'] ?? 0) * (Number(policy.fh_off_rule) || 1);
    }
  }

  const coLeft = (Number(openingCoBalance) || 0) + coEarned - ytdWithPeriod.CO;

  const consecutivePresentDays = computeMaxConsecutivePresentStreak(
    periodDates,
    marksByDate,
    employee
  );

  const leave_summary = {
    EL_taken: ytdWithPeriod.EL,
    SL_taken: ytdWithPeriod.SL,
    CL_taken: ytdWithPeriod.CL,
    PL_taken: ytdWithPeriod.PL,
    ML_taken: ytdWithPeriod.ML,
    RH_taken: ytdWithPeriod.RH,
    CO_taken: ytdWithPeriod.CO,
    NH_taken: periodTaken.NH,
    FH_taken: periodTaken.FH,
    NH_taken_ytd: ytdWithPeriod.NH,
    FH_taken_ytd: ytdWithPeriod.FH,
    EL_annual: Math.max(0, Number(allowance?.earned_days) || 0),
    SL_annual: Math.max(0, Number(allowance?.sick_days) || 0),
    CL_annual: Math.max(0, Number(allowance?.paid_days) || 0),
    PL_annual: Math.max(0, Number(allowance?.paternity_days) || 0),
    ML_annual: Math.max(0, Number(allowance?.maternity_days) || 0),
    EL_left: Math.max(0, (allowance?.earned_days ?? 0) - ytdWithPeriod.EL),
    SL_left: Math.max(0, (allowance?.sick_days ?? 0) - ytdWithPeriod.SL),
    CL_left: Math.max(0, (allowance?.paid_days ?? 0) - ytdWithPeriod.CL),
    PL_left: Math.max(0, (allowance?.paternity_days ?? 0) - ytdWithPeriod.PL),
    ML_left: Math.max(0, (allowance?.maternity_days ?? 0) - ytdWithPeriod.ML),
    RH_left: 0,
    CO_left: Math.max(0, coLeft),
    NH_left: Math.max(0, nhDates.length - periodTaken.NH),
    FH_left: Math.max(0, fhDates.length - periodTaken.FH),
    NH_allowed: nhDates.length,
    FH_allowed: fhDates.length,
    CO_earned_period: coEarned
  };

  return {
    paid_days: Math.round(paid_days * 100) / 100,
    lop,
    not_considered,
    total_days,
    legend_totals,
    leave_summary,
    incentive: computeIncentiveFromPolicy(consecutivePresentDays, policy),
    calc_period: period
  };
}

/**
 * Suggest default day marks for empty cells: holidays override week off.
 * Fills the calendar month so suggestions match the visible grid.
 */
export function suggestDefaultMarks(policyBundle, monthYm, existingMarks = []) {
  const policy = policyBundle?.attendance_policy ?? {};
  const holidays = policyBundle?.holidays ?? [];
  const period = getCalendarMonthPeriod(monthYm);
  const existing = new Set((existingMarks ?? []).map((m) => parseIso(m.mark_date)).filter(Boolean));
  const holidayMap = new Map();
  for (const h of holidays) {
    const d = parseIso(h.holiday_date);
    if (d) holidayMap.set(d, h.holiday_type);
  }

  const suggestions = [];
  for (const d of datesInPeriod(period.start, period.end)) {
    if (existing.has(d)) continue;
    if (holidayMap.has(d)) {
      suggestions.push({ mark_date: d, code: holidayMap.get(d) });
    } else if (isWeekOffDate(d, policy.week_off_config)) {
      suggestions.push({ mark_date: d, code: 'W' });
    }
  }
  return suggestions;
}
