import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import DatePicker from '../components/DatePicker';
import { FilterSelect } from '../components/SuperAdminDateRangeFilters';
import {
  MONTH_OPTIONS,
  buildYearOptions,
  resolveMailTrackerDateRange,
  toYmd
} from '../lib/superAdminDateRange';

const PERIOD_OPTIONS = [
  { value: '', label: 'All time' },
  { value: 'day', label: 'Day' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' }
];

const TYPE_OPTIONS = [
  { value: '', label: 'All types' },
  { value: 'onboarding', label: 'Onboarding' },
  { value: 'staff_invite', label: 'Staff invite' }
];

const KIND_OPTIONS = [
  { value: '', label: 'All kinds' },
  { value: 'send', label: 'Send' },
  { value: 'resend', label: 'Resend' }
];

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'sent', label: 'Sent' },
  { value: 'failed', label: 'Failed' },
  { value: 'skipped', label: 'Skipped' }
];

const TYPE_LABELS = {
  onboarding: 'Onboarding',
  staff_invite: 'Staff invite'
};

const KIND_LABELS = {
  send: 'Send',
  resend: 'Resend'
};

const STATUS_LABELS = {
  sent: 'Sent',
  failed: 'Failed',
  skipped: 'Skipped'
};

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

function statusClass(status) {
  if (status === 'sent') return 'bg-emerald-50 text-emerald-800 ring-emerald-200';
  if (status === 'failed') return 'bg-rose-50 text-rose-800 ring-rose-200';
  if (status === 'skipped') return 'bg-amber-50 text-amber-800 ring-amber-200';
  return 'bg-slate-50 text-slate-700 ring-slate-200';
}

function StatCard({ label, value, hint }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

function TypeBreakdown({ title, stats }) {
  const total = Number(stats?.total) || 0;
  const send = Number(stats?.send) || 0;
  const resend = Number(stats?.resend) || 0;
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{total}</p>
      <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-600">
        <span>
          Send: <span className="font-semibold tabular-nums text-slate-800">{send}</span>
        </span>
        <span>
          Resend: <span className="font-semibold tabular-nums text-slate-800">{resend}</span>
        </span>
      </div>
    </div>
  );
}

