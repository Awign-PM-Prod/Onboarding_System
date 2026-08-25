import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import ModalOverlay from '../components/ModalOverlay';
import SuperAdminDateRangeFilters, {
  FilterSelect
} from '../components/SuperAdminDateRangeFilters';
import { resolveDashboardDateRange } from '../lib/superAdminDateRange';

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
  { value: 'JOINING_STATUS_CHANGE_REQUESTED', label: 'Joining status change requested' },
  { value: 'JOINING_STATUS_CHANGE_APPROVED', label: 'Joining status change approved' },
  { value: 'JOINING_STATUS_CHANGE_REJECTED', label: 'Joining status change rejected' },
  { value: 'DOJ_EXTEND_REQUESTED', label: 'DOJ extend requested' },
  { value: 'DOJ_EXTEND_APPROVED', label: 'DOJ extend approved' },
  { value: 'DOJ_EXTEND_REJECTED', label: 'DOJ extend rejected' },
  { value: 'DOJ_EXTENDED', label: 'DOJ extended' },
  { value: 'PM_REVIEW', label: 'PM review' },
  { value: 'SA_REVIEW', label: 'Super Admin review' },
  { value: 'PL_REVIEW', label: 'PL review' },
  { value: 'ATTENDANCE_UPLOAD', label: 'Attendance upload' },
  { value: 'ATTENDANCE_SUBMIT', label: 'Attendance submit' },
  { value: 'ATTENDANCE_UNSUBMIT', label: 'Attendance unsubmit' },
  { value: 'SALARY_UPDATED', label: 'Salary updated' },
  { value: 'SALARY_CHANGE_REQUESTED', label: 'Salary change requested' },
  { value: 'SALARY_CHANGE_APPROVED', label: 'Salary change approved' },
  { value: 'SALARY_CHANGE_REJECTED', label: 'Salary change rejected' },
  { value: 'SALARY_MINIMUMS_UPDATED', label: 'Salary minimums updated' },
  { value: 'PASSWORD_RESET', label: 'Password reset' },
  { value: 'REMAINING_TASK_DIGEST_TRIGGERED', label: 'Task digest triggered' }
];

const ACTION_LABELS = Object.fromEntries(
  ACTION_OPTIONS.filter((o) => o.value).map((o) => [o.value, o.label])
);

const ROLE_LABELS = {
  PAYROLL_LEAD: 'Payroll Lead',
  PROGRAM_MANAGER: 'Program Manager',
  SUPER_ADMIN: 'Super Admin',
  PAYROLL_HEAD: 'Payroll Head'
};

const META_SKIP_KEYS = new Set(['changes', 'policy_change_count']);

function formatWhen(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const datePart = d.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
    const timePart = d
      .toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      })
      .toLowerCase();
    return `${datePart}, ${timePart}`;
  } catch {
    return iso;
  }
}

function actionLabel(action) {
  return ACTION_LABELS[action] || action || '—';
}

function roleLabel(role) {
  return ROLE_LABELS[role] || role || '—';
}

function metaLabel(key) {
  return String(key || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatMetaValue(value) {
  if (value == null || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) {
    if (value.length === 0) return '—';
    if (value.every((v) => typeof v !== 'object' || v == null)) {
      return value.map(String).join(', ');
    }
    return value
      .map((item) => {
        if (item && typeof item === 'object') {
          return Object.entries(item)
            .map(([k, v]) => `${metaLabel(k)}: ${v}`)
            .join(', ');
        }
        return String(item);
      })
      .join('; ');
  }
  if (typeof value === 'object') {
    return Object.entries(value)
      .map(([k, v]) => `${metaLabel(k)}: ${v}`)
      .join(', ');
  }
  return String(value);
}

function getMetadataChanges(row) {
  const changes = row?.metadata?.changes;
  return Array.isArray(changes) ? changes.filter((line) => String(line || '').trim()) : [];
}

function pickNearestPolicyLog(entries, activityRow) {
  if (!Array.isArray(entries) || entries.length === 0) return null;
  const targetMs = new Date(activityRow.created_at).getTime();
  if (!Number.isFinite(targetMs)) return entries[0];

  let best = null;
  let bestScore = Infinity;
  for (const entry of entries) {
    const entryMs = new Date(entry.created_at).getTime();
    if (!Number.isFinite(entryMs)) continue;
    const delta = Math.abs(entryMs - targetMs);
    const actorBonus =
      activityRow.actor_user_id && entry.actor_user_id === activityRow.actor_user_id ? -1 : 0;
    const score = delta + actorBonus;
    if (score < bestScore) {
      bestScore = score;
      best = entry;
    }
  }
  return best;
}

function ChevronIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
    </svg>
  );
}

