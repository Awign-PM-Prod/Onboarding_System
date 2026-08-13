import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useWorkspacePaths } from '../context/WorkspaceBasePath';
import DashboardStatCard, { DASHBOARD_STAT_GRID_CLASS, DASHBOARD_STAT_ICONS } from '../components/DashboardStatCard';
import SuperAdminDateRangeFilters from '../components/SuperAdminDateRangeFilters';
import RoleDashboardCharts from '../components/RoleDashboardCharts';
import { resolveDashboardDateRange } from '../lib/superAdminDateRange';

const STAT_ICONS = DASHBOARD_STAT_ICONS;

export default function PayrollLeadDashboardHome() {
  const paths = useWorkspacePaths();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stats, setStats] = useState({ totals: null, clients: [] });
  const [clientOptions, setClientOptions] = useState([]);
  const [clientId, setClientId] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [week, setWeek] = useState('');
  const [preset, setPreset] = useState('');
  const [appliedCustomFrom, setAppliedCustomFrom] = useState('');
  const [appliedCustomTo, setAppliedCustomTo] = useState('');

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

  useEffect(() => {
    let active = true;
    api
      .listClients()
      .then((rows) => {
        if (!active) return;
        const list = Array.isArray(rows) ? rows : [];
        const mine = user?.id
          ? list.filter((c) => c.created_by === user.id)
          : list;
        setClientOptions(
          mine.map((c) => ({
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
  }, [user?.id]);

  useEffect(() => {
    if (clientId && clientOptions.length > 0 && !clientOptions.some((c) => c.id === clientId)) {
      setClientId('');
    }
  }, [clientId, clientOptions]);

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
    clients: 0,
    employees: 0,
    onboarding_activations: 0,
    employees_submitted: 0,
    submission_pending: 0,
    awaiting_pm: 0,
    pm_approved: 0,
    pm_rejected: 0,
    pm_correction_requested: 0,
    awaiting_pl: 0,
    payroll_approved: 0,
    payroll_rejected: 0,
    total_onboarded: 0,
    total_dropout: 0,
    active_employees: 0
  };

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Payroll Lead Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">
          Role analytics for payroll decisions, onboarded headcount, and active vs dropout across clients you created.
        </p>
      </div>

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="pl-dashboard-client">
            Client
          </label>
          <select
            id="pl-dashboard-client"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="w-36 max-w-full shrink-0 appearance-none rounded-lg border border-slate-200 bg-white py-2.5 pl-3.5 pr-9 text-sm font-medium text-slate-800 shadow-sm hover:border-slate-300 focus:border-slate-400 focus:outline-none"
          >
            <option value="">All clients</option>
            {clientOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <SuperAdminDateRangeFilters
          idPrefix="pl-dashboard"
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
          Loading dashboard...
        </div>
      )}
      {error && !loading && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>
      )}

      {!loading && !error && (
        <>
          <RoleDashboardCharts role="pl" totals={t} clients={stats.clients} />

          <div className={DASHBOARD_STAT_GRID_CLASS}>
            <DashboardStatCard title="Clients" value={t.clients} tone="indigo" icon={STAT_ICONS.building} />
            <DashboardStatCard title="Employees" value={t.employees} tone="indigo" icon={STAT_ICONS.users} />
            <DashboardStatCard
              title="Awaiting PL Review"
              value={t.awaiting_pl}
              tone="amber"
              icon={STAT_ICONS.pending}
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
              tone="rose"
              icon={STAT_ICONS.rejected}
            />
            <DashboardStatCard
              title="Total Onboarded"
              value={t.total_onboarded}
              tone="indigo"
              icon={STAT_ICONS.check}
            />
            <DashboardStatCard
              title="Active"
              value={t.active_employees}
              tone="emerald"
              icon={STAT_ICONS.approved}
            />
            <DashboardStatCard title="Dropout" value={t.total_dropout} tone="rose" icon={STAT_ICONS.rejected} />
            <DashboardStatCard
              title="PM Approved"
              value={t.pm_approved}
              tone="emerald"
              icon={STAT_ICONS.approved}
            />
            <DashboardStatCard
              title="Onboarding Activations"
              value={t.onboarding_activations}
              tone="indigo"
              icon={STAT_ICONS.activations}
            />
            <DashboardStatCard
              title="Submission Pending"
              value={t.submission_pending}
              tone="amber"
              icon={STAT_ICONS.pending}
            />
            <DashboardStatCard
              title="PM Rejected"
              value={t.pm_rejected}
              tone="rose"
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
