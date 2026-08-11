/** Wage zones and skill tiers for state CTC floors (keep in sync with frontend/src/lib/wageConfig.js). */

export const WAGE_ZONES = ['zone1', 'zone2', 'zone3'];
export const SKILL_LEVELS = ['SKILLED', 'SEMI_SKILLED', 'UNSKILLED'];

/** @returns {string|null|undefined} zone string, null if empty, undefined if invalid */
export function normalizeWageZone(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const z = String(raw).trim().toLowerCase().replace(/\s+/g, '');
  if (WAGE_ZONES.includes(z)) return z;
  return undefined;
}

export function normalizeSkillLevel(raw, { defaultValue = null } = {}) {
  if (raw === undefined || raw === null || raw === '') return defaultValue;
  const s = String(raw).trim().toUpperCase().replace(/[-\s]+/g, '_');
  if (s === 'SKILLED') return 'SKILLED';
  if (s === 'SEMI_SKILLED' || s === 'SEMISKILLED' || s === 'SEMI') return 'SEMI_SKILLED';
  if (s === 'UNSKILLED') return 'UNSKILLED';
  return undefined;
}

export function designationNameOf(entry) {
  if (entry && typeof entry === 'object') return String(entry.name ?? '').trim();
  return String(entry ?? '').trim();
}

/**
 * Normalize designations input (strings or { name, skill_level }) to
 * [{ name, skill_level }] with case-insensitive name dedupe.
 */
export function normalizedDesignationRows(input) {
  const seen = new Set();
  const out = [];
  if (!Array.isArray(input)) return out;
  for (const raw of input) {
    const name = designationNameOf(raw);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const skillRaw = raw && typeof raw === 'object' ? raw.skill_level : null;
    const skill = normalizeSkillLevel(skillRaw, { defaultValue: 'UNSKILLED' });
    if (skill === undefined) continue;
    out.push({ name, skill_level: skill });
  }
  return out;
}

export function designationNamesFrom(input) {
  return normalizedDesignationRows(input).map((d) => d.name);
}

export const CUSHION_TYPES = ['ABSOLUTE', 'PERCENTAGE'];

/** @returns {'ABSOLUTE'|'PERCENTAGE'|null|undefined} null if empty, undefined if invalid */
export function normalizeCushionType(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const t = String(raw).trim().toUpperCase();
  if (CUSHION_TYPES.includes(t)) return t;
  return undefined;
}

/**
 * Effective CTC floor = min + cushion.
 * Absolute: min + value; Percentage: min + (min * value / 100).
 */
export function applyCushion(minCtc, cushionType, cushionValue) {
  if (minCtc == null) return null;
  const min = Number(minCtc);
  if (!Number.isFinite(min)) return null;
  const type = normalizeCushionType(cushionType);
  if (!type) return min;
  const val = Number(cushionValue);
  if (!Number.isFinite(val) || val < 0) return min;
  if (type === 'ABSOLUTE') return min + val;
  if (type === 'PERCENTAGE') return min + (min * val) / 100;
  return min;
}

/** Parse optional cushion pair from client body; returns { cushion_type, cushion_value } or errors. */
export function parseClientCushion(body) {
  const typeRaw = body?.cushion_type;
  const valueRaw = body?.cushion_value;
  const typeEmpty = typeRaw === undefined || typeRaw === null || String(typeRaw).trim() === '';
  const valueEmpty = valueRaw === undefined || valueRaw === null || valueRaw === '';

  if (typeEmpty && valueEmpty) {
    return { cushion_type: null, cushion_value: null };
  }
  if (typeEmpty || valueEmpty) {
    return { error: 'cushion_type and cushion_value must both be set or both empty' };
  }

  const cushion_type = normalizeCushionType(typeRaw);
  if (!cushion_type) {
    return { error: 'cushion_type must be ABSOLUTE or PERCENTAGE' };
  }

  const cushion_value = Number(valueRaw);
  if (!Number.isFinite(cushion_value) || cushion_value < 0) {
    return { error: 'cushion_value must be a non-negative number' };
  }
  if (cushion_type === 'PERCENTAGE' && cushion_value > 100) {
    return { error: 'cushion_value for PERCENTAGE must be at most 100' };
  }
  if (cushion_type === 'ABSOLUTE' && !Number.isInteger(cushion_value)) {
    return { error: 'cushion_value for ABSOLUTE must be a whole number' };
  }

  return { cushion_type, cushion_value };
}
