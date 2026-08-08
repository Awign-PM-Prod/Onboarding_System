import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import SuperAdminDashboardCharts from '../components/SuperAdminDashboardCharts';

const POLL_MS = 15000;

function Card({ title, value, tone = 'slate' }) {
  const valueClass =
    tone === 'emerald'
      ? 'text-emerald-700'
      : tone === 'rose'
        ? 'text-rose-700'
        : tone === 'indigo'
          ? 'text-indigo-700'
          : tone === 'amber'
            ? 'text-amber-700'
            : 'text-slate-900';
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{title}</p>
      <p className={`mt-1 text-2xl font-semibold ${valueClass}`}>{value}</p>
    </div>
  );
}

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
  const [stats, setStats] = useState({
    totals: EMPTY,
    compliance: EMPTY_COMPLIANCE,
    clients: []
  });

  const softRefresh = useCallback(async () => {
    try {
      const data = await api.getSuperAdminDashboardStats();
      setStats(applyStatsPayload(data));
      setError('');
    } catch {
      // Keep current UI on background refresh failure.
    }
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    api
      .getSuperAdminDashboardStats()
      .then((data) => {
        if (!active) return;
        setStats(applyStatsPayload(data));
      })
      .catch((err) => {
        if (!active) return;
        setError(err.message || 'Could not load dashboard stats.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // Quiet poll so charts/KPIs stay current without a full loading flash.
  useEffect(() => {
    const tick = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      softRefresh();
    };
    const intervalId = setInterval(tick, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') softRefresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [softRefresh]);

  const t = stats.totals;
  const c = stats.compliance;

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Super Admin Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">
          Org-wide analytics, compliance, and client operations. Charts refresh automatically.
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
          <SuperAdminDashboardCharts totals={t} clients={stats.clients} />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Card title="Clients" value={t.clients} tone="indigo" />
            <Card title="Employees" value={t.employees} />
            <Card title="Active (PL approved − dropout)" value={t.active_employees} tone="emerald" />
            <Card title="Dropout" value={t.total_dropout} tone="rose" />
            <Card title="Onboarding Activations" value={t.onboarding_activations} tone="indigo" />
            <Card title="Employees Submitted" value={t.employees_submitted} />
            <Card title="Submission Pending" value={t.submission_pending} tone="amber" />
            <Card title="PM Approved" value={t.pm_approved} tone="emerald" />
            <Card title="PM Rejected" value={t.pm_rejected} tone="rose" />
            <Card title="Correction Requested" value={t.pm_correction_requested} tone="amber" />
            <Card title="Payroll Approved" value={t.payroll_approved} tone="emerald" />
            <Card title="Payroll Rejected" value={t.payroll_rejected} tone="rose" />
          </div>

          <div className="mt-6">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Compliance</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <Card title="Forms Submitted" value={c.form_submitted} tone="indigo" />
              <Card title="With UAN" value={c.with_uan} tone="emerald" />
              <Card title="Without UAN" value={c.without_uan} tone="amber" />
              <Card title="ESIC under limit (with)" value={c.with_esic_under_limit} tone="emerald" />
              <Card title="ESIC under limit (without)" value={c.without_esic_under_limit} tone="amber" />
              <Card title="Outside ESIC limit" value={c.outside_esic_limit} />
            </div>
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
                      <th className="px-3 py-2 text-left font-medium">Employees</th>
                      <th className="px-3 py-2 text-left font-medium">Activations</th>
                      <th className="px-3 py-2 text-left font-medium">Submitted</th>
                      <th className="px-3 py-2 text-left font-medium">Pending</th>
                      <th className="px-3 py-2 text-left font-medium">PM Approved</th>
                      <th className="px-3 py-2 text-left font-medium">PL Approved</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {stats.clients.map((row) => (
                      <tr key={row.client_id}>
                        <td className="px-3 py-2">
                          <Link
                            to={`/super-admin/client/${row.client_id}/dashboard`}
                            className="font-medium text-indigo-700 hover:underline"
                          >
                            {row.client_name}
                          </Link>
                          <div className="text-xs text-slate-500">{row.contract_code || '-'}</div>
                        </td>
                        <td className="px-3 py-2 text-slate-700">{row.employee_count}</td>
                        <td className="px-3 py-2 text-slate-700">{row.onboarding_activations}</td>
                        <td className="px-3 py-2 text-slate-700">{row.employees_submitted}</td>
                        <td className="px-3 py-2 text-amber-700">{row.submission_pending}</td>
                        <td className="px-3 py-2 text-emerald-700">{row.pm_approved}</td>
                        <td className="px-3 py-2 text-emerald-700">{row.payroll_approved}</td>
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
