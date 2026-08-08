import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';

const ACTOR_ROLES = [
  { value: '', label: 'All roles' },
  { value: 'PAYROLL_LEAD', label: 'Payroll Lead' },
  { value: 'PROGRAM_MANAGER', label: 'Program Manager' },
  { value: 'SUPER_ADMIN', label: 'Super Admin' },
  { value: 'PAYROLL_HEAD', label: 'Payroll Head' }
];

const ACTION_OPTIONS = [
  { value: '', label: 'All actions' },
  { value: 'CLIENT_CREATED', label: 'Client created' },
  { value: 'CLIENT_UPDATED', label: 'Client updated' },
  { value: 'PM_ASSIGNED', label: 'PM assigned' },
  { value: 'POLICY_UPDATED', label: 'Policy updated' },
  { value: 'EMPLOYEE_CREATED', label: 'Employee created' },
  { value: 'ROLE_DETAILS_SET', label: 'Role details set' },
  { value: 'ONBOARDING_INITIATED', label: 'Onboarding initiated' },
  { value: 'JOINING_STATUS_UPDATED', label: 'Joining status updated' },
  { value: 'PM_REVIEW', label: 'PM review' },
  { value: 'PL_REVIEW', label: 'PL review' },
  { value: 'ATTENDANCE_UPLOAD', label: 'Attendance upload' },
  { value: 'ATTENDANCE_SUBMIT', label: 'Attendance submit' },
  { value: 'ATTENDANCE_UNSUBMIT', label: 'Attendance unsubmit' },
  { value: 'SALARY_MINIMUMS_UPDATED', label: 'Salary minimums updated' },
  { value: 'PASSWORD_RESET', label: 'Password reset' },
  { value: 'REMAINING_TASK_DIGEST_TRIGGERED', label: 'Task digest triggered' }
];

function formatWhen(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return iso;
  }
}

export default function SuperAdminActivityPage() {
  const [items, setItems] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [action, setAction] = useState('');
  const [actorRole, setActorRole] = useState('');

  const load = useCallback(
    async ({ append = false, cursor = null } = {}) => {
      if (append) setLoadingMore(true);
      else {
        setLoading(true);
        setError('');
      }
      try {
        const data = await api.listSuperAdminActivity({
          limit: 50,
          cursor: cursor || undefined,
          action: action || undefined,
          actor_role: actorRole || undefined
        });
        const rows = Array.isArray(data?.items) ? data.items : [];
        setItems((prev) => (append ? [...prev, ...rows] : rows));
        setNextCursor(data?.next_cursor ?? null);
      } catch (err) {
        setError(err.message || 'Could not load activity logs.');
        if (!append) setItems([]);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [action, actorRole]
  );

  useEffect(() => {
    load({ append: false });
  }, [load]);

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Activity Logs</h1>
          <p className="mt-1 text-sm text-slate-500">
            Org-wide activity from Program Managers, Payroll Leads, and Super Admin.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            value={actorRole}
            onChange={(e) => setActorRole(e.target.value)}
          >
            {ACTOR_ROLES.map((o) => (
              <option key={o.value || 'all-roles'} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            value={action}
            onChange={(e) => setAction(e.target.value)}
          >
            {ACTION_OPTIONS.map((o) => (
              <option key={o.value || 'all-actions'} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading && (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-500 shadow-sm">
          Loading activity…
        </div>
      )}

      {error && !loading && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-500 shadow-sm">
          No activity logged yet.
        </div>
      )}

      {!loading && items.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <ul className="divide-y divide-slate-100">
            {items.map((row) => (
              <li key={row.id} className="px-4 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-medium text-slate-900">{row.summary}</p>
                  <time className="text-xs text-slate-500">{formatWhen(row.created_at)}</time>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {[row.actor_name || 'Unknown', row.actor_role, row.action, row.client_name]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </li>
            ))}
          </ul>
          {nextCursor && (
            <div className="border-t border-slate-100 p-3 text-center">
              <button
                type="button"
                disabled={loadingMore}
                onClick={() => load({ append: true, cursor: nextCursor })}
                className="text-sm font-medium text-indigo-700 hover:underline disabled:opacity-60"
              >
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
