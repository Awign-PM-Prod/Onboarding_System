import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import DashboardStatCard, { DASHBOARD_STAT_ICONS } from '../components/DashboardStatCard';
import SuperAdminDashboardCharts from '../components/SuperAdminDashboardCharts';
import SuperAdminDateRangeFilters from '../components/SuperAdminDateRangeFilters';
import { resolveDateRange } from '../lib/superAdminDateRange';

const POLL_MS = 15000;
const ICONS = DASHBOARD_STAT_ICONS;

const EMPTY = {
  clients: 0,
  employees: 0,
  onboarding_activations: 0,
  employees_submitted: 0,
  submission_pending: 0,
  pm_approved: 0,
  pm_rejected: 0,
  pm_correction_requested: 0,
  payroll_approved: 0,
  payroll_rejected: 0,
  total_onboarded: 0,
  total_dropout: 0,
  active_employees: 0
};

const EMPTY_COMPLIANCE = {
  form_submitted: 0,
  with_uan: 0,
  without_uan: 0,
  with_esic_under_limit: 0,
  without_esic_under_limit: 0,
  outside_esic_limit: 0
};

const EMPTY_STATS = {
  totals: EMPTY,
  compliance: EMPTY_COMPLIANCE,
  clients: []
};

function applyStatsPayload(data) {
  return {
    totals: { ...EMPTY, ...(data?.totals || {}) },
    compliance: { ...EMPTY_COMPLIANCE, ...(data?.compliance || {}) },
    clients: Array.isArray(data?.clients) ? data.clients : []
  };
}

