/** Human-readable labels for stored enum / camelCase values. */

export function formatDesignationLabel(name) {
  const value = String(name ?? '').trim();
  if (!value) return value;
  return value
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-z\d])([A-Z])/g, '$1 $2');
}

export function formatContractDate(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

const EMPLOYEE_STATUS_LABELS = {
  NOT_SENT: 'Not Sent',
  FORM_SENT: 'Form Sent',
  RESPONDED: 'Responded',
  AVAILABLE: 'Available',
  PENDING: 'Pending',
  ROLE_ASSIGNED: 'Role Assigned',
  'REQUEST CORRECTION': 'Correction Mail Sent',
  'PM APPROVED': 'PM Approved',
  'SUPERADMIN APPROVED': 'Superadmin Approved',
  'PL APPROVED': 'PL Approved',
  'PL REJECTED': 'PL Rejected',
  'PM REJECTED': 'PM Rejected',
  'FORM SUBMITTED': 'Form Submitted',
  SUBMITTED: 'Submitted',
  CORRECTION_REQUESTED: 'Correction Mail Sent',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  PENDING_PAYROLL_LEAD: 'Pending Payroll Review',
  PAYROLL_APPROVED: 'Payroll Approved',
  PAYROLL_REJECTED: 'Payroll Rejected',
  JOINED: 'Joined',
  NOT_JOINED: 'Not Joined',
  JOINED_OTHER_DATE: 'Joined on other date',
  JOINED_ABSCONDED: 'Joined and absconded',
};

export function formatEmployeeStatusLabel(label) {
  const raw = String(label ?? '').trim();
  if (!raw || raw === '-') return raw || '-';

  const mapped = EMPLOYEE_STATUS_LABELS[raw.toUpperCase()];
  if (mapped) return mapped;

  return raw;
}
