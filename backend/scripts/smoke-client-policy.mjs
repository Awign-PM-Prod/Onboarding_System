import assert from 'node:assert/strict';
import {
  normalizeAttendancePolicy,
  DEFAULT_ATTENDANCE_POLICY,
  validateHolidaysPayload
} from '../src/utils/clientPolicyCore.js';
import {
  computeIncentiveFromPolicy,
  computeRowSummary,
  computeMaxConsecutivePresentStreak
} from '../src/utils/attendanceCalculator.js';
import { diffClientPolicyBundles } from '../src/utils/clientPolicyDiff.js';

// --- Policy persistence shape (what upsert should store) ---
const savedPolicy = normalizeAttendancePolicy({
  payroll_cycle_start_day: 1,
  payroll_cycle_end_day: 31,
  week_off_config: { presets: ['sat_sun'], weekdays: [] },
  incentive_applicable: true,
  incentive_min_days: 26,
  incentive_value: 500
});

assert.equal(savedPolicy.incentive_applicable, true);
assert.equal(savedPolicy.incentive_min_days, 26);
assert.equal(savedPolicy.incentive_value, 500);

const reloaded = normalizeAttendancePolicy({
  ...DEFAULT_ATTENDANCE_POLICY,
  incentive_applicable: true,
  incentive_min_days: 26,
  incentive_value: 500
});
assert.equal(reloaded.incentive_value, 500);

// Value without explicit applicable flag still normalizes to applicable
const withValueOnly = normalizeAttendancePolicy({
  incentive_applicable: false,
  incentive_value: 500
});
assert.equal(withValueOnly.incentive_applicable, true);
assert.equal(withValueOnly.incentive_value, 500);

// --- Incentive calculation from policy ---
const incentivePolicy = normalizeAttendancePolicy({
  incentive_applicable: true,
  incentive_min_days: 26,
  incentive_value: 500
});
assert.equal(computeIncentiveFromPolicy(26, incentivePolicy), 500);
assert.equal(computeIncentiveFromPolicy(25, incentivePolicy), 0);
assert.equal(computeIncentiveFromPolicy(30, incentivePolicy), 500);
assert.equal(computeIncentiveFromPolicy(30, { incentive_applicable: false }), null);

// --- Paid days: full calendar month, Sat/Sun week off ---
const aprilPolicy = normalizeAttendancePolicy({
  payroll_cycle_start_day: 1,
  payroll_cycle_end_day: 31,
  week_off_config: { presets: ['sat_sun'], weekdays: [] },
  comp_off_applicable: false,
  nh_comp_off_applicable: false,
  fh_comp_off_applicable: false
});

const aprilBundle = {
  attendance_policy: aprilPolicy,
  leave_allowances: [{
    designation: 'Executive',
    sick_days: 10,
    paid_days: 12,
    maternity_days: 180,
    paternity_days: 15,
    earned_days: 15
  }],
  holidays: [{ holiday_date: '2026-04-03', holiday_type: 'NH' }]
};

// 30 days in April 2026: mark every weekday P, weekends W, one NH on 3rd
const aprilMarks = [];
for (let day = 1; day <= 30; day += 1) {
  const iso = `2026-04-${String(day).padStart(2, '0')}`;
  const dow = new Date(`${iso}T00:00:00Z`).getUTCDay();
  let code = 'P';
  if (iso === '2026-04-03') code = 'NH';
  else if (dow === 0 || dow === 6) code = 'W';
  aprilMarks.push({ mark_date: iso, code });
}

const aprilSummary = computeRowSummary({
  dayMarks: aprilMarks,
  policyBundle: aprilBundle,
  employee: { designation: 'Executive', gender: 'F', doj: '2026-01-01', lwd: null },
  monthYm: '2026-04',
  ytdTaken: { EL: 0, SL: 0, CL: 0, PL: 0, ML: 0, RH: 0, CO: 0, NH: 0, FH: 0 }
});

// April 2026: 22 weekdays (incl. 1 NH) + 8 weekend W = 30 marked days
// Paid: 21 P + 1 NH + 8 W = 30
assert.equal(aprilSummary.paid_days, 30);
assert.equal(aprilSummary.lop, 0);
assert.equal(aprilSummary.legend_totals.P, 21);
assert.equal(aprilSummary.legend_totals.NH, 1);
assert.equal(aprilSummary.legend_totals.W, 8);

