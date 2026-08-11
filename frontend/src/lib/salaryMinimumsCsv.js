import Papa from 'papaparse';
import { INDIAN_STATES } from './indianStates';
import {
  SKILL_LEVELS,
  SKILL_LEVEL_LABELS,
  WAGE_ZONES,
  ZONE_LABELS,
  normalizeSkillLevel,
  normalizeWageZone
} from './wageConfig';

export const SALARY_MINIMUMS_CSV_HEADERS = [
  'state',
  'zone',
  'skilled',
  'semi_skilled',
  'unskilled'
];

const STATE_LOOKUP = new Map(INDIAN_STATES.map((s) => [s.toLowerCase(), s]));

function normalizeStateName(raw) {
  const key = String(raw ?? '').trim().toLowerCase();
  if (!key) return null;
  return STATE_LOOKUP.get(key) ?? null;
}

function isBlank(raw) {
  return raw === undefined || raw === null || String(raw).trim() === '';
}

/** @returns {{ kind: 'empty' } | { kind: 'invalid' } | { kind: 'ok', value: number }} */
function parseAmountField(raw) {
  if (isBlank(raw)) return { kind: 'empty' };
  const n = Number(String(raw).replace(/,/g, '').trim());
  if (!Number.isFinite(n) || n < 0) return { kind: 'invalid' };
  return { kind: 'ok', value: n };
}

function zoneLabelOrKey(zone) {
  return ZONE_LABELS[zone] || zone;
}

/** Build CSV from flat wage-minimum rows (state × zone × skill). */
export function buildSalaryMinimumsCsv(rows, { states } = {}) {
  const allow = states ? new Set(states) : null;
  const byStateZone = new Map();

  for (const r of rows ?? []) {
    if (allow && !allow.has(r.state)) continue;
    const key = `${r.state}|${r.zone}`;
    if (!byStateZone.has(key)) {
      byStateZone.set(key, {
        state: r.state,
        zone: r.zone,
        skilled: '',
        semi_skilled: '',
        unskilled: ''
      });
    }
    const entry = byStateZone.get(key);
    const val =
      r.min_monthly_ctc === null || r.min_monthly_ctc === undefined || r.min_monthly_ctc === ''
        ? ''
        : r.min_monthly_ctc;
    if (r.skill_level === 'SKILLED') entry.skilled = val;
    if (r.skill_level === 'SEMI_SKILLED') entry.semi_skilled = val;
    if (r.skill_level === 'UNSKILLED') entry.unskilled = val;
  }

  const out = [];
  const stateOrder = states ?? INDIAN_STATES;
  for (const state of stateOrder) {
    for (const zone of WAGE_ZONES) {
      const key = `${state}|${zone}`;
      const entry = byStateZone.get(key) || {
        state,
        zone,
        skilled: '',
        semi_skilled: '',
        unskilled: ''
      };
      out.push({
        state: entry.state,
        zone: zoneLabelOrKey(entry.zone),
        skilled: entry.skilled,
        semi_skilled: entry.semi_skilled,
        unskilled: entry.unskilled
      });
    }
  }

  return Papa.unparse({
    fields: SALARY_MINIMUMS_CSV_HEADERS,
    data: out.map((r) => [
      r.state,
      r.zone,
      r.skilled,
      r.semi_skilled,
      r.unskilled
    ])
  });
}

/**
 * Parse salary-minimums CSV.
 * Supports wide format (skilled/semi_skilled/unskilled) and long format (skill_level, min_monthly_ctc).
 * @returns {{ items: Array<{state, zone, skill_level, min_monthly_ctc}>, errors: string[] }}
 */
export function parseSalaryMinimumsCsvText(text) {
  const parsed = Papa.parse(String(text ?? ''), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) =>
      String(h ?? '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_')
  });

  if (parsed.errors?.length) {
    const msg = parsed.errors[0]?.message || 'Could not parse CSV.';
    throw new Error(msg);
  }

  const items = [];
  const errors = [];
  const seen = new Set();

  for (let i = 0; i < (parsed.data ?? []).length; i++) {
    const row = parsed.data[i];
    const line = i + 2;

    const hasLongHeaders =
      Object.prototype.hasOwnProperty.call(row, 'skill_level') ||
      Object.prototype.hasOwnProperty.call(row, 'min_monthly_ctc') ||
      Object.prototype.hasOwnProperty.call(row, 'min_ctc');

    const wideFieldsBlank =
      isBlank(row.skilled) &&
      isBlank(row.semi_skilled ?? row.semi_skilled_) &&
      isBlank(row.unskilled);
    const longFieldsBlank = isBlank(row.skill_level) && isBlank(row.min_monthly_ctc) && isBlank(row.min_ctc);

    // Quietly ignore blank export rows (state/zone present, amounts unset).
    if (isBlank(row.state) && isBlank(row.zone) && wideFieldsBlank && longFieldsBlank) {
      continue;
    }

    const state = normalizeStateName(row.state);
    if (!state) {
      errors.push(`Row ${line}: invalid state "${row.state ?? ''}".`);
      continue;
    }

    const zone = normalizeWageZone(row.zone);
    if (!zone) {
      errors.push(`Row ${line}: invalid zone "${row.zone ?? ''}".`);
      continue;
    }

    if (hasLongHeaders && !isBlank(row.skill_level)) {
      const skill_level = normalizeSkillLevel(row.skill_level, null);
      if (!skill_level || !SKILL_LEVELS.includes(skill_level)) {
        errors.push(`Row ${line}: invalid skill_level "${row.skill_level}".`);
        continue;
      }
      const amountField = parseAmountField(row.min_monthly_ctc ?? row.min_ctc);
      if (amountField.kind === 'empty') {
        // Unset cell — ignore, same as wide-format blanks.
        continue;
      }
      if (amountField.kind === 'invalid') {
        errors.push(`Row ${line}: invalid min_monthly_ctc.`);
        continue;
      }
      const key = `${state}|${zone}|${skill_level}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ state, zone, skill_level, min_monthly_ctc: amountField.value });
      continue;
    }

    const fields = {
      SKILLED: parseAmountField(row.skilled),
      SEMI_SKILLED: parseAmountField(row.semi_skilled ?? row.semi_skilled_),
      UNSKILLED: parseAmountField(row.unskilled)
    };

    for (const skill_level of SKILL_LEVELS) {
      const field = fields[skill_level];
      if (field.kind === 'empty') continue;
      if (field.kind === 'invalid') {
        errors.push(
          `Row ${line}: invalid ${SKILL_LEVEL_LABELS[skill_level]} amount for ${state} / ${ZONE_LABELS[zone]}.`
        );
        continue;
      }
      const key = `${state}|${zone}|${skill_level}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ state, zone, skill_level, min_monthly_ctc: field.value });
    }
    // All skill cells empty → leave existing values alone; not a validation error.
  }

  return { items, errors };
}

/** Group import items into UI summary rows for the Import Summary modal. */
export function buildImportSummary(items) {
  const byState = new Map();

  for (const item of items ?? []) {
    if (!byState.has(item.state)) {
      byState.set(item.state, { state: item.state, zones: new Set(), skills: new Set() });
    }
    const entry = byState.get(item.state);
    entry.zones.add(item.zone);
    entry.skills.add(item.skill_level);
  }

  return [...byState.values()].map((entry) => ({
    state: entry.state,
    zonesUpdated: entry.zones.size,
    skills: SKILL_LEVELS.filter((s) => entry.skills.has(s)).map((s) => SKILL_LEVEL_LABELS[s])
  }));
}
