import { describe, expect, it } from 'vitest';
import {
  buildDesignationTemplateCsv,
  mergeDesignations,
  parseDesignationCsvText
} from './designationCsv';

describe('parseDesignationCsvText', () => {
  it('parses designation and skill_level columns', () => {
    const { designations, warnings } = parseDesignationCsvText(
      'designation,skill_level\nTechnician,SKILLED\nSupervisor,Semi-skilled\nHelper,unskilled\n'
    );
    expect(designations).toEqual([
      { name: 'Technician', skill_level: 'SKILLED' },
      { name: 'Supervisor', skill_level: 'SEMI_SKILLED' },
      { name: 'Helper', skill_level: 'UNSKILLED' }
    ]);
    expect(warnings).toEqual([]);
  });

  it('accepts header aliases', () => {
    const { designations } = parseDesignationCsvText('Role,Skill Level\nDriver,SKILLED\n');
    expect(designations).toEqual([{ name: 'Driver', skill_level: 'SKILLED' }]);
  });

  it('allows a designation-only file and defaults skill to semi-skilled', () => {
    const { designations, warnings } = parseDesignationCsvText('designation\nTechnician\nHelper\n');
    expect(designations).toEqual([
      { name: 'Technician', skill_level: 'SEMI_SKILLED' },
      { name: 'Helper', skill_level: 'SEMI_SKILLED' }
    ]);
    expect(warnings).toEqual([]);
  });

  it('defaults unrecognised skill levels and reports a warning', () => {
    const { designations, warnings } = parseDesignationCsvText(
      'designation,skill_level\nTechnician,expert\n'
    );
    expect(designations).toEqual([{ name: 'Technician', skill_level: 'SEMI_SKILLED' }]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/Row 2/);
    expect(warnings[0]).toMatch(/expert/);
  });

  it('skips rows without a designation name', () => {
    const { designations } = parseDesignationCsvText(
      'designation,skill_level\n,SKILLED\nHelper,UNSKILLED\n'
    );
    expect(designations).toEqual([{ name: 'Helper', skill_level: 'UNSKILLED' }]);
  });

  it('dedupes names case-insensitively with the last row winning', () => {
    const { designations } = parseDesignationCsvText(
      'designation,skill_level\nTechnician,UNSKILLED\ntechnician,SKILLED\n'
    );
    expect(designations).toEqual([{ name: 'Technician', skill_level: 'SKILLED' }]);
  });

  it('throws when there is no designation column', () => {
    expect(() => parseDesignationCsvText('foo,bar\n1,2\n')).toThrow(/designation/i);
  });

  it('throws when there are no designations', () => {
    expect(() => parseDesignationCsvText('designation,skill_level\n')).toThrow(/no designations/i);
  });
});

describe('mergeDesignations', () => {
  it('adds new names and updates skill of existing ones, keeping existing spelling', () => {
    const existing = [
      { name: 'Technician', skill_level: 'UNSKILLED' },
      { name: 'Supervisor', skill_level: 'SEMI_SKILLED' }
    ];
    const imported = [
      { name: 'technician', skill_level: 'SKILLED' },
      { name: 'Helper', skill_level: 'UNSKILLED' }
    ];
    expect(mergeDesignations(existing, imported)).toEqual({
      designations: [
        { name: 'Technician', skill_level: 'SKILLED' },
        { name: 'Supervisor', skill_level: 'SEMI_SKILLED' },
        { name: 'Helper', skill_level: 'UNSKILLED' }
      ],
      added: 1,
      updated: 1
    });
  });

  it('does not count unchanged matches as updated', () => {
    const existing = [{ name: 'Technician', skill_level: 'SKILLED' }];
    const result = mergeDesignations(existing, [{ name: 'Technician', skill_level: 'SKILLED' }]);
    expect(result.added).toBe(0);
    expect(result.updated).toBe(0);
  });
});

describe('buildDesignationTemplateCsv', () => {
  it('round-trips through the parser', () => {
    const { designations } = parseDesignationCsvText(buildDesignationTemplateCsv());
    expect(designations.map((d) => d.name)).toEqual(['Technician', 'Supervisor', 'Helper']);
  });
});