const aprilIncentivePolicy = normalizeAttendancePolicy({
  ...aprilPolicy,
  incentive_applicable: true,
  incentive_min_days: 26,
  incentive_value: 500
});
// Weekday P + weekend W: paid days high but longest present streak is only ~5
const aprilWeekdayOnly = computeRowSummary({
  dayMarks: aprilMarks,
  policyBundle: { ...aprilBundle, attendance_policy: aprilIncentivePolicy },
  employee: { designation: 'Executive', gender: 'F', doj: '2026-01-01', lwd: null },
  monthYm: '2026-04',
  ytdTaken: { EL: 0, SL: 0, CL: 0, PL: 0, ML: 0, RH: 0, CO: 0, NH: 0, FH: 0 }
});
assert.equal(aprilWeekdayOnly.incentive, 0);

const consecutiveAprilMarks = Array.from({ length: 30 }, (_, i) => ({
  mark_date: `2026-04-${String(i + 1).padStart(2, '0')}`,
  code: 'P'
}));
const aprilWithIncentive = computeRowSummary({
  dayMarks: consecutiveAprilMarks,
  policyBundle: { ...aprilBundle, attendance_policy: aprilIncentivePolicy },
  employee: { designation: 'Executive', gender: 'F', doj: '2026-01-01', lwd: null },
  monthYm: '2026-04',
  ytdTaken: { EL: 0, SL: 0, CL: 0, PL: 0, ML: 0, RH: 0, CO: 0, NH: 0, FH: 0 }
});
assert.equal(aprilWithIncentive.incentive, 500);
assert.equal(
  computeMaxConsecutivePresentStreak(
    Array.from({ length: 30 }, (_, i) => `2026-04-${String(i + 1).padStart(2, '0')}`),
    new Map(consecutiveAprilMarks.map((m) => [m.mark_date, m.code])),
    { doj: '2026-01-01', lwd: null }
  ),
  30
);
assert.equal(aprilWithIncentive.leave_summary.EL_annual, 15);
assert.equal(aprilWithIncentive.leave_summary.SL_annual, 10);

// --- Paid days: half day + absent ---
const mixedMarks = [
  { mark_date: '2026-04-01', code: 'P' },
  { mark_date: '2026-04-02', code: 'HD' },
  { mark_date: '2026-04-03', code: 'A' },
  { mark_date: '2026-04-04', code: 'EL' }
];
const mixedSummary = computeRowSummary({
  dayMarks: mixedMarks,
  policyBundle: aprilBundle,
  employee: { designation: 'Executive', gender: 'F', doj: '2026-04-01', lwd: null },
  monthYm: '2026-04',
  ytdTaken: { EL: 0, SL: 0, CL: 0, PL: 0, ML: 0, RH: 0, CO: 0, NH: 0, FH: 0 }
});
assert.equal(mixedSummary.paid_days, 2.5); // P + HD(0.5) + EL
assert.equal(mixedSummary.lop, 1);

// --- NH-only holiday validation ---
const holidayErrors = {};
validateHolidaysPayload([
  { holiday_date: '2026-01-26' },
  { holiday_date: '2026-08-15', holiday_type: 'FH' }
], holidayErrors);
assert.equal(Object.keys(holidayErrors).length, 0);

// --- Policy diff ---
const beforeBundle = {
  attendance_policy: normalizeAttendancePolicy({
    payroll_cycle_start_day: 1,
    payroll_cycle_end_day: 31,
    nh_comp_off_applicable: false
  }),
  leave_allowances: [{ designation: 'Executive', earned_days: 12, sick_days: 6, paid_days: 12, maternity_days: 180, paternity_days: 15 }],
  holidays: [{ holiday_date: '2026-01-26', holiday_type: 'NH' }]
};
const afterBundle = {
  attendance_policy: normalizeAttendancePolicy({
    payroll_cycle_start_day: 25,
    payroll_cycle_end_day: 24,
    nh_comp_off_applicable: true,
    nh_off_rule: 2,
    nh_pay_rule: 1
  }),
  leave_allowances: [{ designation: 'Executive', earned_days: 15, sick_days: 6, paid_days: 12, maternity_days: 180, paternity_days: 15 }],
  holidays: [{ holiday_date: '2026-01-26', holiday_type: 'NH' }, { holiday_date: '2026-08-15', holiday_type: 'NH' }]
};
const changes = diffClientPolicyBundles(beforeBundle, afterBundle);
assert.ok(changes.some((c) => c.includes('Payroll cycle')));
assert.ok(changes.some((c) => c.includes('NH comp off')));
assert.ok(changes.some((c) => c.includes('Holiday added: 2026-08-15')));
assert.ok(changes.some((c) => c.includes('earned days 12 → 15')));

console.log('smoke-client-policy: ok');
