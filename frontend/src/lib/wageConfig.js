/** Wage zones and skill tiers (keep in sync with backend/src/utils/wageConfig.js). */

export const WAGE_ZONES = ['zone1', 'zone2', 'zone3'];
export const SKILL_LEVELS = ['SKILLED', 'SEMI_SKILLED', 'UNSKILLED'];

export const SKILL_LEVEL_LABELS = {
  SKILLED: 'Skilled',
  SEMI_SKILLED: 'Semi-skilled',
  UNSKILLED: 'Unskilled'
};

export const ZONE_LABELS = {
  zone1: 'Zone 1',
  zone2: 'Zone 2',
  zone3: 'Zone 3'
};

export function normalizeWageZone(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const z = String(raw).trim().toLowerCase().replace(/\s+/g, '');
  return WAGE_ZONES.includes(z) ? z : null;
}

/** Trim and collapse whitespace; null if empty. */
export function normalizeRegionName(raw) {
  if (raw === undefined || raw === null) return null;
  const r = String(raw).trim().replace(/\s+/g, ' ');
  return r || null;
}

export function normalizeSkillLevel(raw, defaultValue = 'UNSKILLED') {
  if (raw === undefined || raw === null || raw === '') return defaultValue;
  const s = String(raw).trim().toUpperCase().replace(/[-\s]+/g, '_');
  if (s === 'SKILLED') return 'SKILLED';
  if (s === 'SEMI_SKILLED' || s === 'SEMISKILLED' || s === 'SEMI') return 'SEMI_SKILLED';
  if (s === 'UNSKILLED') return 'UNSKILLED';
  return defaultValue;
}

export function designationNameOf(entry) {
  if (entry && typeof entry === 'object') return String(entry.name ?? '').trim();
  return String(entry ?? '').trim();
}

export function normalizeDesignationEntry(entry, defaultSkill = 'UNSKILLED') {
  const name = designationNameOf(entry);
  if (!name) return null;
  const skill =
    entry && typeof entry === 'object'
      ? normalizeSkillLevel(entry.skill_level, defaultSkill)
      : defaultSkill;
  return { name, skill_level: skill };
}

export function normalizeDesignationList(list) {
  const seen = new Set();
  const out = [];
  for (const raw of list ?? []) {
    const entry = normalizeDesignationEntry(raw);
    if (!entry) continue;
    const key = entry.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
  }
  return out;
}

export function designationNamesFrom(list) {
  return normalizeDesignationList(list).map((d) => d.name);
}

export const CUSHION_TYPES = ['ABSOLUTE', 'PERCENTAGE'];

export const CUSHION_TYPE_LABELS = {
  ABSOLUTE: 'Absolute (₹)',
  PERCENTAGE: 'Percentage (%)'
};

export function normalizeCushionType(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const t = String(raw).trim().toUpperCase();
  return CUSHION_TYPES.includes(t) ? t : null;
}

/** Effective CTC floor = min + cushion (absolute ₹ or % of min). */
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
