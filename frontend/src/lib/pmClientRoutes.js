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

export function pmClientTabUrl(clientId, tabKey) {
  const seg = PM_CLIENT_TAB_SEGMENT[tabKey] ?? 'dashboard';
  return `/pm-dashboard/client/${clientId}/${seg}`;
}

/** Match `/pm-dashboard/client/:id/:tab` */
export function matchPmClientDetailPath(pathname) {
  const m = pathname.match(/^\/pm-dashboard\/client\/([^/]+)\/([^/]+)$/);
  if (!m) return null;
  return { clientId: m[1], tabSegment: m[2] };
}
