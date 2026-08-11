import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useWorkspacePaths } from '../context/WorkspaceBasePath';
import DashboardStatCard, { DASHBOARD_STAT_ICONS } from '../components/DashboardStatCard';
import SuperAdminDateRangeFilters from '../components/SuperAdminDateRangeFilters';
import RoleDashboardCharts from '../components/RoleDashboardCharts';
import { resolveDateRange } from '../lib/superAdminDateRange';

const STAT_ICONS = DASHBOARD_STAT_ICONS;

export default function PayrollLeadDashboardHome() {
  const paths = useWorkspacePaths();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stats, setStats] = useState({ totals: null, clients: [] });
  const [clientOptions, setClientOptions] = useState([]);
  const [clientId, setClientId] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [week, setWeek] = useState('');
  const [appliedCustomFrom, setAppliedCustomFrom] = useState('');
  const [appliedCustomTo, setAppliedCustomTo] = useState('');

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

  const rangeHint = useMemo(() => {
    if (dateRange.from && dateRange.to) return `${dateRange.from} → ${dateRange.to}`;
    if (dateRange.from) return `From ${dateRange.from}`;
    if (dateRange.to) return `Until ${dateRange.to}`;
    return 'All time';
  }, [dateRange.from, dateRange.to]);

  useEffect(() => {
    let active = true;
    api
      .listClients()
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

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.getPayrollDashboardStats({
        from: dateRange.from,
        to: dateRange.to,
        client_id: clientId || undefined
      });
      setStats({
        totals: data?.totals || null,
        clients: Array.isArray(data?.clients) ? data.clients : []
      });
    } catch (err) {
      setError(err.message || 'Could not load dashboard stats.');
      setStats({ totals: null, clients: [] });
    } finally {
      setLoading(false);
    }
  }, [clientId, dateRange.from, dateRange.to]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const t = stats.totals || {
    onboarding_activations: 0,
    employees_submitted: 0,
    submission_pending: 0,
    pm_approved: 0,
    pm_rejected: 0,
    payroll_approved: 0,
    payroll_rejected: 0
  };

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Payroll Lead Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">
          Overall onboarding performance across your created clients.
        </p>
      </div>

      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <label className="sr-only" htmlFor="pl-dashboard-client">
            Client
          </label>
          <select
            id="pl-dashboard-client"
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
            idPrefix="pl-dashboard"
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

      {!loading && !error && (
        <>
          <RoleDashboardCharts role="pl" totals={t} clients={stats.clients} />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <DashboardStatCard
              title="Onboarding Activations"
              value={t.onboarding_activations}
              tone="emerald"
              icon={STAT_ICONS.activations}
            />
            <DashboardStatCard
              title="Employees Submitted"
              value={t.employees_submitted}
              tone="amber"
              icon={STAT_ICONS.submitted}
            />
            <DashboardStatCard
              title="Submission Pending"
              value={t.submission_pending}
              tone="violet"
              icon={STAT_ICONS.pending}
            />
            <DashboardStatCard
              title="PM Approved"
              value={t.pm_approved}
              tone="violet"
              icon={STAT_ICONS.approved}
            />
            <DashboardStatCard
              title="PM Rejected"
              value={t.pm_rejected}
              tone="rose"
              icon={STAT_ICONS.rejected}
            />
            <DashboardStatCard
              title="Payroll Approved"
              value={t.payroll_approved}
              tone="emerald"
              icon={STAT_ICONS.check}
            />
            <DashboardStatCard
              title="Payroll Rejected"
              value={t.payroll_rejected}
              tone="amber"
              icon={STAT_ICONS.rejected}
            />
          </div>

          <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-900">Client-wise Breakdown</h2>
              <p className="text-xs text-slate-500">{stats.clients.length} clients</p>
            </div>
            {stats.clients.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500">No clients found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Client</th>
                      <th className="px-3 py-2 text-left font-medium">Activations</th>
                      <th className="px-3 py-2 text-left font-medium">Submitted</th>
                      <th className="px-3 py-2 text-left font-medium">Pending</th>
                      <th className="px-3 py-2 text-left font-medium">PM Approved</th>
                      <th className="px-3 py-2 text-left font-medium">PM Rejected</th>
                      <th className="px-3 py-2 text-left font-medium">PL Approved</th>
                      <th className="px-3 py-2 text-left font-medium">PL Rejected</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {stats.clients.map((c) => (
                      <tr key={c.client_id}>
                        <td className="px-3 py-2">
                          <Link
                            to={paths.client(c.client_id, 'dashboard')}
                            className="font-medium text-indigo-700 hover:underline"
                          >
                            {c.client_name}
                          </Link>
                          <div className="text-xs text-slate-500">{c.contract_code || '-'}</div>
                        </td>
                        <td className="px-3 py-2 text-slate-700">{c.onboarding_activations}</td>
                        <td className="px-3 py-2 text-slate-700">{c.employees_submitted}</td>
                        <td className="px-3 py-2 text-amber-700">{c.submission_pending}</td>
                        <td className="px-3 py-2 text-emerald-700">{c.pm_approved}</td>
                        <td className="px-3 py-2 text-rose-700">{c.pm_rejected}</td>
                        <td className="px-3 py-2 text-emerald-700">{c.payroll_approved}</td>
                        <td className="px-3 py-2 text-rose-700">{c.payroll_rejected}</td>
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
