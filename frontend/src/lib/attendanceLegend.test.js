import { describe, expect, it } from 'vitest';
import {
  DUMMY_LEAVE_DISPLAY_ROWS,
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
    expect(formatLeaveSummaryCell('ML', { gender: 'Male' }, 0)).toBe('—');
  });

  it('hides PL for female employees', () => {
    expect(formatLeaveSummaryCell('PL', { gender: 'F' }, 0)).toBe('—');
  });

  it('shows static dummy values for applicable gender', () => {
    expect(formatLeaveSummaryCell('PL', { gender: 'Male' }, 0)).toBe('(0/1)');
    expect(formatLeaveSummaryCell('ML', { gender: 'Female' }, 1)).toBe('(1/1)');
    expect(formatLeaveSummaryCell('NH', { gender: 'Male' }, 0)).toBe('3/3');
    expect(formatLeaveSummaryCell('EL', { gender: 'Female' }, 0)).toBe('(5/15)');
  });

  it('cycles dummy rows by index', () => {
    expect(formatLeaveSummaryCell('EL', { gender: 'Male' }, 0)).toBe(
      DUMMY_LEAVE_DISPLAY_ROWS[0].EL
    );
    expect(formatLeaveSummaryCell('EL', { gender: 'Male' }, 1)).toBe(
      DUMMY_LEAVE_DISPLAY_ROWS[1].EL
    );
  });

  it('provides dummy values for every leave column', () => {
    for (const colKey of LEAVE_SUMMARY_COLUMNS) {
      const value = formatLeaveSummaryCell(colKey, { gender: 'Male' }, 0);
      if (colKey === 'ML') expect(value).toBe('—');
      else expect(value).not.toBe('—');
    }
  });
});
