import { describe, expect, it } from 'vitest';
import {
  applyLwdToDayMarks,
  exitCodeFromStatus,
  formatLwdSkipMessage,
  isAfterLwd,
  isExitCode,
  isLwdBeforeSheetMonth,
  isLwdDate,
  isLwdInMonth,
  normalizeExitCode,
  statusFromExitCode
} from './attendanceLwd.js';

describe('attendance LWD helpers', () => {
  it('maps AB/R/T to Abscond/Resigned/Termination', () => {
    expect(statusFromExitCode('AB')).toBe('Abscond');
    expect(statusFromExitCode('R')).toBe('Resigned');
    expect(statusFromExitCode('T')).toBe('Termination');
    expect(exitCodeFromStatus('Abscond')).toBe('AB');
    expect(normalizeExitCode('absconded')).toBe('AB');
    expect(normalizeExitCode('terminated')).toBe('T');
    expect(isExitCode('AB')).toBe(true);
    expect(isExitCode('P')).toBe(false);
  });

  it('scopes LWD to the declaration month', () => {
    expect(isLwdInMonth('2026-04-15', '2026-04')).toBe(true);
    expect(isLwdInMonth('2026-04-15', '2026-05-01')).toBe(false);
    expect(isLwdBeforeSheetMonth('2026-04-15', '2026-05-01')).toBe(true);
    expect(isLwdBeforeSheetMonth('2026-04-15', '2026-04')).toBe(false);
    expect(isAfterLwd('2026-04-16', '2026-04-15')).toBe(true);
    expect(isLwdDate('2026-04-15', '2026-04-15')).toBe(true);
  });

  it('excludes July LWD from August and later sheets', () => {
    expect(isLwdBeforeSheetMonth('2026-07-20', '2026-08')).toBe(true);
    expect(isLwdBeforeSheetMonth('2026-07-31', '2026-08-01')).toBe(true);
    expect(isLwdBeforeSheetMonth('2026-08-01', '2026-08')).toBe(false);
    expect(isLwdBeforeSheetMonth('2026-07-20', '2026-07')).toBe(false);
  });

  it('keeps marks on/before LWD and sets the exit code on LWD day', () => {
    const marks = [
      { mark_date: '2026-04-01', code: 'P' },
      { mark_date: '2026-04-15', code: 'P' },
      { mark_date: '2026-04-16', code: 'W' },
      { mark_date: '2026-04-20', code: 'NH' }
    ];
    const next = applyLwdToDayMarks(marks, '2026-04-15', 'T');
    expect(next.map((m) => `${m.mark_date}:${m.code}`)).toEqual([
      '2026-04-01:P',
      '2026-04-15:T'
    ]);
  });

  it('formats the later-month skip warning', () => {
    expect(formatLwdSkipMessage('2026-04-15', 'Termination')).toBe(
      'Last working date 15 Apr 2026 (Termination) — not included after LWD month'
    );
  });
});
