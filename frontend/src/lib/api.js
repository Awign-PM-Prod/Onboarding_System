import {
  clearStoredSession,
  getAccessToken,
  getRefreshToken,
  writeStoredSession,
} from './session';

/** Base URL for the Express API (no trailing slash). Empty = same-origin, paths like `/api/me`. */
const rawBase = import.meta.env.VITE_API_BASE_URL;
const BASE_URL = normalizeApiBaseUrl(rawBase);

function normalizeApiBaseUrl(value) {
  if (typeof value !== 'string') return '';

  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) return '';

  return trimmed.endsWith('/api') ? trimmed.slice(0, -4) : trimmed;
}

function apiUrl(path) {
  const p = path.startsWith('/') ? path : `/${path}`;
  if (!BASE_URL) return p;
  return `${BASE_URL}${p}`;
}

const REQUEST_TIMEOUT_MS = 15_000;
const BANK_VERIFY_TIMEOUT_MS = 60_000;
const ATTENDANCE_UPLOAD_TIMEOUT_MS = 120_000;
const ATTENDANCE_GET_TIMEOUT_MS = 60_000;

async function fetchWithTimeout(url, options, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(
        `Request timed out after ${Math.round(timeoutMs / 1000)}s. If uploading attendance, wait and retry — large CSVs can take longer. Also confirm the backend is running at ${BASE_URL || 'same origin'}.`
      );
    }
    if (err instanceof TypeError) {
      throw new Error(`Cannot reach backend at ${BASE_URL || 'same origin'} (${err.message})`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function authHeader() {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

let refreshInFlight = null;

async function refreshAccessToken() {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return null;
    try {
      const res = await fetchWithTimeout(
        apiUrl('/api/auth/refresh'),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken }),
        },
        REQUEST_TIMEOUT_MS,
      );
      const text = await res.text();
      const body = text ? JSON.parse(text) : null;
      if (!res.ok || !body?.session?.access_token) {
        clearStoredSession();
        return null;
      }
      writeStoredSession(body.session);
      return body.session.access_token;
    } catch {
      clearStoredSession();
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

async function request(path, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const headers = {
    'Content-Type': 'application/json',
    ...(await authHeader()),
    ...(options.headers || {}),
  };
  let res = await fetchWithTimeout(apiUrl(path), { ...options, headers }, timeoutMs);

  if (res.status === 401 && !String(path).startsWith('/api/auth/')) {
    const nextToken = await refreshAccessToken();
    if (nextToken) {
      headers.Authorization = `Bearer ${nextToken}`;
      res = await fetchWithTimeout(apiUrl(path), { ...options, headers }, timeoutMs);
    }
  }

  const text = await res.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      const isHtml = /^\s*</.test(text);
      const wrongDevPort =
        import.meta.env.DEV && BASE_URL.includes('localhost:8088') && isHtml;
      const hint = wrongDevPort
        ? 'VITE_API_BASE_URL points at the Vite dev server (8088). Use http://localhost:8089 or leave it empty to use the dev proxy.'
        : isHtml
          ? 'The API returned HTML instead of JSON. Confirm the backend is running (port 8089) and restart it after code updates.'
          : text.slice(0, 120);
      throw new Error(`Request failed (${res.status}): ${hint}`);
    }
  }
  if (!res.ok) {
    const err = new Error(body?.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.details = body?.details;
    throw err;
  }
  return body;
}

async function uploadRequest(path, formData, timeoutMs = REQUEST_TIMEOUT_MS) {
  const headers = { ...(await authHeader()) };
  const res = await fetchWithTimeout(apiUrl(path), { method: 'POST', headers, body: formData }, timeoutMs);
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = new Error(body?.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.details = body?.details;
    throw err;
  }
  return body;
}

async function fileRequest(path, options = {}) {
  const headers = {
    ...(await authHeader()),
    ...(options.headers || {})
  };
  const res = await fetchWithTimeout(apiUrl(path), { ...options, headers });
  if (!res.ok) {
    const text = await res.text();
    let message = `Request failed (${res.status})`;
    try {
      const body = text ? JSON.parse(text) : null;
      message = body?.error || message;
    } catch {
      if (text) message = text;
    }
    throw new Error(message);
  }
  return res.blob();
}

export const api = {
  login: async ({ email, password }) => {
    const body = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (!body?.session?.access_token) {
      throw new Error('Login failed: no session returned');
    }
    return body.session;
  },
  logout: () =>
    request('/api/auth/logout', {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  me: () => request('/api/me'),
  listProgramManagers: () => request('/api/program-managers'),
  createProgramManager: (payload) =>
    request('/api/program-managers', { method: 'POST', body: JSON.stringify(payload) }),
  createPayrollLead: (payload) =>
    request('/api/super-admin/payroll-leads', { method: 'POST', body: JSON.stringify(payload) }),
  getStaffInvite: (token) =>
    request(`/api/public/staff-auth/invite?token=${encodeURIComponent(token)}`),
  setStaffPasswordFromInvite: (payload) =>
    request('/api/public/staff-auth/set-password', {
      method: 'POST',
      body: JSON.stringify(payload || {})
    }),
  requestStaffPasswordReset: (payload) =>
    request('/api/public/staff-auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify(payload || {})
    }),
  listPasswordResetRequests: (status = 'PENDING') => {
    const q = new URLSearchParams();
    if (status) q.set('status', status);
    return request(`/api/super-admin/password-reset-requests?${q.toString()}`);
  },
  listClients: () => request('/api/clients'),
  getClient: (id) => request(`/api/clients/${encodeURIComponent(id)}`),
  saveClientPolicy: (id, payload) =>
    request(`/api/clients/${encodeURIComponent(id)}/policy`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    }),
  listClientPolicyChanges: (id) =>
    request(`/api/clients/${encodeURIComponent(id)}/policy-changes`),
  getPayrollDashboardStats: ({ from, to, client_id } = {}) => {
    const q = new URLSearchParams();
    if (from) q.set('from', from);
    if (to) q.set('to', to);
    if (client_id) q.set('client_id', client_id);
    const qs = q.toString();
    return request(`/api/clients/dashboard-stats${qs ? `?${qs}` : ''}`);
  },
  downloadClientCsvTemplate: () => fileRequest('/api/clients/csv-template'),
  exportClientCsv: (id) =>
    fileRequest(`/api/clients/${encodeURIComponent(id)}/export`),
  importClientsCsv: (file) => {
    const fd = new FormData();
    fd.append('file', file);
    return uploadRequest('/api/clients/import', fd);
  },
  createClient: (payload) =>
    request('/api/clients', { method: 'POST', body: JSON.stringify(payload) }),
  updateClient: (id, payload) =>
    request(`/api/clients/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  assignClientProgramManager: (id, payload) =>
    request(`/api/clients/${id}/program-manager`, { method: 'PATCH', body: JSON.stringify(payload) }),
  listClientPmTransfers: (id) => request(`/api/clients/${id}/pm-transfers`),

  listPmClients: () => request('/api/pm/clients'),
  getPmDashboardStats: ({ from, to, client_id } = {}) => {
    const q = new URLSearchParams();
    if (from) q.set('from', from);
    if (to) q.set('to', to);
    if (client_id) q.set('client_id', client_id);
    const qs = q.toString();
    return request(`/api/pm/clients/dashboard-stats${qs ? `?${qs}` : ''}`);
  },
  getPmJoiningStatusReminders: (clientId) => {
    const q = new URLSearchParams();
    if (clientId) q.set('client_id', clientId);
    const qs = q.toString();
    return request(`/api/pm/clients/joining-status-reminders${qs ? `?${qs}` : ''}`);
  },
  exportPmJoiningStatusReminder: ({ clientId, bucket = 'within_2_days' }) => {
    const q = new URLSearchParams();
    q.set('client_id', clientId);
    q.set('bucket', bucket);
    return fileRequest(`/api/pm/clients/joining-status-reminders/export?${q.toString()}`);
  },
  getPmDojExtendRequestUpdates: () => request('/api/pm/clients/doj-extend-request-updates'),
  ackPmDojExtendRequestUpdates: (ids) =>
    request('/api/pm/clients/doj-extend-request-updates/ack', {
      method: 'POST',
      body: JSON.stringify({ ids })
    }),
  getPmJoiningStatusChangeRequestUpdates: () =>
    request('/api/pm/clients/joining-status-change-request-updates'),
  ackPmJoiningStatusChangeRequestUpdates: (ids) =>
    request('/api/pm/clients/joining-status-change-request-updates/ack', {
      method: 'POST',
      body: JSON.stringify({ ids })
    }),
  sendPmBulkAlert: (payload) =>
    request('/api/pm/alerts/send', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  listPmBulkAlertHistory: () => request('/api/pm/alerts/history'),
  requestDojExtend: ({ clientId, employeeId, reason }) =>
    request(`/api/employees/${encodeURIComponent(employeeId)}/doj-extend-request`, {
      method: 'POST',
      body: JSON.stringify({
        client_id: clientId,
        reason: reason || null
      })
    }),
  bulkRequestDojExtend: ({ clientId, employeeIds, reason }) =>
    request('/api/employees/doj-extend-request/bulk', {
      method: 'POST',
      body: JSON.stringify({
        client_id: clientId,
        employee_ids: employeeIds,
        reason: reason || null
      })
    }),
  requestJoiningStatusChange: ({ clientId, employeeId, reason }) =>
    request(`/api/employees/${encodeURIComponent(employeeId)}/joining-status-change-request`, {
      method: 'POST',
      body: JSON.stringify({
        client_id: clientId,
        reason: reason || null
      })
    }),
  bulkRequestJoiningStatusChange: ({ clientId, employeeIds, reason }) =>
    request('/api/employees/joining-status-change-request/bulk', {
      method: 'POST',
      body: JSON.stringify({
        client_id: clientId,
        employee_ids: employeeIds,
        reason: reason || null
      })
    }),
  setExtendedDoj: ({ clientId, employeeId, dateOfJoining }) =>
    request(`/api/employees/${encodeURIComponent(employeeId)}/extended-doj`, {
      method: 'PUT',
      body: JSON.stringify({
        client_id: clientId,
        date_of_joining: dateOfJoining
      })
    }),
  listEmployees: (clientId) =>
    request(`/api/employees?client_id=${encodeURIComponent(clientId)}`),
  getEmployeeJobAppForm: ({ clientId, employeeId, payrollReview = false }) => {
    const q = new URLSearchParams();
    q.set('client_id', clientId);
    if (payrollReview) q.set('payroll_review', '1');
    return request(
      `/api/employees/${encodeURIComponent(employeeId)}/job-app-form?${q.toString()}`
    );
  },
  reviewEmployeeJobAppForm: ({ clientId, employeeId, payload }) =>
    request(`/api/employees/${encodeURIComponent(employeeId)}/form-review`, {
      method: 'POST',
      body: JSON.stringify({ client_id: clientId, ...payload })
    }),
  reviewEmployeePayrollJobAppForm: ({ clientId, employeeId, payload }) =>
    request(`/api/employees/${encodeURIComponent(employeeId)}/payroll-form-review`, {
      method: 'POST',
      body: JSON.stringify({ client_id: clientId, ...payload })
    }),
  payrollResetEmployeeToPl: ({ clientId, employeeId }) =>
    request(`/api/employees/${encodeURIComponent(employeeId)}/payroll-reset-to-pl`, {
      method: 'POST',
      body: JSON.stringify({ client_id: clientId })
    }),
  createEmployee: (payload) =>
    request('/api/employees', { method: 'POST', body: JSON.stringify(payload) }),
  setEmployeeRoleDetails: (id, payload) =>
    request(`/api/employees/${id}/role-details`, { method: 'PUT', body: JSON.stringify(payload) }),
  updateEmployeeSalary: (id, payload) =>
    request(`/api/employees/${encodeURIComponent(id)}/salary`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    }),
  requestSalaryChange: (id, { pay_type, ctc_type, ctc_value, reason, file }) => {
    const fd = new FormData();
    fd.append('pay_type', pay_type);
    if (ctc_type != null) fd.append('ctc_type', ctc_type);
    fd.append('ctc_value', String(ctc_value));
    if (reason) fd.append('reason', reason);
    if (file) fd.append('file', file);
    return uploadRequest(`/api/employees/${encodeURIComponent(id)}/salary-change-request`, fd);
  },
  listSalaryChangeRequests: (clientId, status = 'PENDING') => {
    const q = new URLSearchParams();
    q.set('client_id', clientId);
    if (status) q.set('status', status);
    return request(`/api/employees/salary-change-requests?${q.toString()}`);
  },
  reviewSalaryChange: (requestId, payload) =>
    request(`/api/employees/salary-change-requests/${encodeURIComponent(requestId)}/review`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  cancelSalaryChange: (requestId) =>
    request(`/api/employees/salary-change-requests/${encodeURIComponent(requestId)}/cancel`, {
      method: 'POST'
    }),
  getSalaryChangeDocumentUrl: (requestId) =>
    request(`/api/employees/salary-change-requests/${encodeURIComponent(requestId)}/document`),
  bulkSetRoleDetails: (employeeIds, payload) =>
    request('/api/employees/role-details', {
      method: 'POST',
      body: JSON.stringify({ employee_ids: employeeIds, ...payload })
    }),
  bulkSetJoiningStatus: ({ clientId, employeeIds, joiningStatus, joiningActualDate }) =>
    request('/api/employees/joining-status/bulk', {
      method: 'POST',
      body: JSON.stringify({
        client_id: clientId,
        employee_ids: employeeIds,
        joining_status: joiningStatus,
        joining_actual_date: joiningActualDate || null
      })
    }),
  setJoiningStatus: ({ clientId, employeeId, joiningStatus, joiningActualDate, empCode }) =>
    request(`/api/employees/${encodeURIComponent(employeeId)}/joining-status`, {
      method: 'POST',
      body: JSON.stringify({
        client_id: clientId,
        joining_status: joiningStatus,
        joining_actual_date: joiningActualDate || null,
        emp_code: empCode || null
      })
    }),
  setPayrollIdentityNumbers: ({ clientId, employeeId, payrollPfUanNumber, payrollEsicNumber }) =>
    request(`/api/employees/${encodeURIComponent(employeeId)}/payroll-identity-numbers`, {
      method: 'POST',
      body: JSON.stringify({
        client_id: clientId,
        payroll_pf_uan_number: payrollPfUanNumber || null,
        payroll_esic_number: payrollEsicNumber || null
      })
    }),
  exportPayrollIdentityNumbersCsv: ({ clientId }) =>
    fileRequest(`/api/employees/identity-numbers/export?client_id=${encodeURIComponent(clientId)}`),
  exportJobAppFormsCsv: ({ clientId, employeeIds }) =>
    fileRequest('/api/employees/job-app-forms/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        employee_ids: employeeIds
      })
    }),
  importPayrollIdentityNumbersCsv: ({ clientId, file }) => {
    const fd = new FormData();
    fd.append('client_id', clientId);
    fd.append('file', file);
    return uploadRequest('/api/employees/identity-numbers/import', fd);
  },
  bulkUploadEmployees: (clientId, file) => {
    const fd = new FormData();
    fd.append('client_id', clientId);
    fd.append('file', file);
    return uploadRequest('/api/employees/bulk-upload', fd);
  },
  initiateOnboarding: (employeeIds) =>
    request('/api/employees/initiate-onboarding', {
      method: 'POST',
      body: JSON.stringify({ employee_ids: employeeIds })
    }),
  reinitiateRejectedOnboarding: ({ clientId, employeeIds }) =>
    request('/api/employees/reinitiate-rejected-onboarding', {
      method: 'POST',
      body: JSON.stringify({ client_id: clientId, employee_ids: employeeIds })
    }),
  transferEmployeeProject: ({ clientId, employeeId, targetClientId, reason }) =>
    request(`/api/employees/${encodeURIComponent(employeeId)}/transfer-project`, {
      method: 'POST',
      body: JSON.stringify({
        client_id: clientId,
        target_client_id: targetClientId,
        reason: reason || null
      })
    }),
  lookupOnboardingMobile: ({ mobile, employeeId }) =>
    request('/api/public/onboarding/mobile-lookup', {
      method: 'POST',
      body: JSON.stringify({ mobile, employee_id: employeeId || null })
    }),
  getOnboardingEmployeeSummary: ({ employeeId }) => {
    const q = new URLSearchParams();
    q.set('employee_id', employeeId);
    return request(`/api/public/onboarding/employee-summary?${q.toString()}`);
  },
  sendAadhaarOtp: ({ mobile, employeeId, aadhaar }) =>
    request('/api/public/onboarding/aadhaar/send-otp', {
      method: 'POST',
      body: JSON.stringify({ mobile, employee_id: employeeId || null, aadhaar })
    }),
  verifyAadhaarOtp: ({ mobile, employeeId, otp }) =>
    request('/api/public/onboarding/aadhaar/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ mobile, employee_id: employeeId || null, otp })
    }),
  sendAadhaarResumeOtp: ({ mobile, employeeId }) =>
    request('/api/public/onboarding/aadhaar/resume/send-otp', {
      method: 'POST',
      body: JSON.stringify({ mobile, employee_id: employeeId || null })
    }),
  verifyAadhaarResumeOtp: ({ mobile, employeeId, otp }) =>
    request('/api/public/onboarding/aadhaar/resume/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ mobile, employee_id: employeeId || null, otp })
    }),
  sendEmailOtp: ({ mobile, employeeId, email }) =>
    request('/api/public/onboarding/email/send-otp', {
      method: 'POST',
      body: JSON.stringify({ mobile, employee_id: employeeId || null, email })
    }),
  verifyEmailOtp: ({ mobile, employeeId, email, otp }) =>
    request('/api/public/onboarding/email/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ mobile, employee_id: employeeId || null, email, otp })
    }),
  sendSecondaryMobileOtp: ({ mobile, employeeId, secondaryMobile }) =>
    request('/api/public/onboarding/secondary-mobile/send-otp', {
      method: 'POST',
      body: JSON.stringify({
        mobile,
        employee_id: employeeId || null,
        pd_secondary_mobile: secondaryMobile,
      }),
    }),
  verifySecondaryMobileOtp: ({ mobile, employeeId, secondaryMobile, otp }) =>
    request('/api/public/onboarding/secondary-mobile/verify-otp', {
      method: 'POST',
      body: JSON.stringify({
        mobile,
        employee_id: employeeId || null,
        pd_secondary_mobile: secondaryMobile,
        otp,
      }),
    }),
  verifyPan: ({ mobile, employeeId, panNumber }) =>
    request('/api/public/onboarding/pan/verify', {
      method: 'POST',
      body: JSON.stringify({ mobile, employee_id: employeeId || null, pan_number: panNumber })
    }),
  verifyBankAccount: ({ mobile, employeeId, accountHolderName, accountNumber, ifsc }) =>
    request('/api/public/onboarding/bank/verify', {
      method: 'POST',
      body: JSON.stringify({
        mobile,
        employee_id: employeeId || null,
        account_holder_name: accountHolderName,
        account_number: accountNumber,
        ifsc
      })
    }, BANK_VERIFY_TIMEOUT_MS),
  sendOnboardingStatusOtp: ({ mobile, employeeId }) =>
    request('/api/public/onboarding/status/send-otp', {
      method: 'POST',
      body: JSON.stringify({ mobile, employee_id: employeeId || null })
    }),
  verifyOnboardingStatusOtp: ({ mobile, employeeId, otp }) =>
    request('/api/public/onboarding/status/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ mobile, employee_id: employeeId || null, otp })
    }),
  getOnboardingStatus: ({ mobile, employeeId, sessionToken }) => {
    const q = new URLSearchParams();
    q.set('mobile', mobile);
    if (employeeId) q.set('employee_id', employeeId);
    q.set('session_token', sessionToken);
    return request(`/api/public/onboarding/status?${q.toString()}`);
  },
  getJobAppForm: ({ mobile, employeeId }) => {
    const q = new URLSearchParams();
    q.set('mobile', mobile);
    if (employeeId) q.set('employee_id', employeeId);
    return request(`/api/public/onboarding/job-app-form?${q.toString()}`);
  },
  patchJobAppForm: (payload) =>
    request('/api/public/onboarding/job-app-form', {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }),
  uploadDrivingLicense: ({ mobile, employeeId, file }) => {
    const fd = new FormData();
    fd.append('mobile', mobile);
    if (employeeId) fd.append('employee_id', employeeId);
    fd.append('file', file);
    return uploadRequest('/api/public/onboarding/driving-license-upload', fd);
  },
  uploadQualificationCertificate: ({ mobile, employeeId, file, kind = 'iti_diploma_doc' }) => {
    const q = new URLSearchParams();
    q.set('kind', kind);
    const fd = new FormData();
    fd.append('mobile', mobile);
    if (employeeId) fd.append('employee_id', employeeId);
    fd.append('file', file);
    return uploadRequest(`/api/public/onboarding/qualification-certificate-upload?${q.toString()}`, fd);
  },
  uploadKycDocument: ({ mobile, employeeId, file, kind }) => {
    const q = new URLSearchParams();
    q.set('kind', kind);
    const fd = new FormData();
    fd.append('mobile', mobile);
    if (employeeId) fd.append('employee_id', employeeId);
    fd.append('file', file);
    return uploadRequest(`/api/public/onboarding/kyc-document-upload?${q.toString()}`, fd);
  },
  validateKycDocument: ({ mobile, employeeId, file, kind }) => {
    const q = new URLSearchParams();
    q.set('kind', kind);
    const fd = new FormData();
    fd.append('mobile', mobile);
    if (employeeId) fd.append('employee_id', employeeId);
    fd.append('file', file);
    return uploadRequest(`/api/public/onboarding/kyc-document-validate?${q.toString()}`, fd);
  },
  listAdminClients: () => request('/api/admin/clients'),
  getAdminComplianceStats: () => request('/api/admin/compliance-stats'),

  getSuperAdminDashboardStats: ({ from, to, client_id } = {}) => {
    const q = new URLSearchParams();
    if (from) q.set('from', from);
    if (to) q.set('to', to);
    if (client_id) q.set('client_id', client_id);
    const qs = q.toString();
    return request(`/api/super-admin/dashboard-stats${qs ? `?${qs}` : ''}`);
  },
  listSuperAdminClients: () => request('/api/super-admin/clients'),
  getSuperAdminClientEmployees: (clientId) =>
    request(`/api/super-admin/clients/${encodeURIComponent(clientId)}/employees`),
  downloadSuperAdminMasterReport: (clientId) => {
    const q = clientId ? `?client_id=${encodeURIComponent(clientId)}` : '';
    return fileRequest(`/api/super-admin/master-report${q}`);
  },
  listSuperAdminActivity: ({ limit = 50, cursor, client_id, action, actor_role, from, to } = {}) => {
    const q = new URLSearchParams();
    if (limit) q.set('limit', String(limit));
    if (cursor) q.set('cursor', cursor);
    if (client_id) q.set('client_id', client_id);
    if (action) q.set('action', action);
    if (actor_role) q.set('actor_role', actor_role);
    if (from) q.set('from', from);
    if (to) q.set('to', to);
    const qs = q.toString();
    return request(`/api/super-admin/activity${qs ? `?${qs}` : ''}`);
  },
  listSuperAdminSalaryMinimums: () => request('/api/super-admin/salary-minimums'),
  saveSuperAdminSalaryMinimums: (items) =>
    request('/api/super-admin/salary-minimums', {
      method: 'PUT',
      body: JSON.stringify({ items })
    }),
  listSuperAdminHolidayCalendarDefs: () => request('/api/super-admin/holiday-calendar-defs'),
  createSuperAdminHolidayCalendarDef: ({ name, states, year, items } = {}) =>
    request('/api/super-admin/holiday-calendar-defs', {
      method: 'POST',
      body: JSON.stringify({ name, states, year, items })
    }),
  listSuperAdminHolidayCalendars: ({ year, state, calendarId } = {}) => {
    const q = new URLSearchParams();
    if (year) q.set('year', String(year));
    if (state) q.set('state', state);
    if (calendarId) q.set('calendar_id', calendarId);
    const qs = q.toString();
    return request(`/api/super-admin/holiday-calendars${qs ? `?${qs}` : ''}`);
  },
  saveSuperAdminHolidayCalendars: (items, { calendarId } = {}) =>
    request('/api/super-admin/holiday-calendars', {
      method: 'PUT',
      body: JSON.stringify({ items, calendar_id: calendarId || undefined })
    }),
  downloadHolidayCalendarTemplate: () =>
    fileRequest('/api/super-admin/holiday-calendars/template'),
  listHolidayCalendarDefs: ({ forClientId } = {}) => {
    const q = new URLSearchParams();
    if (forClientId) q.set('for_client_id', forClientId);
    const qs = q.toString();
    return request(`/api/holiday-calendars/defs${qs ? `?${qs}` : ''}`);
  },
  listHolidayCalendars: ({ state, year, calendarId } = {}) => {
    const q = new URLSearchParams();
    if (state) q.set('state', state);
    if (year) q.set('year', String(year));
    if (calendarId) q.set('calendar_id', calendarId);
    return request(`/api/holiday-calendars?${q.toString()}`);
  },
  listRegionZones: (state) => {
    const q = new URLSearchParams();
    if (state) q.set('state', state);
    const qs = q.toString();
    return request(`/api/region-zones${qs ? `?${qs}` : ''}`);
  },
  saveRegionZones: (state, items) =>
    request('/api/region-zones', {
      method: 'PUT',
      body: JSON.stringify({ state, items })
    }),
  /** @deprecated Prefer listRegionZones — kept for Super Admin page compatibility */
  listSuperAdminRegionZones: (state) => {
    const q = new URLSearchParams();
    if (state) q.set('state', state);
    const qs = q.toString();
    return request(`/api/region-zones${qs ? `?${qs}` : ''}`);
  },
  /** @deprecated Prefer saveRegionZones — kept for Super Admin page compatibility */
  saveSuperAdminRegionZones: (state, items) =>
    request('/api/region-zones', {
      method: 'PUT',
      body: JSON.stringify({ state, items })
    }),
  listRegionZonesForState: (state) => {
    const q = new URLSearchParams();
    q.set('state', state);
    return request(`/api/region-zones?${q.toString()}`);
  },
  listDigestRecipients: () => request('/api/super-admin/digest-recipients'),
  triggerRemainingTaskDigest: (body) =>
    request('/api/super-admin/remaining-task-digest', {
      method: 'POST',
      body: JSON.stringify(body || {})
    }),
  listSuperAdminStaffUsers: () => request('/api/super-admin/staff-users'),
  resetSuperAdminStaffPassword: (userId, body) =>
    request(`/api/super-admin/users/${encodeURIComponent(userId)}/password`, {
      method: 'POST',
      body: JSON.stringify(body || {})
    }),
  listSuperAdminDojExtendRequests: (status = 'PENDING') => {
    const q = new URLSearchParams();
    if (status) q.set('status', status);
    return request(`/api/super-admin/doj-extend-requests?${q.toString()}`);
  },
  reviewSuperAdminDojExtendRequest: (requestId, { decision, note, maxAllowedDoj }) =>
    request(`/api/super-admin/doj-extend-requests/${encodeURIComponent(requestId)}/review`, {
      method: 'POST',
      body: JSON.stringify({
        decision,
        note: note || null,
        max_allowed_doj: maxAllowedDoj || null
      })
    }),
  listSuperAdminJoiningStatusChangeRequests: (status = 'PENDING') => {
    const q = new URLSearchParams();
    if (status) q.set('status', status);
    return request(`/api/super-admin/joining-status-change-requests?${q.toString()}`);
  },
  reviewSuperAdminJoiningStatusChangeRequest: (requestId, { decision, note }) =>
    request(
      `/api/super-admin/joining-status-change-requests/${encodeURIComponent(requestId)}/review`,
      {
        method: 'POST',
        body: JSON.stringify({ decision, note: note || null })
      }
    ),
  getSalaryMinimumForState: (state, { zone, skill_level } = {}) => {
    const q = new URLSearchParams();
    if (zone) q.set('zone', zone);
    if (skill_level) q.set('skill_level', skill_level);
    const qs = q.toString();
    return request(
      `/api/salary-minimums/${encodeURIComponent(state)}${qs ? `?${qs}` : ''}`
    );
  },

  getAttendance: ({ clientId, month }) =>
    request(
      `/api/clients/${encodeURIComponent(clientId)}/attendance?month=${encodeURIComponent(month)}`,
      {},
      ATTENDANCE_GET_TIMEOUT_MS
    ),
  uploadAttendance: ({ clientId, month, file }) => {
    const fd = new FormData();
    fd.append('file', file);
    if (month) fd.append('month', month);
    return uploadRequest(
      `/api/clients/${encodeURIComponent(clientId)}/attendance/upload`,
      fd,
      ATTENDANCE_UPLOAD_TIMEOUT_MS
    );
  },
  uploadAttendanceIncentives: ({ clientId, sheetId, file }) => {
    const fd = new FormData();
    fd.append('file', file);
    return uploadRequest(
      `/api/clients/${encodeURIComponent(clientId)}/attendance/${encodeURIComponent(sheetId)}/upload-incentives`,
      fd,
      ATTENDANCE_UPLOAD_TIMEOUT_MS
    );
  },
  patchAttendanceDay: ({ clientId, sheetId, rowId, date, code }) =>
    request(
      `/api/clients/${encodeURIComponent(clientId)}/attendance/${encodeURIComponent(sheetId)}/rows/${encodeURIComponent(rowId)}/days/${encodeURIComponent(date)}`,
      { method: 'PATCH', body: JSON.stringify({ code }) }
    ),
  saveAttendanceRows: ({ clientId, sheetId, rows }) =>
    request(
      `/api/clients/${encodeURIComponent(clientId)}/attendance/${encodeURIComponent(sheetId)}/rows`,
      { method: 'PATCH', body: JSON.stringify({ rows }) },
      ATTENDANCE_GET_TIMEOUT_MS
    ),
  exportAttendanceCsv: ({ clientId, sheetId, type }) =>
    fileRequest(
      `/api/clients/${encodeURIComponent(clientId)}/attendance/${encodeURIComponent(sheetId)}/export?type=${encodeURIComponent(type)}`
    ),
  exportAttendanceTemplate: ({ clientId, month }) =>
    fileRequest(
      `/api/clients/${encodeURIComponent(clientId)}/attendance/export?month=${encodeURIComponent(month)}&type=template`
    ),
  recomputeAttendance: ({ clientId, sheetId }) =>
    request(
      `/api/clients/${encodeURIComponent(clientId)}/attendance/${encodeURIComponent(sheetId)}/recompute`,
      { method: 'POST', body: JSON.stringify({}) },
      ATTENDANCE_GET_TIMEOUT_MS
    ),
  recomputeAllAttendance: ({ clientId }) =>
    request(
      `/api/clients/${encodeURIComponent(clientId)}/attendance/recompute-all`,
      { method: 'POST', body: JSON.stringify({}) },
      ATTENDANCE_GET_TIMEOUT_MS
    ),
  submitAttendance: ({ clientId, sheetId }) =>
    request(
      `/api/clients/${encodeURIComponent(clientId)}/attendance/${encodeURIComponent(sheetId)}/submit`,
      { method: 'POST', body: JSON.stringify({}) }
    ),
  unsubmitAttendance: ({ clientId, sheetId }) =>
    request(
      `/api/clients/${encodeURIComponent(clientId)}/attendance/${encodeURIComponent(sheetId)}/unsubmit`,
      { method: 'POST', body: JSON.stringify({}) }
    ),
  lockAttendance: ({ clientId, sheetId }) =>
    request(
      `/api/clients/${encodeURIComponent(clientId)}/attendance/${encodeURIComponent(sheetId)}/lock`,
      { method: 'POST', body: JSON.stringify({}) }
    ),
  unlockAttendance: ({ clientId, sheetId, scope, userIds }) =>
    request(
      `/api/clients/${encodeURIComponent(clientId)}/attendance/${encodeURIComponent(sheetId)}/unlock`,
      {
        method: 'POST',
        body: JSON.stringify({
          scope,
          user_ids: userIds || undefined
        })
      }
    ),
  requestAttendanceEdit: ({ clientId, sheetId }) =>
    request(
      `/api/clients/${encodeURIComponent(clientId)}/attendance/${encodeURIComponent(sheetId)}/request-edit`,
      { method: 'POST', body: JSON.stringify({}) }
    ),
  getAttendanceLogs: ({ clientId, sheetId }) =>
    request(
      `/api/clients/${encodeURIComponent(clientId)}/attendance/${encodeURIComponent(sheetId)}/logs`
    ),

  uploadBpDocument: ({ mobile, employeeId, file, kind }) => {
    const q = new URLSearchParams();
    q.set('kind', kind);
    const fd = new FormData();
    fd.append('mobile', mobile);
    if (employeeId) fd.append('employee_id', employeeId);
    fd.append('file', file);
    return uploadRequest(`/api/public/onboarding/bp-document-upload?${q.toString()}`, fd);
  },
  deleteOnboardingDocument: ({ mobile, employeeId, field, url }) =>
    request('/api/public/onboarding/delete-document', {
      method: 'POST',
      body: JSON.stringify({
        mobile,
        employee_id: employeeId || null,
        field,
        url: url || null,
      })
    })
};
