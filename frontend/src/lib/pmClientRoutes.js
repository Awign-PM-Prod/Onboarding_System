/** URL path segment per logical tab key */
export const PM_CLIENT_TAB_SEGMENT = {
  pending: 'pending',
  role_assigned: 'role-assigned',
  in_progress: 'in-progress',
  pl_reviewed: 'pl-reviewed',
  employee_directory: 'employee-directory',
  add_employee: 'add-employees'
};

/** Map URL segment -> internal tab key */
export const PM_TAB_SEGMENT_TO_KEY = {
  pending: 'pending',
  'role-assigned': 'role_assigned',
  'in-progress': 'in_progress',
  'pl-reviewed': 'pl_reviewed',
  'employee-directory': 'employee_directory',
  'add-employees': 'add_employee'
};

export function pmClientTabUrl(clientId, tabKey) {
  const seg = PM_CLIENT_TAB_SEGMENT[tabKey] ?? 'pending';
  return `/pm-dashboard/client/${clientId}/${seg}`;
}

/** Match `/pm-dashboard/client/:id/:tab` */
export function matchPmClientDetailPath(pathname) {
  const m = pathname.match(/^\/pm-dashboard\/client\/([^/]+)\/([^/]+)$/);
  if (!m) return null;
  return { clientId: m[1], tabSegment: m[2] };
}
