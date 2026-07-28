import assert from 'node:assert/strict';
import { normalizeAttendancePolicy } from '../src/utils/clientPolicyCore.js';
import { selectPolicyBundleForMonth } from '../src/utils/clientPolicyVersioning.js';
import { computeRowSummary } from '../src/utils/attendanceCalculator.js';
import { summarizePolicyChanges } from '../src/utils/clientPolicyDiff.js';

const policyA = normalizeAttendancePolicy({
  payroll_cycle_start_day: 1,
  payroll_cycle_end_day: 31,
  week_off_config: { presets: ['sat_sun'], weekdays: [] }
});

const policyB = normalizeAttendancePolicy({
  payroll_cycle_start_day: 25,
  payroll_cycle_end_day: 24,
  week_off_config: { presets: ['all_sundays'], weekdays: [] }
});

const versions = [
  {
    effective_from_month: '2000-01-01',
    created_at: '2026-01-01T00:00:00Z',
    policy_json: {
      attendance_policy: policyA,
      leave_allowances: [{ designation: 'Executive', earned_days: 12, sick_days: 6, paid_days: 12, maternity_days: 180, paternity_days: 15 }],
      holidays: []
    }
  },
  {
    effective_from_month: '2026-06-01',
    created_at: '2026-06-15T00:00:00Z',
    policy_json: {
      attendance_policy: policyB,
      leave_allowances: [{ designation: 'Executive', earned_days: 15, sick_days: 6, paid_days: 12, maternity_days: 180, paternity_days: 15 }],
      holidays: [{ holiday_date: '2026-06-15', holiday_type: 'NH' }]
    }
  }
];

const mayBundle = selectPolicyBundleForMonth(versions, '2026-05', normalizeAttendancePolicy);
assert.equal(mayBundle.attendance_policy.payroll_cycle_start_day, 1);
assert.equal(mayBundle.leave_allowances[0].earned_days, 12);

const juneBundle = selectPolicyBundleForMonth(versions, '2026-06', normalizeAttendancePolicy);
assert.equal(juneBundle.attendance_policy.payroll_cycle_start_day, 25);
assert.equal(juneBundle.leave_allowances[0].earned_days, 15);
assert.equal(juneBundle.holidays.length, 1);

const julyBundle = selectPolicyBundleForMonth(versions, '2026-07', normalizeAttendancePolicy);
assert.equal(julyBundle.attendance_policy.payroll_cycle_start_day, 25);

// May sheet uses policy A; June sheet uses policy B for the same marks
const marks = [{ mark_date: '2026-05-04', code: 'W' }];
const maySummary = computeRowSummary({
  dayMarks: marks,
  policyBundle: mayBundle,
  employee: { designation: 'Executive', doj: '2026-01-01', lwd: null },
  monthYm: '2026-05',
  ytdTaken: { EL: 0, SL: 0, CL: 0, PL: 0, ML: 0, RH: 0, CO: 0, NH: 0, FH: 0 }
});
assert.equal(maySummary.legend_totals.W, 1);

const auditMessage = summarizePolicyChanges(['Week off changed'], '2026-06');
assert.ok(auditMessage.includes('Effective from 2026-06'));

console.log('smoke-policy-versioning: ok');
