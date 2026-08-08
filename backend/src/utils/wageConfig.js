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
