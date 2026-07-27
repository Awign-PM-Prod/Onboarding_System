import assert from 'node:assert/strict';
import { computeIncentiveFromPolicy, computeRowSummary, computeMaxConsecutivePresentStreak, suggestDefaultMarks } from '../src/utils/attendanceCalculator.js';
import {
  getPayrollPeriod,
  isWeekOffDate,
  normalizeAttendancePolicy
} from '../src/utils/clientPolicyCore.js';

const policy = normalizeAttendancePolicy({
  payroll_cycle_start_day: 25,
  payroll_cycle_end_day: 24,
  week_off_config: { presets: ['sat_sun'], weekdays: [] },
  comp_off_applicable: true,
  comp_off_types: ['CO'],
  nh_comp_off_applicable: true,
  nh_off_rule: 2,
  fh_comp_off_applicable: true,
  fh_off_rule: 1.5
});

const period = getPayrollPeriod(policy, '2026-04');
assert.equal(period.start, '2026-03-25');
assert.equal(period.end, '2026-04-24');

const calPeriod = getPayrollPeriod(
  normalizeAttendancePolicy({ payroll_cycle_start_day: 1, payroll_cycle_end_day: 31 }),
  '2026-04'
);
assert.equal(calPeriod.start, '2026-04-01');
assert.equal(calPeriod.end, '2026-04-30');

assert.equal(isWeekOffDate('2026-04-04', { presets: ['sat_sun'], weekdays: [] }), true);
assert.equal(isWeekOffDate('2026-04-06', { presets: ['sat_sun'], weekdays: [] }), false);
assert.equal(isWeekOffDate('2026-04-05', { presets: ['all_sundays'], weekdays: [] }), true);

const policyBundle = {
  attendance_policy: policy,
  leave_allowances: [{
    designation: 'Field Executive',
    sick_days: 10,
    paid_days: 12,
    maternity_days: 180,
    paternity_days: 15,
    earned_days: 15
  }],
  holidays: [
    { holiday_date: '2026-04-03', holiday_type: 'NH' }
  ]
};

const dayMarks = [
  { mark_date: '2026-03-25', code: 'P' },
  { mark_date: '2026-03-26', code: 'P' },
  { mark_date: '2026-03-27', code: 'NH' },
  { mark_date: '2026-03-28', code: 'A' },
  { mark_date: '2026-03-29', code: 'W' },
  { mark_date: '2026-03-30', code: 'W' },
  { mark_date: '2026-03-31', code: 'P' }
];

const summary = computeRowSummary({
  dayMarks,
  policyBundle,
  employee: { designation: 'Field Executive', gender: 'F', doj: '2026-03-01', lwd: null },
  monthYm: '2026-04',
  ytdTaken: { EL: 0, SL: 0, CL: 0, PL: 0, ML: 0, RH: 0, CO: 0, NH: 0, FH: 0 }
});

assert.equal(summary.legend_totals.P, 3);
assert.equal(summary.legend_totals.NH, 1);
assert.equal(summary.legend_totals.A, 1);
assert.equal(summary.legend_totals.W, 2);
assert.equal(summary.paid_days, 6);
assert.equal(summary.lop, 1);
assert.ok(summary.leave_summary.EL_left >= 0);

const incentivePolicy = normalizeAttendancePolicy({
  incentive_applicable: true,
  incentive_min_days: 26,
  incentive_value: 900
});
assert.equal(computeIncentiveFromPolicy(26, incentivePolicy), 900);
assert.equal(computeIncentiveFromPolicy(25, incentivePolicy), 0);
assert.equal(computeIncentiveFromPolicy(30, incentivePolicy), 900);
assert.equal(computeIncentiveFromPolicy(30, { incentive_applicable: false }), null);

const streakMarks = new Map([
  ['2026-04-01', 'P'],
  ['2026-04-02', 'P'],
  ['2026-04-03', 'W'],
  ['2026-04-04', 'P'],
  ['2026-04-05', 'P']
]);
assert.equal(
  computeMaxConsecutivePresentStreak(
    ['2026-04-01', '2026-04-02', '2026-04-03', '2026-04-04', '2026-04-05'],
    streakMarks,
    { doj: '2026-04-01', lwd: null }
  ),
  2
);

const summaryWithIncentive = computeRowSummary({
  dayMarks: Array.from({ length: 26 }, (_, i) => ({
    mark_date: `2026-04-${String(i + 1).padStart(2, '0')}`,
    code: 'P'
  })),
  policyBundle: {
    ...policyBundle,
    attendance_policy: { ...policy, ...incentivePolicy }
  },
  employee: { designation: 'Field Executive', gender: 'F', doj: '2026-04-01', lwd: null },
  monthYm: '2026-04',
  ytdTaken: { EL: 0, SL: 0, CL: 0, PL: 0, ML: 0, RH: 0, CO: 0, NH: 0, FH: 0 }
});
assert.equal(summaryWithIncentive.incentive, 900);

const defaultSuggestions = suggestDefaultMarks(policyBundle, '2026-04', dayMarks);
assert.ok(defaultSuggestions.length > 0);
assert.ok(defaultSuggestions.every((s) => s.code === 'W' || s.code === 'NH'));
assert.ok(defaultSuggestions.every((s) => !dayMarks.some((m) => m.mark_date === s.mark_date)));

const filledMarks = [
  ...dayMarks,
  ...defaultSuggestions.map((s) => ({ mark_date: s.mark_date, code: s.code }))
];
const summaryWithDefaults = computeRowSummary({
  dayMarks: filledMarks,
  policyBundle,
  employee: { designation: 'Field Executive', gender: 'F', doj: '2026-03-01', lwd: null },
  monthYm: '2026-04',
  ytdTaken: { EL: 0, SL: 0, CL: 0, PL: 0, ML: 0, RH: 0, CO: 0, NH: 0, FH: 0 }
});
assert.ok(summaryWithDefaults.paid_days >= summary.paid_days);

console.log('smoke-attendance-calculator: ok');