export default function SuperAdminMailTrackerPage() {
  const yearOptions = useMemo(() => buildYearOptions(), []);
  const [period, setPeriod] = useState('');
  const [day, setDay] = useState(() => toYmd(new Date()));
  const [month, setMonth] = useState(() => String(new Date().getMonth() + 1).padStart(2, '0'));
  const [year, setYear] = useState(() => String(new Date().getFullYear()));
  const [mailType, setMailType] = useState('');
  const [sendKind, setSendKind] = useState('');
  const [status, setStatus] = useState('');

  const [stats, setStats] = useState(null);
  const [items, setItems] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const dateRange = useMemo(
    () => resolveMailTrackerDateRange({ period, day, month, year }),
    [day, month, period, year]
  );

  const load = useCallback(
    async ({ append = false, cursor = null } = {}) => {
      if (append) setLoadingMore(true);
      else {
        setLoading(true);
        setError('');
      }
      try {
        const filters = {
          from: dateRange.from,
          to: dateRange.to,
          mail_type: mailType || undefined,
          send_kind: sendKind || undefined
        };
        if (append) {
          const data = await api.listSuperAdminMailTracker({
            ...filters,
            status: status || undefined,
            limit: 50,
            cursor: cursor || undefined
          });
          const rows = Array.isArray(data?.items) ? data.items : [];
          setItems((prev) => [...prev, ...rows]);
          setNextCursor(data?.next_cursor ?? null);
        } else {
          const [statsData, listData] = await Promise.all([
            api.getSuperAdminMailTrackerStats(filters),
            api.listSuperAdminMailTracker({
              ...filters,
              status: status || undefined,
              limit: 50
            })
          ]);
          setStats(statsData || null);
          setItems(Array.isArray(listData?.items) ? listData.items : []);
          setNextCursor(listData?.next_cursor ?? null);
        }
      } catch (err) {
        setError(err.message || 'Could not load mail tracker.');
        if (!append) {
          setStats(null);
          setItems([]);
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [dateRange.from, dateRange.to, mailType, sendKind, status]
  );

  useEffect(() => {
    load({ append: false });
  }, [load]);

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Mail Tracker</h1>
        <p className="mt-1 text-sm text-slate-500">
          Track onboarding and staff-invite emails with Send vs Resend. Counts start from when
          tracking was enabled.
        </p>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <FilterSelect
          id="mail-period"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          options={PERIOD_OPTIONS}
          className="w-[8.5rem]"
        />
        {period === 'day' ? (
          <DatePicker
            id="mail-day"
            value={day}
            onChange={(value) => setDay(value || toYmd(new Date()))}
            clearable={false}
            className="w-[11rem]"
          />
        ) : null}
        {period === 'month' ? (
          <>
            <FilterSelect
              id="mail-month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              options={MONTH_OPTIONS.filter((o) => o.value)}
              className="w-[9rem]"
            />
            <FilterSelect
              id="mail-month-year"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              options={yearOptions.filter((o) => o.value)}
              className="w-[7rem]"
            />
          </>
        ) : null}
        {period === 'year' ? (
          <FilterSelect
            id="mail-year"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            options={yearOptions.filter((o) => o.value)}
            className="w-[7rem]"
          />
        ) : null}
        <FilterSelect
          id="mail-type"
          value={mailType}
          onChange={(e) => setMailType(e.target.value)}
          options={TYPE_OPTIONS}
          className="w-[10rem]"
        />
        <FilterSelect
          id="mail-kind"
          value={sendKind}
          onChange={(e) => setSendKind(e.target.value)}
          options={KIND_OPTIONS}
          className="w-[8.5rem]"
        />
        <FilterSelect
          id="mail-status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          options={STATUS_OPTIONS}
          className="w-[9rem]"
        />
      </div>

      {error ? (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatCard label="Total" value={loading && !stats ? '—' : Number(stats?.total) || 0} />
        <StatCard label="Send" value={loading && !stats ? '—' : Number(stats?.send) || 0} />
        <StatCard label="Resend" value={loading && !stats ? '—' : Number(stats?.resend) || 0} />
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <TypeBreakdown
          title="Onboarding"
          stats={stats?.by_type?.onboarding || { total: 0, send: 0, resend: 0 }}
        />
        <TypeBreakdown
          title="Staff invite"
          stats={stats?.by_type?.staff_invite || { total: 0, send: 0, resend: 0 }}
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Kind</th>
                <th className="px-4 py-3">Recipient</th>
                <th className="px-4 py-3">Actor</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    Loading…
                  </td>
                </tr>
              ) : null}
              {!loading && items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    No mail events in this range.
                  </td>
                </tr>
              ) : null}
              {items.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50/80">
                  <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                    {formatWhen(row.created_at)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-800">
                    {TYPE_LABELS[row.mail_type] || row.mail_type || '—'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-800">
                    {KIND_LABELS[row.send_kind] || row.send_kind || '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-800">
                    <div className="font-medium">{row.recipient_name || '—'}</div>
                    <div className="text-xs text-slate-500">{row.recipient_email || '—'}</div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                    {row.actor_name || '—'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                    {row.client_name || '—'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span
                      className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${statusClass(row.status)}`}
                    >
                      {STATUS_LABELS[row.status] || row.status || '—'}
                    </span>
                  </td>
                  <td className="max-w-[14rem] truncate px-4 py-3 text-slate-500" title={row.error || ''}>
                    {row.error || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {nextCursor ? (
          <div className="border-t border-slate-100 px-4 py-3">
            <button
              type="button"
              onClick={() => load({ append: true, cursor: nextCursor })}
              disabled={loadingMore}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          </div>
        ) : null}
      </div>
    </main>
  );
}
