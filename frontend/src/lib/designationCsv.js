import Papa from 'papaparse';
import { normalizeCsvHeaderKey } from './clientCsv';
import { normalizeDesignationList, normalizeSkillLevel } from './wageConfig';

const NAME_HEADERS = ['designation', 'designation_name', 'designations', 'name', 'role'];
const SKILL_HEADERS = ['skill_level', 'skill', 'skilllevel', 'skill_type'];
const DEFAULT_SKILL = 'SEMI_SKILLED';

function isBlankRow(cells) {
  return cells.every((c) => String(c ?? '').trim() === '');
}

/**
 * Parse a designations CSV (`designation[,skill_level]`).
 * Throws when the file has no designation column or yields no designations.
 */
export function parseDesignationCsvText(text) {
  const { data, errors } = Papa.parse(String(text ?? ''), { skipEmptyLines: false });
  const fatal = (errors || []).find((e) => e.type === 'Quotes');
  if (fatal) throw new Error(`CSV parse error: ${fatal.message}`);

  const rows = data || [];
  const headerIdx = rows.findIndex((cells) => !isBlankRow(cells));
  if (headerIdx < 0) throw new Error('CSV has no designations.');

  const headers = rows[headerIdx].map((h) => normalizeCsvHeaderKey(h));
  const nameCol = headers.findIndex((h) => NAME_HEADERS.includes(h));
  if (nameCol < 0) {
    throw new Error('CSV must have a "designation" column.');
  }
  const skillCol = headers.findIndex((h) => SKILL_HEADERS.includes(h));

  const byKey = new Map();
  const warnings = [];
  for (let i = headerIdx + 1; i < rows.length; i += 1) {
    const cells = rows[i];
    if (isBlankRow(cells)) continue;
    const name = String(cells[nameCol] ?? '').trim();
    if (!name) continue;
    const rawSkill = skillCol >= 0 ? String(cells[skillCol] ?? '').trim() : '';
    let skill = DEFAULT_SKILL;
    if (rawSkill) {
      const parsed = normalizeSkillLevel(rawSkill, null);
      if (parsed) {
        skill = parsed;
      } else {
        warnings.push(
          `Row ${i + 1}: unknown skill level "${rawSkill}" for ${name}; set to Semi-skilled.`
        );
      }
    }
    const key = name.toLowerCase();
    const prev = byKey.get(key);
    byKey.set(key, { name: prev?.name ?? name, skill_level: skill });
  }

  const designations = [...byKey.values()];
  if (designations.length === 0) throw new Error('CSV has no designations.');
  return { designations, warnings };
}

/** Merge imported designations into existing ones: update skill on name match, append new. */
export function mergeDesignations(existing, imported) {
  const result = normalizeDesignationList(existing).map((d) => ({ ...d }));
  const indexByKey = new Map(result.map((d, i) => [d.name.toLowerCase(), i]));
  let added = 0;
  let updated = 0;
  for (const entry of normalizeDesignationList(imported)) {
    const key = entry.name.toLowerCase();
    const idx = indexByKey.get(key);
    if (idx === undefined) {
      indexByKey.set(key, result.length);
      result.push(entry);
      added += 1;
    } else if (result[idx].skill_level !== entry.skill_level) {
      result[idx] = { ...result[idx], skill_level: entry.skill_level };
      updated += 1;
    }
  }
  return { designations: result, added, updated };
}

export function buildDesignationTemplateCsv() {
  return Papa.unparse({
    fields: ['designation', 'skill_level'],
    data: [
      ['Technician', 'SKILLED'],
      ['Supervisor', 'SEMI_SKILLED'],
      ['Helper', 'UNSKILLED']
    ]
  });
}
