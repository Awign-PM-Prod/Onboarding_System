import { describe, it, expect } from 'vitest';
import { previewRowSummary } from './attendanceRowSummary.js';

const policyBundle = {
  attendance_policy: {
    payroll_cycle_start_day: 1,
    payroll_cycle_end_day: 31,
    week_off_config: { presets: ['sat_sun'], weekdays: [] },
    comp_off_applicable: false,
    nh_comp_off_applicable: false,
    fh_comp_off_applicable: false,
    incentive_applicable: false,
    incentive_min_days: 26,
    incentive_value: 0
  },
  leave_allowances: [],
  holidays: []
};

const baseRow = {
  designation: 'Engineer',
  gender: 'M',
  doj: '2026-04-01',
  lwd: null,
  day_marks: [{ mark_date: '2026-04-10', code: 'P' }],
  leave_summary: {},
  legend_totals: { P: 1 }
};

describe('previewRowSummary', () => {
  it('decreases paid_days by 0.5 when P becomes HD', () => {
    const before = previewRowSummary(baseRow, policyBundle, '2026-04');
    const after = previewRowSummary(
      { ...baseRow, day_marks: [{ mark_date: '2026-04-10', code: 'HD' }] },
      policyBundle,
      '2026-04'
    );
    expect(before.paid_days).toBe(1);
    expect(after.paid_days).toBe(0.5);
    expect(after.legend_totals.HD).toBe(1);
  });

  it('does not count paid days after LWD', () => {
    const after = previewRowSummary(
      {
        ...baseRow,
        lwd: '2026-04-10',
        day_marks: [
          { mark_date: '2026-04-10', code: 'T' },
          { mark_date: '2026-04-11', code: 'P' }
        ]
      },
      policyBundle,
      '2026-04'
    );
    expect(after.paid_days).toBe(0);
    expect(after.not_considered).toBeGreaterThan(0);
  });
});