export default function SuperAdminActivityPage() {
  const [items, setItems] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [action, setAction] = useState('');
  const [actorRole, setActorRole] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [week, setWeek] = useState('');
  const [preset, setPreset] = useState('');
  const [appliedCustomFrom, setAppliedCustomFrom] = useState('');
  const [appliedCustomTo, setAppliedCustomTo] = useState('');

  const [selected, setSelected] = useState(null);
  const [detailChanges, setDetailChanges] = useState([]);
  const [detailMessage, setDetailMessage] = useState('');
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  const dateRange = useMemo(
    () =>
      resolveDashboardDateRange({
        preset,
        customFrom: appliedCustomFrom,
        customTo: appliedCustomTo,
        month,
        year,
        week
      }),
    [appliedCustomFrom, appliedCustomTo, month, preset, year, week]
  );

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
          actor_role: actorRole || undefined,
          from: dateRange.from,
          to: dateRange.to
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
    [action, actorRole, dateRange.from, dateRange.to]
  );

  useEffect(() => {
    load({ append: false });
  }, [load]);

  const openDetail = async (row) => {
    setSelected(row);
    setDetailError('');
    setDetailMessage('');
    const embedded = getMetadataChanges(row);
    if (embedded.length > 0) {
      setDetailChanges(embedded);
      setDetailLoading(false);
      return;
    }

    const needsFallback =
      (row.action === 'CLIENT_UPDATED' || row.action === 'POLICY_UPDATED') && row.client_id;

    if (!needsFallback) {
      setDetailChanges([]);
      setDetailLoading(false);
      return;
    }

    setDetailLoading(true);
    setDetailChanges([]);
    try {
      const entries = await api.listClientPolicyChanges(row.client_id);
      const nearest = pickNearestPolicyLog(entries, row);
      const lines = Array.isArray(nearest?.changes_json)
        ? nearest.changes_json.filter((line) => String(line || '').trim())
        : [];
      setDetailChanges(lines);
      setDetailMessage(nearest?.message || '');
      if (!lines.length && !nearest?.message) {
        setDetailError('No field-level changes recorded for this event.');
      }
    } catch (err) {
      setDetailError(err.message || 'Could not load field-level changes.');
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setSelected(null);
    setDetailChanges([]);
    setDetailMessage('');
    setDetailError('');
    setDetailLoading(false);
  };

  const metadataEntries = selected
    ? Object.entries(selected.metadata && typeof selected.metadata === 'object' ? selected.metadata : {})
        .filter(([key, value]) => !META_SKIP_KEYS.has(key) && value != null && value !== '')
    : [];

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Activity Logs</h1>
        <p className="mt-1 text-sm text-slate-500">
          Org-wide activity from Program Managers, Payroll Leads, and Super Admin. Click a row for
          details.
        </p>
      </div>

      <div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-start">
        <div className="flex flex-wrap items-center gap-2">
          <FilterSelect
            id="activity-role"
            value={actorRole}
            onChange={(e) => setActorRole(e.target.value)}
            options={ACTOR_ROLES}
            className="w-[8.5rem]"
          />
          <FilterSelect
            id="activity-action"
            value={action}
            onChange={(e) => setAction(e.target.value)}
            options={ACTION_OPTIONS}
            className="w-[10rem]"
          />
        </div>

        <SuperAdminDateRangeFilters
          idPrefix="activity"
          variant="presets"
          month={month}
          year={year}
          week={week}
          preset={preset}
          appliedCustomFrom={appliedCustomFrom}
          appliedCustomTo={appliedCustomTo}
          onPresetChange={setPreset}
          onMonthChange={setMonth}
          onYearChange={setYear}
          onWeekChange={setWeek}
          onCustomClear={() => {
            setAppliedCustomFrom('');
            setAppliedCustomTo('');
          }}
          onCustomApply={(from, to) => {
            setError('');
            setAppliedCustomFrom(from);
            setAppliedCustomTo(to);
            setPreset('');
            setMonth('');
            setYear('');
            setWeek('');
          }}
          onCustomError={(message) => setError(message)}
        />
      </div>

      {loading && (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-500 shadow-sm">
          Loading activity…
        </div>
      )}

      {error && !loading && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
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
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => openDetail(row)}
                  className="flex w-full items-center gap-4 px-5 py-5 text-left hover:bg-slate-50 focus:bg-slate-50 focus:outline-none sm:px-6"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900">{row.summary}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {[row.actor_name || 'Unknown', roleLabel(row.actor_role), actionLabel(row.action)]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="inline-flex items-center gap-1 text-sm font-medium text-blue-600">
                      View details
                      <ChevronIcon className="h-4 w-4" />
                    </span>
                    <time className="text-xs text-slate-500">{formatWhen(row.created_at)}</time>
                  </div>
                </button>
              </li>
            ))}
          </ul>
          {nextCursor && (
            <div className="border-t border-slate-100 p-3 text-center">
              <button
                type="button"
                disabled={loadingMore}
                onClick={() => load({ append: true, cursor: nextCursor })}
                className="text-sm font-medium text-blue-600 hover:underline disabled:opacity-60"
              >
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </div>
      )}

      {selected && (
        <ModalOverlay onClose={closeDetail}>
          <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  {actionLabel(selected.action)}
                </p>
                <h2 className="mt-1 text-lg font-semibold text-slate-900">{selected.summary}</h2>
              </div>
              <button
                type="button"
                onClick={closeDetail}
                className="rounded-lg border border-slate-200 px-2 py-1 text-sm text-slate-600 hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <dl className="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-slate-500">When</dt>
                <dd className="text-slate-800">{formatWhen(selected.created_at)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Actor</dt>
                <dd className="text-slate-800">
                  {selected.actor_name || 'Unknown'}
                  {selected.actor_role ? ` · ${roleLabel(selected.actor_role)}` : ''}
                </dd>
              </div>
              {selected.client_name && (
                <div className="sm:col-span-2">
                  <dt className="text-xs text-slate-500">Client</dt>
                  <dd className="text-slate-800">{selected.client_name}</dd>
                </div>
              )}
            </dl>

            <div className="mt-5 border-t border-slate-100 pt-4">
              <h3 className="text-sm font-semibold text-slate-900">Changed fields</h3>
              {detailLoading && <p className="mt-2 text-sm text-slate-500">Loading changes…</p>}
              {!detailLoading && detailError && (
                <p className="mt-2 text-sm text-slate-500">{detailError}</p>
              )}
              {!detailLoading && !detailError && detailMessage && detailChanges.length === 0 && (
                <p className="mt-2 text-sm text-slate-700">{detailMessage}</p>
              )}
              {!detailLoading && !detailError && detailChanges.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                  {detailChanges.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              )}
              {!detailLoading &&
                !detailError &&
                detailChanges.length === 0 &&
                !detailMessage &&
                !(
                  selected.action === 'CLIENT_UPDATED' || selected.action === 'POLICY_UPDATED'
                ) && (
                  <p className="mt-2 text-sm text-slate-500">
                    No field-level change list for this action.
                  </p>
                )}
            </div>

            {metadataEntries.length > 0 && (
              <div className="mt-5 border-t border-slate-100 pt-4">
                <h3 className="text-sm font-semibold text-slate-900">Other details</h3>
                <dl className="mt-2 space-y-2 text-sm">
                  {metadataEntries.map(([key, value]) => (
                    <div key={key} className="grid grid-cols-1 gap-0.5 sm:grid-cols-3 sm:gap-2">
                      <dt className="text-slate-500">{metaLabel(key)}</dt>
                      <dd className="break-words text-slate-800 sm:col-span-2">
                        {formatMetaValue(value)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </div>
        </ModalOverlay>
      )}
    </main>
  );
}
