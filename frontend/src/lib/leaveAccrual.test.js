import { describe, expect, it } from 'vitest';
import { computeRowSummary } from '@obs/backend/utils/attendanceCalculator.js';
import {
  computeAccruedDays,
  resolveAnnualEntitlement
} from '@obs/backend/utils/leaveConfigCore.js';
import { formatLeaveSummaryCell } from './attendanceLegend';

const clauses = [
  { days: 5, per_days_worked: 60 },
  { days: 18, per_days_worked: 240 }
];

describe('computeAccruedDays', () => {
  it('returns 0 below the first slab', () => {
    expect(computeAccruedDays(59, clauses)).toBe(0);
  });

  it('returns 5 at 60 days worked', () => {
    expect(computeAccruedDays(60, clauses)).toBe(5);
  });

  it('takes the max of clauses at 240 days (20, not 18 stacked)', () => {
    expect(computeAccruedDays(240, clauses)).toBe(20);
  });
});

describe('resolveAnnualEntitlement', () => {
  it('falls back to designation allowance when no rule', () => {
    expect(resolveAnnualEntitlement({ fallbackAnnual: 18 }).annual).toBe(18);
    expect(resolveAnnualEntitlement({ fallbackAnnual: 18 }).source).toBe('designation');
  });

  it('returns N/A with zero annual', () => {
    const result = resolveAnnualEntitlement({
      rule: { not_applicable: true },
      daysWorked: 240
    });
    expect(result.annual).toBe(0);
    expect(result.not_applicable).toBe(true);
  });

  it('caps accrual plus carry-in at accumulation limit', () => {
    const result = resolveAnnualEntitlement({
      rule: { accrual_rules: clauses, accumulation_limit: 22 },
      daysWorked: 240,
      carryIn: 10
    });
    expect(result.accrued).toBe(20);
    expect(result.annual).toBe(22);
  });
});

describe('computeRowSummary leave rules', () => {
  const policyBundle = {
    attendance_policy: {
      payroll_cycle_start_day: 1,
      payroll_cycle_end_day: 31,
      week_off_config: { presets: [], weekdays: [] },
      comp_off_applicable: false,
      incentive_applicable: false
    },
    leave_allowances: [{
      designation: 'Engineer',
      earned_days: 18,
      sick_days: 6,
      paid_days: 12,
      maternity_days: 180,
      paternity_days: 15
    }],
    holidays: [],
    leave_rules: [{
      state: 'Maharashtra',
      leave_type: 'earned_privileged',
      not_applicable: false,
      accrual_rules: clauses,
      accumulation_limit: 45
    }]
  };

  const marks = Array.from({ length: 60 }, (_, i) => ({
    mark_date: `2026-04-${String(i + 1).padStart(2, '0')}`,
    code: 'P'
  })).filter((m) => m.mark_date <= '2026-04-30');

  it('uses state accrual for EL when employee state matches', () => {
    const summary = computeRowSummary({
      dayMarks: marks,
      policyBundle,
      employee: { designation: 'Engineer', state: 'Maharashtra', doj: '2026-01-01' },
      monthYm: '2026-04',
      ytdDaysWorked: 30
    });
    // 30 prior + ~30 April presents ≈ 60 → 5 EL
    expect(summary.leave_summary.EL_annual).toBe(5);
    expect(summary.leave_summary.EL_not_applicable).toBe(false);
  });

  it('falls back to designation earned_days when state has no rule', () => {
    const summary = computeRowSummary({
      dayMarks: marks,
      policyBundle,
      employee: { designation: 'Engineer', state: 'Karnataka', doj: '2026-01-01' },
      monthYm: '2026-04'
    });
    expect(summary.leave_summary.EL_annual).toBe(18);
  });

  it('marks N/A leave types in leave_summary', () => {
    const summary = computeRowSummary({
      dayMarks: marks,
      policyBundle: {
        ...policyBundle,
        leave_rules: [{
          state: 'Maharashtra',
          leave_type: 'sick',
          not_applicable: true,
          accrual_rules: []
        }]
      },
      employee: { designation: 'Engineer', state: 'Maharashtra', doj: '2026-01-01' },
      monthYm: '2026-04'
    });
    expect(summary.leave_summary.SL_not_applicable).toBe(true);
    expect(summary.leave_summary.SL_annual).toBe(0);
    expect(formatLeaveSummaryCell('SL', {
      gender: 'Male',
      leave_summary: summary.leave_summary
    })).toBe('N/A');
  });
});