export default function SuperAdminDashboardHome() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stats, setStats] = useState(EMPTY_STATS);
  const [clientOptions, setClientOptions] = useState([]);
  const [clientId, setClientId] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [week, setWeek] = useState('');
  const [appliedCustomFrom, setAppliedCustomFrom] = useState('');
  const [appliedCustomTo, setAppliedCustomTo] = useState('');
  const requestSeqRef = useRef(0);
  const loadingRef = useRef(true);

  const dateRange = useMemo(
    () =>
      resolveDateRange({
        month,
        year,
        week,
        customFrom: appliedCustomFrom,
        customTo: appliedCustomTo
      }),
    [appliedCustomFrom, appliedCustomTo, month, year, week]
  );

  const hasDateFilter = Boolean(dateRange.from || dateRange.to);

  const rangeHint = useMemo(() => {
    if (dateRange.from && dateRange.to) return `${dateRange.from} → ${dateRange.to}`;
    if (dateRange.from) return `From ${dateRange.from}`;
    if (dateRange.to) return `Until ${dateRange.to}`;
    return 'All time';
  }, [dateRange.from, dateRange.to]);

  useEffect(() => {
    let active = true;
    api
      .listSuperAdminClients()
      .then((rows) => {
        if (!active) return;
        const list = Array.isArray(rows) ? rows : [];
        setClientOptions(
          list.map((c) => ({
            id: c.id,
            label: c.contract_code ? `${c.client_name} (${c.contract_code})` : c.client_name
          }))
        );
      })
      .catch(() => {
        if (!active) return;
        setClientOptions([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const fetchStats = useCallback(
    async ({ soft = false } = {}) => {
      const seq = ++requestSeqRef.current;
      const from = dateRange.from;
      const to = dateRange.to;

      if (!soft) {
        loadingRef.current = true;
        setLoading(true);
        setError('');
        // Drop previous period’s numbers immediately so stale all-time data can’t linger.
        setStats(EMPTY_STATS);
      }

      try {
        const data = await api.getSuperAdminDashboardStats({
          from,
          to,
          client_id: clientId || undefined
        });
        if (seq !== requestSeqRef.current) return;
        setStats(applyStatsPayload(data));
        if (!soft) setError('');
      } catch (err) {
        if (seq !== requestSeqRef.current) return;
        if (!soft) {
          setError(err.message || 'Could not load dashboard stats.');
          setStats(EMPTY_STATS);
        }
        // Soft refresh failures keep the last good filtered payload.
      } finally {
        if (!soft && seq === requestSeqRef.current) {
          loadingRef.current = false;
          setLoading(false);
        }
      }
    },
    [clientId, dateRange.from, dateRange.to]
  );

  useEffect(() => {
    fetchStats({ soft: false });
  }, [fetchStats]);

  // Quiet poll so charts/KPIs stay current without a full loading flash.
  useEffect(() => {
    const tick = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      if (loadingRef.current) return;
      fetchStats({ soft: true });
    };
    const intervalId = setInterval(tick, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [fetchStats]);

  const t = stats.totals;
  const c = stats.compliance;
  const isEmptyPeriod = !loading && !error && t.employees === 0;

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Super Admin Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">
          Org-wide analytics, compliance, and client operations. Charts refresh automatically.
        </p>
      </div>

      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <label className="sr-only" htmlFor="dashboard-client">
            Client
          </label>
          <select
            id="dashboard-client"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="appearance-none rounded-lg border border-slate-200 bg-white py-2.5 pl-3.5 pr-9 text-sm font-medium text-slate-800 shadow-sm hover:border-slate-300 focus:border-slate-400 focus:outline-none"
          >
            <option value="">All clients</option>
            {clientOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <SuperAdminDateRangeFilters
            idPrefix="dashboard"
            month={month}
            year={year}
            week={week}
            appliedCustomFrom={appliedCustomFrom}
            appliedCustomTo={appliedCustomTo}
            onMonthChange={(value) => {
              setMonth(value);
              if (value && !year) setYear(String(new Date().getFullYear()));
              if (value) setWeek('');
            }}
            onYearChange={(value) => {
              setYear(value);
              if (value) setWeek('');
            }}
            onWeekChange={(value) => {
              setWeek(value);
              if (value) {
                setMonth('');
                setYear('');
              }
            }}
            onCustomClear={() => {
              setAppliedCustomFrom('');
              setAppliedCustomTo('');
            }}
            onCustomApply={(from, to) => {
              setError('');
              setAppliedCustomFrom(from);
              setAppliedCustomTo(to);
              setMonth('');
              setYear('');
              setWeek('');
            }}
            onCustomError={(message) => setError(message)}
          />
        </div>
        <p className="text-xs text-slate-500">
          Showing employees created: <span className="font-medium text-slate-700">{rangeHint}</span>
        </p>
      </div>

      {loading && (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-500 shadow-sm">
          Loading dashboard...
        </div>
      )}
      {error && !loading && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>
      )}

      {!loading && !error && isEmptyPeriod && (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-500 shadow-sm">
          {hasDateFilter
            ? 'No employees were created in this period, so pipeline metrics are empty.'
            : 'No employees found.'}
        </div>
      )}

      {!loading && !error && !isEmptyPeriod && (
        <>
          <SuperAdminDashboardCharts totals={t} clients={stats.clients} />

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            <DashboardStatCard title="Clients" value={t.clients} tone="indigo" icon={ICONS.building} />
            <DashboardStatCard title="Employees" value={t.employees} tone="indigo" icon={ICONS.users} />
            <DashboardStatCard
              title="Onboarding Activations"
              value={t.onboarding_activations}
              tone="indigo"
              icon={ICONS.activations}
            />
            <DashboardStatCard
              title="Employees Submitted"
              value={t.employees_submitted}
              tone="indigo"
              icon={ICONS.submitted}
            />
            <DashboardStatCard
              title="Submission Pending"
              value={t.submission_pending}
              tone="amber"
              icon={ICONS.pending}
            />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            <DashboardStatCard
              title="Active"
              value={t.active_employees}
              tone="emerald"
              icon={ICONS.check}
            />
            <DashboardStatCard
              title="PL Approved"
              value={t.payroll_approved}
              tone="emerald"
              icon={ICONS.approved}
            />
            <DashboardStatCard title="Dropout" value={t.total_dropout} tone="rose" icon={ICONS.rejected} />
            <DashboardStatCard title="PM Approved" value={t.pm_approved} tone="emerald" icon={ICONS.approved} />
            <DashboardStatCard title="PM Rejected" value={t.pm_rejected} tone="rose" icon={ICONS.rejected} />
            <DashboardStatCard
              title="PM Correction Requested"
              value={t.pm_correction_requested}
              tone="amber"
              icon={ICONS.correction}
            />
            <DashboardStatCard
              title="PL Rejected"
              value={t.payroll_rejected}
              tone="rose"
              icon={ICONS.rejected}
            />
          </div>

          <div className="mt-6">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Compliance</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
              <DashboardStatCard
                title="Form Submitted"
                value={c.form_submitted}
                tone="indigo"
                icon={ICONS.document}
              />
              <DashboardStatCard title="With UAN" value={c.with_uan} tone="emerald" icon={ICONS.check} />
              <DashboardStatCard title="Without UAN" value={c.without_uan} tone="amber" icon={ICONS.pending} />
              <DashboardStatCard
                title="With ESIC Under Limit"
                value={c.with_esic_under_limit}
                tone="emerald"
                icon={ICONS.check}
              />
              <DashboardStatCard
                title="Without ESIC Under Limit"
                value={c.without_esic_under_limit}
                tone="amber"
                icon={ICONS.pending}
              />
              <DashboardStatCard
                title="Outside ESIC Limit"
                value={c.outside_esic_limit}
                tone="slate"
                icon={ICONS.document}
              />
            </div>
          </div>

          <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-900">Client-wise Breakdown</h2>
              <p className="text-xs text-slate-500">
                {stats.clients.length} client{stats.clients.length === 1 ? '' : 's'}
              </p>
            </div>
            {stats.clients.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500">No clients found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-medium">Client</th>
                      <th className="px-4 py-2.5 text-left font-medium">Employees</th>
                      <th className="px-4 py-2.5 text-left font-medium">Activations</th>
                      <th className="px-4 py-2.5 text-left font-medium">Submitted</th>
                      <th className="px-4 py-2.5 text-left font-medium">Pending</th>
                      <th className="px-4 py-2.5 text-left font-medium">PM Approved</th>
                      <th className="px-4 py-2.5 text-left font-medium">PL Approved</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {stats.clients.map((row) => (
                      <tr key={row.client_id} className="hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <Link
                            to={`/super-admin/client/${row.client_id}/dashboard`}
                            className="font-medium text-indigo-700 hover:underline"
                          >
                            {row.client_name}
                          </Link>
                          <div className="mt-0.5 text-xs text-slate-500">{row.contract_code || '—'}</div>
                        </td>
                        <td className="px-4 py-3 text-slate-700">{row.employee_count}</td>
                        <td className="px-4 py-3 text-slate-700">{row.onboarding_activations}</td>
                        <td className="px-4 py-3 text-slate-700">{row.employees_submitted}</td>
                        <td className="px-4 py-3 font-medium text-amber-600">{row.submission_pending}</td>
                        <td className="px-4 py-3 font-medium text-emerald-600">{row.pm_approved}</td>
                        <td className="px-4 py-3 font-medium text-emerald-600">{row.payroll_approved}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </main>
  );
}
