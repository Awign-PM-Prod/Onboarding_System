import { describe, expect, it } from 'vitest';
import {
  buildLeaveConfigCsv,
  parseLeaveConfigCsvText
} from './leaveConfigCsv';

describe('parseLeaveConfigCsvText', () => {
  it('parses accrual, fixed, and N/A rows', () => {
    const csv = [
      'state,leave_type,applicable,accrual,fixed_days,accumulation_limit',
      'Maharashtra,earned_privileged,Yes,5/60;18/240,,45',
      'Maharashtra,casual,Yes,,12,',
      'Maharashtra,sick,No,,,'
    ].join('\n');
    const { items, errors } = parseLeaveConfigCsvText(csv);
    expect(errors).toEqual([]);
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({
      state: 'Maharashtra',
      leave_type: 'earned_privileged',
      not_applicable: false,
      accumulation_limit: 45
    });
    expect(items[0].accrual_rules).toEqual([
      { days: 5, per_days_worked: 60 },
      { days: 18, per_days_worked: 240 }
    ]);
    expect(items[1].fixed_days).toBe(12);
    expect(items[2].not_applicable).toBe(true);
  });

  it('rejects invalid state and bad accrual', () => {
    const csv = [
      'state,leave_type,applicable,accrual,fixed_days,accumulation_limit',
      'Narnia,earned_privileged,Yes,5/60,,',
      'Maharashtra,earned_privileged,Yes,five-sixty,,'
    ].join('\n');
    const { items, errors } = parseLeaveConfigCsvText(csv);
    expect(items).toHaveLength(0);
    expect(errors.some((e) => e.includes('invalid state'))).toBe(true);
    expect(errors.some((e) => e.includes('invalid accrual'))).toBe(true);
  });

  it('round-trips through buildLeaveConfigCsv', () => {
    const rows = [{
      state: 'Karnataka',
      leave_type: 'earned_privileged',
      not_applicable: false,
      accrual_rules: [{ days: 5, per_days_worked: 60 }],
      fixed_days: null,
      accumulation_limit: 45
    }];
    const { items, errors } = parseLeaveConfigCsvText(buildLeaveConfigCsv(rows));
    expect(errors).toEqual([]);
    expect(items[0]).toMatchObject({
      state: 'Karnataka',
      leave_type: 'earned_privileged',
      accumulation_limit: 45
    });
  });
});
