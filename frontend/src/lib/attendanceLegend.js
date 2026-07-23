/** Shared attendance legend constants for frontend */

export const LEGEND_CODES = [
  'P', 'W', 'NH', 'FH', 'P-NH', 'P-FH', 'HD',
  'EL', 'SL', 'CL', 'PL', 'ML', 'RH', 'CO',
  'A', 'R', 'T', '-'
];

export const LEGEND_LABELS = {
  P: 'Present',
  W: 'Week off',
  NH: 'National Holiday',
  FH: 'Festival Holiday',
  'P-NH': 'Present on National Holiday',
  'P-FH': 'Present on Festive Holiday',
  HD: 'Half day',
  EL: 'EL',
  SL: 'SL',
  CL: 'CL',
  PL: 'PL',
  ML: 'ML',
  RH: 'RH',
  CO: 'CO',
  A: 'Absent LOP',
  R: 'NC',
  T: 'NC',
  '-': 'NC'
};

export const LEGEND_TOTAL_COLUMNS = [
  { code: 'P', label: 'P' },
  { code: 'W', label: 'W' },
  { code: 'NH', label: 'NH' },
  { code: 'FH', label: 'FH' },
  { code: 'P-NH', label: 'P-NH' },
  { code: 'P-FH', label: 'P-FH' },
  { code: 'HD', label: 'HD' },
  { code: 'EL', label: 'EL' },
  { code: 'SL', label: 'SL' },
  { code: 'CL', label: 'CL' },
  { code: 'PL', label: 'PL' },
  { code: 'ML', label: 'ML' },
  { code: 'RH', label: 'RH' },
  { code: 'CO', label: 'CO' },
  { code: 'A', label: 'Absent LOP' },
  { code: 'R', label: 'R' },
  { code: 'T', label: 'T' },
  { code: '-', label: '-' }
];

/** Leave balance columns shown after Not Considered in the attendance grid. */
export const LEAVE_SUMMARY_COLUMNS = [
  'EL',
  'CL',
  'SL',
  'NH',
  'FH',
  'CO',
  'RH',
  'ML',
  'PL',
];

/**
 * Static demo leave values (no calculation). Cycles by row index.
 * NH/FH use plain x/y; other types use (taken/total).
 */
export const DUMMY_LEAVE_DISPLAY_ROWS = [
  {
    EL: '(5/15)',
    CL: '(2/12)',
    SL: '(3/10)',
    NH: '3/3',
    FH: '5/5',
    CO: '(1/2)',
    RH: '(2/2)',
    ML: '(0/1)',
    PL: '(0/1)',
  },
  {
    EL: '(8/15)',
    CL: '(5/12)',
    SL: '(2/10)',
    NH: '3/3',
    FH: '4/5',
    CO: '(0/2)',
    RH: '(1/2)',
    ML: '(1/1)',
    PL: '(0/1)',
  },
  {
    EL: '(3/15)',
    CL: '(1/12)',
    SL: '(4/10)',
    NH: '3/3',
    FH: '5/5',
    CO: '(1/2)',
    RH: '(2/2)',
    ML: '(0/1)',
    PL: '(1/1)',
  },
  {
    EL: '(6/15)',
    CL: '(3/12)',
    SL: '(1/10)',
    NH: '3/3',
    FH: '4/5',
    CO: '(0/2)',
    RH: '(1/2)',
    ML: '(1/1)',
    PL: '(0/1)',
  },
];

export function normalizeAttendanceGender(gender) {
  const value = String(gender ?? '').trim().toUpperCase();
  if (value === 'M' || value === 'MALE') return 'male';
  if (value === 'F' || value === 'FEMALE') return 'female';
  return 'unknown';
}

/**
 * Display static dummy leave values. ML hidden for males; PL hidden for females.
 * No values are derived from day marks or leave_summary.
 */
export function formatLeaveSummaryCell(colKey, row, rowIndex = 0) {
  const gender = normalizeAttendanceGender(row?.gender);

  if (colKey === 'ML' && gender === 'male') return '—';
  if (colKey === 'PL' && gender === 'female') return '—';

  const template =
    DUMMY_LEAVE_DISPLAY_ROWS[Math.abs(Number(rowIndex) || 0) % DUMMY_LEAVE_DISPLAY_ROWS.length];
  return template[colKey] ?? '—';
}

export function isPresentOnHolidayCode(code) {
  const c = String(code ?? '').toUpperCase();
  return c === 'P-NH' || c === 'P-FH';
}

/** Bottom-left corner flag color for present-on-holiday cells. */
export function holidayFlagBorderClass(code) {
  const c = String(code ?? '').toUpperCase();
  if (c === 'P-NH') return 'border-b-red-600 border-r-transparent';
  if (c === 'P-FH') return 'border-b-orange-500 border-r-transparent';
  return 'border-b-red-600 border-r-transparent';
}

export function codeCellClass(code) {
  const c = String(code ?? '').toUpperCase();
  if (c === 'A') return 'bg-red-100 text-red-800 font-semibold';
  // Present on holiday — dashed chip; NH family = sky, FH family = orange
  if (c === 'P-NH') {
    return 'bg-white text-sky-950 font-semibold border border-dashed border-sky-400';
  }
  if (c === 'P-FH') {
    return 'bg-white text-orange-950 font-semibold border border-dashed border-orange-400';
  }
  // Holiday off days — solid fills, clearly distinct hues
  if (c === 'NH') return 'bg-sky-100 text-sky-900 font-medium';
  if (c === 'FH') return 'bg-orange-100 text-orange-900 font-medium';
  if (c === 'HD') return 'bg-amber-100 text-amber-900';
  if (['EL', 'SL', 'CL', 'PL', 'ML', 'RH', 'CO'].includes(c)) return 'bg-violet-100 text-violet-900';
  if (c === 'P' || c === 'W') return 'bg-emerald-50 text-emerald-900';
  if (c === 'R' || c === 'T' || c === '-') return 'bg-slate-100 text-slate-500';
  return 'bg-white text-slate-800';
}

export function displayCode(code) {
  const c = String(code ?? '').toUpperCase();
  if (c === 'A') return 'A';
  return c || '-';
}
