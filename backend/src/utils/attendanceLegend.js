/** Attendance day codes and display labels (OC removed; use NH/FH). */

export const LEGEND_CODES = [
  'P',
  'W',
  'NH',
  'FH',
  'HD',
  'EL',
  'SL',
  'CL',
  'PL',
  'ML',
  'RH',
  'CO',
  'A',
  'R',
  'T',
  '-'
];

export const LEGEND_LABELS = {
  P: 'Present',
  W: 'Week off',
  NH: 'National Holiday',
  FH: 'Festival Holiday',
  HD: 'Half day',
  EL: 'Earned Leave',
  SL: 'Sick Leave',
  CL: 'Casual Leave',
  PL: 'Privilege Leave',
  ML: 'Maternity Leave',
  RH: 'Restricted Holiday',
  CO: 'Comp Off',
  A: 'Absent LOP',
  R: 'Not considered',
  T: 'Not considered',
  '-': 'Not considered'
};

export const LEGEND_STYLE_FAMILY = {
  P: 'paid',
  W: 'paid',
  NH: 'holiday',
  FH: 'holiday',
  HD: 'half',
  EL: 'leave',
  SL: 'leave',
  CL: 'leave',
  PL: 'leave',
  ML: 'leave',
  RH: 'leave',
  CO: 'leave',
  A: 'lop',
  R: 'muted',
  T: 'muted',
  '-': 'muted'
};

const VALID_SET = new Set(LEGEND_CODES);

export function normalizeAttendanceCode(raw) {
  const s = String(raw ?? '').trim().toUpperCase();
  if (!s) return null;
  if (s === 'OC') return null; // legacy — reject
  if (VALID_SET.has(s)) return s;
  // allow lowercase dash already handled; empty dash variants
  if (s === '—' || s === '–') return '-';
  return null;
}

export function isValidAttendanceCode(code) {
  return VALID_SET.has(String(code ?? '').trim().toUpperCase());
}

export function emptyLegendTotals() {
  const out = {};
  for (const code of LEGEND_CODES) out[code] = 0;
  return out;
}

/** Count occurrences of each legend code in a list of day mark codes. */
export function computeLegendTotals(codes) {
  const totals = emptyLegendTotals();
  for (const raw of codes ?? []) {
    const code = normalizeAttendanceCode(raw) ?? String(raw ?? '').trim().toUpperCase();
    if (code && Object.prototype.hasOwnProperty.call(totals, code)) {
      totals[code] += 1;
    }
  }
  return totals;
}
