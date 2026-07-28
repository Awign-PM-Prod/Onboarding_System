import assert from 'node:assert/strict';
import { computeRowSummary, mergeYtdTaken } from '../src/utils/attendanceCalculator.js';
import { normalizeAttendancePolicy } from '../src/utils/clientPolicyCore.js';

const policy = normalizeAttendancePolicy({
  payroll_cycle_start_day: 1,
  payroll_cycle_end_day: 31,
  week_off_config: { presets: ['sat_sun'], weekdays: [] }
});

const bundle = {
  attendance_policy: policy,
  leave_allowances: [{
    designation: 'Executive',
    earned_days: 15,
    sick_days: 10,
    paid_days: 12,
    maternity_days: 180,
    paternity_days: 15
  }],
  holidays: []
};

const employee = { designation: 'Executive', gender: 'F', doj: '2026-01-01', lwd: null };

// March: 1 EL day
const marchMarks = [{ mark_date: '2026-03-10', code: 'EL' }];
const marchSummary = computeRowSummary({
  dayMarks: marchMarks,
  policyBundle: bundle,
  employee,
  monthYm: '2026-03',
  ytdTaken: mergeYtdTaken([])
});
assert.equal(marchSummary.leave_summary.EL_taken, 1);

// April YTD should include March EL when prior legend totals are merged
const aprilSummary = computeRowSummary({
  dayMarks: [{ mark_date: '2026-04-08', code: 'EL' }],
  policyBundle: bundle,
  employee,
  monthYm: '2026-04',
  ytdTaken: mergeYtdTaken([marchSummary.legend_totals])
});
assert.equal(aprilSummary.leave_summary.EL_taken, 2);

// Inline edit simulation: P -> A should increase LOP and reduce paid days
const beforeMarks = [
  { mark_date: '2026-04-01', code: 'P' },
  { mark_date: '2026-04-02', code: 'P' }
];
const afterMarks = [
  { mark_date: '2026-04-01', code: 'A' },
  { mark_date: '2026-04-02', code: 'P' }
];

const beforeSummary = computeRowSummary({
  dayMarks: beforeMarks,
  policyBundle: bundle,
  employee: { ...employee, doj: '2026-04-01', lwd: null },
  monthYm: '2026-04',
  ytdTaken: mergeYtdTaken([])
});
const afterSummary = computeRowSummary({
  dayMarks: afterMarks,
  policyBundle: bundle,
  employee: { ...employee, doj: '2026-04-01', lwd: null },
  monthYm: '2026-04',
  ytdTaken: mergeYtdTaken([])
});

assert.equal(beforeSummary.paid_days, 2);
assert.equal(beforeSummary.lop, 0);
assert.equal(afterSummary.paid_days, 1);
assert.equal(afterSummary.lop, 1);
assert.equal(afterSummary.legend_totals.A, 1);
assert.equal(afterSummary.legend_totals.P, 1);

console.log('smoke-attendance-inline-save: ok');
