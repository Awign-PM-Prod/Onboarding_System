import { describe, expect, it } from 'vitest';
import {
  LEAVE_SUMMARY_COLUMNS,
  formatLeaveSummaryCell,
  normalizeAttendanceGender,
} from './attendanceLegend.js';

describe('normalizeAttendanceGender', () => {
  it('recognizes male and female variants', () => {
    expect(normalizeAttendanceGender('M')).toBe('male');
    expect(normalizeAttendanceGender('Male')).toBe('male');
    expect(normalizeAttendanceGender('F')).toBe('female');
    expect(normalizeAttendanceGender('Female')).toBe('female');
    expect(normalizeAttendanceGender('')).toBe('unknown');
  });
});

describe('formatLeaveSummaryCell', () => {
  it('hides ML for male employees', () => {
    expect(formatLeaveSummaryCell('ML', { gender: 'Male', leave_summary: { ML_taken: 0, ML_left: 1 } })).toBe('—');
  });

  it('hides PL for female employees', () => {
    expect(formatLeaveSummaryCell('PL', { gender: 'F', leave_summary: { PL_taken: 0, PL_left: 1 } })).toBe('—');
  });

  it('uses policy form allowance for annual total when provided', () => {
    expect(formatLeaveSummaryCell(
      'EL',
      { gender: 'Male', leave_summary: { EL_taken: 2, EL_left: 16, EL_annual: 18 } },
      { designation: 'Executive', earned_days: 20, sick_days: 6, paid_days: 12, maternity_days: 15, paternity_days: 15 }
    )).toBe('(2/20)');
  });

  it('uses leave_summary annual when policy allowance not passed', () => {
    expect(formatLeaveSummaryCell('SL', {
      gender: 'Male',
      leave_summary: { SL_taken: 1, SL_left: 5, SL_annual: 6 }
    })).toBe('(1/6)');
  });

  it('shows taken/total for leave types', () => {
    expect(formatLeaveSummaryCell('EL', {
      gender: 'Male',
      leave_summary: { EL_taken: 5, EL_left: 10 }
    })).toBe('(5/15)');
  });

  it('shows NH/FH as taken/allowed', () => {
    expect(formatLeaveSummaryCell('NH', {
      gender: 'Male',
      leave_summary: { NH_taken: 2, NH_allowed: 3 }
    })).toBe('2/3');
  });

  it('returns dash when no leave summary', () => {
    expect(formatLeaveSummaryCell('EL', { gender: 'Male' })).toBe('—');
  });

  it('provides values for every leave column when summary present', () => {
    const row = {
      gender: 'Male',
      leave_summary: {
        EL_taken: 1, EL_left: 14,
        CL_taken: 0, CL_left: 12,
        SL_taken: 0, SL_left: 10,
        NH_taken: 1, NH_allowed: 3,
        FH_taken: 0, FH_allowed: 5,
        CO_taken: 0, CO_left: 2,
        RH_taken: 0, RH_left: 2,
        PL_taken: 0, PL_left: 1
      }
    };
    for (const colKey of LEAVE_SUMMARY_COLUMNS) {
      const value = formatLeaveSummaryCell(colKey, row);
      if (colKey === 'ML') expect(value).toBe('—');
      else expect(value).not.toBe('—');
    }
  });
});
