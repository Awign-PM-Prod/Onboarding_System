import assert from 'node:assert/strict';
import { selectPolicyBundleForMonth } from '../src/utils/clientPolicyVersioning.js';
import { normalizeAttendancePolicy } from '../src/utils/clientPolicyCore.js';
import { computeRowSummary } from '../src/utils/attendanceCalculator.js';

const oldPolicy = normalizeAttendancePolicy({
  payroll_cycle_start_day: 1,
  payroll_cycle_end_day: 31,
  week_off_config: { presets: ['sat_sun'], weekdays: [] },
  incentive_applicable: true,
  incentive_min_days: 26,
  incentive_value: 500
});

const newPolicy = normalizeAttendancePolicy({
  ...oldPolicy,
  incentive_value: 900
});

const versions = [
  {
    effective_from_month: '2000-01-01',
    created_at: '2026-01-01T00:00:00Z',
    policy_json: {
      attendance_policy: oldPolicy,
      leave_allowances: [],
      holidays: []
    }
  },
  {
    effective_from_month: '2026-06-01',
    created_at: '2026-06-01T00:00:00Z',
    policy_json: {
      attendance_policy: newPolicy,
      leave_allowances: [],
      holidays: []
    }
  }
];

const mayBundle = selectPolicyBundleForMonth(versions, '2026-05', normalizeAttendancePolicy);
const juneBundle = selectPolicyBundleForMonth(versions, '2026-06', normalizeAttendancePolicy);

const consecutiveMarks = Array.from({ length: 30 }, (_, i) => ({
  mark_date: `2026-05-${String(i + 1).padStart(2, '0')}`,
  code: 'P'
}));

const mayIncentive = computeRowSummary({
  dayMarks: consecutiveMarks,
  policyBundle: mayBundle,
  employee: { doj: '2026-05-01', lwd: null },
  monthYm: '2026-05',
  ytdTaken: { EL: 0, SL: 0, CL: 0, PL: 0, ML: 0, RH: 0, CO: 0, NH: 0, FH: 0 }
}).incentive;

const juneMarks = consecutiveMarks.map((m) => ({
  ...m,
  mark_date: m.mark_date.replace('2026-05', '2026-06')
}));
const juneIncentive = computeRowSummary({
  dayMarks: juneMarks,
  policyBundle: juneBundle,
  employee: { doj: '2026-06-01', lwd: null },
  monthYm: '2026-06',
  ytdTaken: { EL: 0, SL: 0, CL: 0, PL: 0, ML: 0, RH: 0, CO: 0, NH: 0, FH: 0 }
}).incentive;

assert.equal(mayIncentive, 500);
assert.equal(juneIncentive, 900);

console.log('smoke-attendance-policy-scope: ok');
