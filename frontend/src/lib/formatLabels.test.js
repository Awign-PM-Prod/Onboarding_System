import { describe, expect, it } from 'vitest';
import { DESIGNATION_OPTIONS } from '../components/DesignationsInput.jsx';
import { formatDesignationLabel, formatEmployeeStatusLabel } from './formatLabels.js';
import {
  CTC_TYPE_OPTIONS,
  DIRECTORY_STATUS_OPTIONS,
  TESTING_FORM_STATUS_OPTIONS,
  TESTING_JOINING_STATUS_OPTIONS,
  TESTING_REJECTED_BY_OPTIONS,
} from './pmFilterOptions.js';

const EXPECTED_FORM_STATUS_LABELS = {
  NOT_SENT: 'Not Sent',
  AVAILABLE: 'Available',
  PENDING: 'Pending',
  ROLE_ASSIGNED: 'Role Assigned',
  FORM_SENT: 'Form Sent',
  RESPONDED: 'Responded',
  'REQUEST CORRECTION': 'Request Correction',
  'PM APPROVED': 'PM Approved',
  'PL APPROVED': 'PL Approved',
  'Form Submitted': 'Form Submitted',
};

const EXPECTED_DIRECTORY_STATUS_LABELS = {
  AVAILABLE: 'Available',
  PENDING: 'Pending',
  ROLE_ASSIGNED: 'Role Assigned',
  FORM_SENT: 'Form Sent',
  'Form Submitted': 'Form Submitted',
  Submitted: 'Submitted',
  SUBMITTED: 'Submitted',
  CORRECTION_REQUESTED: 'Correction Requested',
  'Correction Requested': 'Correction Requested',
  APPROVED: 'Approved',
  'PM APPROVED': 'PM Approved',
  REJECTED: 'Rejected',
  'PM Approved': 'PM Approved',
  'PM Rejected': 'PM Rejected',
  PENDING_PAYROLL_LEAD: 'Pending Payroll Review',
  'Pending Payroll Review': 'Pending Payroll Review',
  PAYROLL_APPROVED: 'Payroll Approved',
  'Payroll Approved': 'Payroll Approved',
  PAYROLL_REJECTED: 'Payroll Rejected',
  'Payroll Rejected': 'Payroll Rejected',
  'PL APPROVED': 'PL Approved',
  JOINED: 'Joined',
  Joined: 'Joined',
  NOT_JOINED: 'Not Joined',
  'Not Joined': 'Not Joined',
  JOINED_OTHER_DATE: 'Joined on other date',
  'Joined on other date': 'Joined on other date',
  JOINED_ABSCONDED: 'Joined and absconded',
  'Joined and absconded': 'Joined and absconded',
};

const EXPECTED_DESIGNATION_LABELS = {
  HRManager: 'HR Manager',
  OperationsManager: 'Operations Manager',
  Recruiter: 'Recruiter',
  Accountant: 'Accountant',
  TeamLead: 'Team Lead',
  FieldExecutive: 'Field Executive',
  Engineer: 'Engineer',
  Operator: 'Operator',
  Inspector: 'Inspector',
  Supervisor: 'Supervisor',
  QualityAnalyst: 'Quality Analyst',
  DataEntryOperator: 'Data Entry Operator',
  StoreManager: 'Store Manager',
};

describe('formatEmployeeStatusLabel', () => {
  it('formats every testing form status filter option', () => {
    for (const status of TESTING_FORM_STATUS_OPTIONS) {
      expect(formatEmployeeStatusLabel(status)).toBe(EXPECTED_FORM_STATUS_LABELS[status]);
    }
  });

  it('formats every directory status filter option', () => {
    for (const status of DIRECTORY_STATUS_OPTIONS) {
      expect(formatEmployeeStatusLabel(status)).toBe(EXPECTED_DIRECTORY_STATUS_LABELS[status]);
    }
  });
});

describe('formatDesignationLabel', () => {
  it('formats every predefined designation catalog option', () => {
    for (const designation of DESIGNATION_OPTIONS) {
      expect(formatDesignationLabel(designation)).toBe(EXPECTED_DESIGNATION_LABELS[designation]);
    }
  });
});

describe('dropdown option metadata', () => {
  it('keeps joining status option labels human-readable', () => {
    for (const option of TESTING_JOINING_STATUS_OPTIONS) {
      expect(option.label).toBeTruthy();
      expect(option.label).not.toMatch(/_/);
    }
  });

  it('keeps rejected-by option labels human-readable', () => {
    for (const option of TESTING_REJECTED_BY_OPTIONS) {
      expect(option.label).toBeTruthy();
    }
  });

  it('keeps CTC type option labels human-readable', () => {
    for (const option of CTC_TYPE_OPTIONS) {
      expect(option.label).toBeTruthy();
      expect(option.label).not.toMatch(/_/);
    }
  });
});
