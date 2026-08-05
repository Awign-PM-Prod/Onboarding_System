/** Shared filter / dropdown option values for PM client views. */

export const TESTING_FORM_STATUS_OPTIONS = [
  'NOT_SENT',
  'AVAILABLE',
  'PENDING',
  'ROLE_ASSIGNED',
  'FORM_SENT',
  'RESPONDED',
  'REQUEST CORRECTION',
  'PM APPROVED',
  'PL APPROVED',
  'Form Submitted',
];

export const TESTING_JOINING_STATUS_OPTIONS = [
  { value: '__NONE__', label: 'Not set' },
  { value: 'JOINED', label: 'Joined' },
  { value: 'NOT_JOINED', label: 'Not Joined' },
  { value: 'JOINED_OTHER_DATE', label: 'Joined on other date' },
  { value: 'JOINED_ABSCONDED', label: 'Joined and absconded' },
];

export const TESTING_REJECTED_BY_OPTIONS = [
  { value: 'PM', label: 'PM' },
  { value: 'PL', label: 'PL' },
];

export const DIRECTORY_STATUS_OPTIONS = [
  'AVAILABLE',
  'PENDING',
  'ROLE_ASSIGNED',
  'FORM_SENT',
  'Form Submitted',
  'Submitted',
  'SUBMITTED',
  'CORRECTION_REQUESTED',
  'Correction Requested',
  'APPROVED',
  'PM APPROVED',
  'REJECTED',
  'PM Approved',
  'PM Rejected',
  'PENDING_PAYROLL_LEAD',
  'Pending Payroll Review',
  'PAYROLL_APPROVED',
  'PAYROLL_REJECTED',
  'Payroll Approved',
  'Payroll Rejected',
  'PL APPROVED',
  'JOINED',
  'Joined',
  'NOT_JOINED',
  'Not Joined',
  'JOINED_OTHER_DATE',
  'Joined on other date',
  'JOINED_ABSCONDED',
  'Joined and absconded',
];

export const CTC_TYPE_OPTIONS = [
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'ANNUAL', label: 'Annual' },
];

export const PAY_TYPE_OPTIONS = [
  { value: 'CTC', label: 'CTC' },
  { value: 'NET_PAY', label: 'Net Pay' },
];
