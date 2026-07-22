/** Shared employee / form status badge helpers */

export { formatEmployeeStatusLabel } from './formatLabels';

export function isPmApprovedReview(row) {
  return String(row?.form_review_status ?? '').trim().toUpperCase() === 'APPROVED';
}

export function isPlApprovedReview(row) {
  return String(row?.form_payroll_review_status ?? '').trim().toUpperCase() === 'PAYROLL_APPROVED';
}

export function isPlRejectedReview(row) {
  return String(row?.form_payroll_review_status ?? '').trim().toUpperCase() === 'PAYROLL_REJECTED';
}

/**
 * Prefer review-derived labels (PM/PL approved) over raw onboarding_status when present.
 */
export function resolveEmployeeStatusLabel(row, {
  forceNotSent = false,
  missingRoleDetails = false,
  showRespondedForSubmittedForms = false,
  showRequestCorrectionForReview = false,
  statusForRow = null,
} = {}) {
  if (forceNotSent && missingRoleDetails) return 'NOT_SENT';

  if (typeof statusForRow === 'function') {
    const custom = String(statusForRow(row) ?? '').trim();
    if (custom) return custom;
  }

  if (isPlApprovedReview(row)) return 'PL APPROVED';
  if (isPlRejectedReview(row) && isPmApprovedReview(row)) return 'PL REJECTED';
  if (
    showRequestCorrectionForReview &&
    String(row?.form_review_status ?? '').trim().toUpperCase() === 'CORRECTION_REQUESTED'
  ) {
    return 'REQUEST CORRECTION';
  }
  if (isPmApprovedReview(row)) return 'PM APPROVED';
  if (String(row?.form_review_status ?? '').trim().toUpperCase() === 'REJECTED') {
    return 'PM REJECTED';
  }
  if (
    showRespondedForSubmittedForms &&
    String(row?.form_submission_status ?? '').trim() === 'Submitted'
  ) {
    return 'RESPONDED';
  }

  return String(row?.onboarding_status ?? '').trim() || '-';
}

/** Tailwind classes for status pills (matches product badges). */
export function employeeStatusBadgeClass(statusLabel, { onboardingInitiated = false } = {}) {
  const label = String(statusLabel ?? '').trim().toUpperCase();
  const base = 'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap';

  if (label === 'NOT_SENT') return `${base} bg-[#F4F5F6] text-slate-700`;
  if (label === 'FORM_SENT') return `${base} bg-indigo-50 text-indigo-700`;
  if (label === 'RESPONDED') return `${base} bg-[#EDF7FC] text-[#1891CD]`;
  if (label === 'REQUEST CORRECTION') return `${base} bg-orange-50 text-orange-700`;
  if (label === 'PM APPROVED') return `${base} bg-[#E6F4EA] text-[#137333]`;
  if (label === 'PL APPROVED') return `${base} bg-emerald-700 text-emerald-50`;
  if (label === 'PL REJECTED') return `${base} bg-red-800 text-white`;
  if (label === 'PM REJECTED') return `${base} bg-red-50 text-red-700`;
  if (onboardingInitiated) return `${base} bg-emerald-50 text-emerald-700`;
  return `${base} bg-amber-50 text-amber-700`;
}
