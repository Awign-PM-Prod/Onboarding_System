/** Helpers for controlled numeric fields — avoid leading zeros while typing. */

export function displayNumericValue(value) {
  return value === '' || value == null ? '' : value;
}

/** Strip invalid chars; for integers remove leading zeros (except lone "0"). */
export function sanitizeNumericText(raw, { integer = false } = {}) {
  const s = String(raw ?? '');
  if (s === '') return '';

  if (integer) {
    if (!/^\d*$/.test(s)) return null;
    if (s.length > 1 && s.startsWith('0')) return String(parseInt(s, 10));
    return s;
  }

  if (!/^\d*\.?\d*$/.test(s)) return null;
  if (s.startsWith('.')) return `0${s}`;
  return s;
}

export function parseNumericInput(raw, { min, max, integer = false } = {}) {
  const s = String(raw ?? '').trim();
  if (s === '' || s === '.') return '';
  const n = integer ? parseInt(s, 10) : Number(s);
  if (!Number.isFinite(n)) return '';
  if (min != null && n < min) return '';
  if (max != null && n > max) return '';
  return n;
}

export function normalizeNumericOnBlur(value, fallback = 0) {
  return value === '' || value == null ? fallback : value;
}
