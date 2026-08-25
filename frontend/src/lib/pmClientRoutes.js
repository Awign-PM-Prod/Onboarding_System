/** URL path segment per logical tab key */
export const PM_CLIENT_TAB_SEGMENT = {
  client_dashboard: 'dashboard',
  pending: 'pending',
  role_assigned: 'role-assigned',
  in_progress: 'in-progress',
  pl_reviewed: 'pl-reviewed',
  employee_directory: 'employee-directory',
  testing: 'in-progress',
  add_employee: 'add-employees',
  attendance: 'attendance'
};

/** Map URL segment -> internal tab key */
export const PM_TAB_SEGMENT_TO_KEY = {
  dashboard: 'client_dashboard',
  pending: 'pending',
  'role-assigned': 'role_assigned',
  'in-progress': 'testing',
  'pl-reviewed': 'pl_reviewed',
  'employee-directory': 'employee_directory',
  testing: 'testing',
  'add-employees': 'add_employee',
  attendance: 'attendance'
};

export function onboardingBaseFromPathname(pathname) {
  if (String(pathname || '').startsWith('/super-admin')) return '/super-admin';
  return '/pm-dashboard';
}

export function pmClientTabUrl(clientId, tabKey, basePath = '/pm-dashboard') {
  const seg = PM_CLIENT_TAB_SEGMENT[tabKey] ?? 'dashboard';
  if (basePath === '/super-admin') {
    return `/super-admin/client/${clientId}/onboarding/${seg}`;
  }
  return `/pm-dashboard/client/${clientId}/${seg}`;
}

/** Match PM or Super Admin onboarding client detail paths */
export function matchPmClientDetailPath(pathname) {
  const sa = String(pathname || '').match(/^\/super-admin\/client\/([^/]+)\/onboarding\/([^/]+)$/);
  if (sa) return { clientId: sa[1], tabSegment: sa[2], basePath: '/super-admin' };
  const m = String(pathname || '').match(/^\/pm-dashboard\/client\/([^/]+)\/([^/]+)$/);
  if (!m) return null;
  return { clientId: m[1], tabSegment: m[2], basePath: '/pm-dashboard' };
}
