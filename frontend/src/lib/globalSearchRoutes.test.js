import { describe, expect, it } from 'vitest';
import { clientUrlForRole, employeeUrlForRole } from './globalSearchRoutes';

const emp = (overrides = {}) => ({ id: 'e1', client_id: 'c1', ...overrides });

describe('clientUrlForRole', () => {
  it('routes each role to its client dashboard', () => {
    expect(clientUrlForRole('PROGRAM_MANAGER', 'c1')).toBe('/pm-dashboard/client/c1/dashboard');
    expect(clientUrlForRole('SUPER_ADMIN', 'c1')).toBe('/super-admin/client/c1/dashboard');
    expect(clientUrlForRole('PAYROLL_LEAD', 'c1')).toBe('/dashboard/client/c1/dashboard');
  });
});

describe('employeeUrlForRole', () => {
  it('sends PM and Super Admin to the onboarding in-progress list', () => {
    expect(employeeUrlForRole('PROGRAM_MANAGER', emp())).toBe('/pm-dashboard/client/c1/in-progress?employee=e1');
    expect(employeeUrlForRole('SUPER_ADMIN', emp())).toBe(
      '/super-admin/client/c1/onboarding/in-progress?employee=e1'
    );
  });

  it('sends Payroll Lead to the page matching the employee stage', () => {
    const pmApproved = { form_review_status: 'APPROVED' };
    expect(
      employeeUrlForRole('PAYROLL_LEAD', emp({ ...pmApproved, form_payroll_review_status: 'PENDING_PAYROLL_LEAD' }))
    ).toBe('/dashboard/client/c1/approved-employees?employee=e1');
    expect(
      employeeUrlForRole('PAYROLL_LEAD', emp({ ...pmApproved, form_payroll_review_status: 'PAYROLL_APPROVED' }))
    ).toBe('/dashboard/client/c1/pl-approved-employees?employee=e1');
    expect(
      employeeUrlForRole('PAYROLL_LEAD', emp({ ...pmApproved, form_payroll_review_status: 'PAYROLL_REJECTED' }))
    ).toBe('/dashboard/client/c1/rejected-employees?employee=e1');
  });

  it('falls back to the client dashboard for Payroll Lead before PM approval', () => {
    expect(employeeUrlForRole('PAYROLL_LEAD', emp({ form_review_status: 'REJECTED' }))).toBe(
      '/dashboard/client/c1/dashboard'
    );
    expect(employeeUrlForRole('PAYROLL_LEAD', emp())).toBe('/dashboard/client/c1/dashboard');
  });
});
