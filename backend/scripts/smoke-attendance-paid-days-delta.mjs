/**
 * PL paid_days edit delta tests (Section 8 of docs/attendance-calculation-dependencies.md).
 */
import assert from 'node:assert/strict';
import { computeRowSummary } from '../src/utils/attendanceCalculator.js';
import { normalizeAttendancePolicy } from '../src/utils/clientPolicyCore.js';

const DATE = '2026-04-10';
const DATE2 = '2026-04-11';

const policyBundle = {
  attendance_policy: normalizeAttendancePolicy({
    payroll_cycle_start_day: 1,
    payroll_cycle_end_day: 31,
    week_off_config: { presets: ['sat_sun'], weekdays: [] }
  }),
  leave_allowances: [{
    designation: 'Executive',
    earned_days: 15,
    sick_days: 10,
    paid_days: 12,
    maternity_days: 180,
    paternity_days: 15
  }],
  holidays: [{ holiday_date: '2026-04-03', holiday_type: 'NH' }]
};

const employee = {
  designation: 'Executive',
  gender: 'F',
  doj: '2026-04-01',
  lwd: null
};

const emptyYtd = { EL: 0, SL: 0, CL: 0, PL: 0, ML: 0, RH: 0, CO: 0, NH: 0, FH: 0 };

function rowSummary(dayMarks) {
  return computeRowSummary({
    dayMarks,
    policyBundle,
    employee,
    monthYm: '2026-04',
    ytdTaken: emptyYtd
  });
}

function applyEdit(baseMarks, date, oldCode, newCode) {
  const before = rowSummary(baseMarks);
  const marks = baseMarks.filter((m) => m.mark_date !== date);
  if (newCode) marks.push({ mark_date: date, code: newCode });
  const after = rowSummary(marks);
  return {
    before,
    after,
    deltaPaid: after.paid_days - before.paid_days,
    deltaLop: after.lop - before.lop
  };
}

// T1: Empty → HD = +0.5
{
  const { deltaPaid } = applyEdit([], DATE, null, 'HD');
  assert.equal(deltaPaid, 0.5);
}

// T2: HD → Empty = −0.5
{
  const { deltaPaid } = applyEdit([{ mark_date: DATE, code: 'HD' }], DATE, 'HD', null);
  assert.equal(deltaPaid, -0.5);
}

// T3: P → HD = −0.5
{
  const { deltaPaid } = applyEdit([{ mark_date: DATE, code: 'P' }], DATE, 'P', 'HD');
  assert.equal(deltaPaid, -0.5);
}

// T4: HD → P = +0.5
{
  const { deltaPaid } = applyEdit([{ mark_date: DATE, code: 'HD' }], DATE, 'HD', 'P');
  assert.equal(deltaPaid, 0.5);
}

// T5: Empty → NH = +1.0
{
  const { deltaPaid } = applyEdit([], DATE, null, 'NH');
  assert.equal(deltaPaid, 1);
}

// T6: NH → A = −1.0 paid, +1 LOP
{
  const { deltaPaid, deltaLop } = applyEdit([{ mark_date: DATE, code: 'NH' }], DATE, 'NH', 'A');
  assert.equal(deltaPaid, -1);
  assert.equal(deltaLop, 1);
}

// T7: P → NH = 0 paid change; legend shifts
{
  const before = rowSummary([{ mark_date: DATE, code: 'P' }]);
  const after = rowSummary([{ mark_date: DATE, code: 'NH' }]);
  assert.equal(after.paid_days - before.paid_days, 0);
  assert.equal(before.legend_totals.P, 1);
  assert.equal(after.legend_totals.NH, 1);
  assert.equal(after.legend_totals.P ?? 0, 0);
}

// T8: Two HD edits = +1.0 total
{
  const one = applyEdit([], DATE, null, 'HD');
  const two = applyEdit([{ mark_date: DATE, code: 'HD' }], DATE2, null, 'HD');
  assert.equal(one.deltaPaid + two.deltaPaid, 1);
}

console.log('smoke-attendance-paid-days-delta: ok (T1–T8)');
