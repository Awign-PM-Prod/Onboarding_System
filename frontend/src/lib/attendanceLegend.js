/** Shared attendance legend constants for frontend */

import { annualLeaveAllowanceFromPolicy } from './clientPolicy.js';

export const LEGEND_CODES = [
  'P', 'W', 'NH', 'FH', 'P-NH', 'P-FH', 'HD',
  'EL', 'SL', 'CL', 'PL', 'ML', 'RH', 'CO',
  'A', 'AB', 'R', 'T', '-'
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
  AB: 'Abscond',
  R: 'Resigned',
  T: 'Termination',
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
  { code: 'AB', label: 'AB' },
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

export function normalizeAttendanceGender(gender) {
  const value = String(gender ?? '').trim().toUpperCase();
  if (value === 'M' || value === 'MALE') return 'male';
  if (value === 'F' || value === 'FEMALE') return 'female';
  return 'unknown';
}

/**
 * Format leave summary from computed row.leave_summary.
 * ML hidden for males; PL hidden for females.
 * When policyAllowance is passed, annual totals come from the policy form.
 */
export function formatLeaveSummaryCell(colKey, row, policyAllowance = null) {
  const gender = normalizeAttendanceGender(row?.gender);

  if (colKey === 'ML' && gender === 'male') return '—';
  if (colKey === 'PL' && gender === 'female') return '—';

  const ls = row?.leave_summary ?? {};
  const takenKey = `${colKey}_taken`;
  const leftKey = `${colKey}_left`;
  const annualKey = `${colKey}_annual`;
  if (ls[`${colKey}_not_applicable`]) return 'N/A';
  const taken = ls[takenKey];
  const left = ls[leftKey];
  const annualFromSummary = ls[annualKey];
  const annualFromPolicy = policyAllowance
    ? annualLeaveAllowanceFromPolicy(policyAllowance, colKey)
    : null;
  const annual =
    annualFromPolicy != null ? annualFromPolicy : annualFromSummary;

  if (colKey === 'NH' || colKey === 'FH') {
    const allowed = ls[`${colKey}_allowed`];
    if (allowed != null && taken != null) {
      return `${taken}/${allowed}`;
    }
    if (left != null && taken != null) {
      return `${taken}/${Number(taken) + Number(left)}`;
    }
    return '—';
  }

  if (annual != null) {
    return `(${taken ?? 0}/${annual})`;
  }

  if (taken == null && left == null) return '—';
  const total = Number(taken ?? 0) + Number(left ?? 0);
  return `(${taken ?? 0}/${total})`;
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
  if (c === 'AB') return 'bg-red-100 text-red-800 font-semibold';
  if (c === 'R') return 'bg-amber-100 text-amber-900 font-medium';
  if (c === 'T') return 'bg-rose-100 text-rose-900 font-medium';
  if (c === '-') return 'bg-slate-100 text-slate-500';
  return 'bg-white text-slate-800';
}

export function displayCode(code) {
  const c = String(code ?? '').toUpperCase();
  if (c === 'A') return 'A';
  return c || '-';
}

/** Count occurrences of each legend code in day marks (draft preview). */
export function computeLegendTotals(codes) {
  const totals = Object.fromEntries(LEGEND_TOTAL_COLUMNS.map((col) => [col.code, 0]));
  for (const raw of codes ?? []) {
    const c = String(raw ?? '').trim().toUpperCase();
    if (c && Object.prototype.hasOwnProperty.call(totals, c)) {
      totals[c] += 1;
    }
  }
  return totals;
}
