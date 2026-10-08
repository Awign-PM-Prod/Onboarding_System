import { pmClientTabUrl } from './pmClientRoutes';

export const SEARCH_EMPLOYEE_PARAM = 'employee';

export const GLOBAL_SEARCH_ROLES = ['PROGRAM_MANAGER', 'PAYROLL_LEAD', 'SUPER_ADMIN'];

export function clientUrlForRole(role, clientId) {
  if (role === 'PROGRAM_MANAGER') return pmClientTabUrl(clientId, 'client_dashboard');
  if (role === 'SUPER_ADMIN') return `/super-admin/client/${clientId}/dashboard`;
  return `/dashboard/client/${clientId}/dashboard`;
}

/** Payroll Lead has no onboarding list, so pick the PL page that lists the employee at their stage. */
function payrollLeadEmployeeTab(employee) {
  const pmReview = String(employee?.form_review_status ?? '').trim().toUpperCase();
  const plReview = String(employee?.form_payroll_review_status ?? '').trim().toUpperCase();
  if (pmReview !== 'APPROVED') return null;
  if (plReview === 'PENDING_PAYROLL_LEAD') return 'approved-employees';
  if (plReview === 'PAYROLL_APPROVED') return 'pl-approved-employees';
  if (plReview === 'PAYROLL_REJECTED') return 'rejected-employees';
  return null;
}

export function employeeUrlForRole(role, employee) {
  const clientId = employee.client_id;
  const query = `?${SEARCH_EMPLOYEE_PARAM}=${encodeURIComponent(employee.id)}`;
  if (role === 'PROGRAM_MANAGER') return `${pmClientTabUrl(clientId, 'testing')}${query}`;
  if (role === 'SUPER_ADMIN') return `${pmClientTabUrl(clientId, 'testing', '/super-admin')}${query}`;
  const tab = payrollLeadEmployeeTab(employee);
  return tab ? `/dashboard/client/${clientId}/${tab}${query}` : clientUrlForRole(role, clientId);
}
