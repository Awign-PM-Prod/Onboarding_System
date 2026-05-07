import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';

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

export default function PmDashboardHome() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stats, setStats] = useState({ totals: null, clients: [] });

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    api.getPmDashboardStats()
      .then((data) => {
        if (!active) return;
        setStats({
          totals: data?.totals || null,
          clients: Array.isArray(data?.clients) ? data.clients : []
        });
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

  const t = stats.totals || {
    onboarding_activations: 0,
    employees_submitted: 0,
    submission_pending: 0,
    pm_approved: 0,
    pm_rejected: 0,
    pm_correction_requested: 0,
    payroll_approved: 0,
    payroll_rejected: 0
  };

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Program Manager Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">
          Overall onboarding performance across your assigned clients.
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Card title="Onboarding Activations" value={t.onboarding_activations} tone="indigo" />
            <Card title="Employees Submitted" value={t.employees_submitted} />
            <Card title="Submission Pending" value={t.submission_pending} tone="amber" />
            <Card title="PM Approved" value={t.pm_approved} tone="emerald" />
            <Card title="PM Rejected" value={t.pm_rejected} tone="rose" />
            <Card title="Correction Requested" value={t.pm_correction_requested} tone="amber" />
            <Card title="Payroll Approved" value={t.payroll_approved} tone="emerald" />
            <Card title="Payroll Rejected" value={t.payroll_rejected} tone="rose" />
          </div>

          <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-900">Client-wise Breakdown</h2>
              <p className="text-xs text-slate-500">{stats.clients.length} clients</p>
            </div>
            {stats.clients.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500">No assigned clients found.</div>
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
                      <th className="px-3 py-2 text-left font-medium">Correction Requested</th>
                      <th className="px-3 py-2 text-left font-medium">PL Approved</th>
                      <th className="px-3 py-2 text-left font-medium">PL Rejected</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {stats.clients.map((c) => (
                      <tr key={c.client_id}>
                        <td className="px-3 py-2">
                          <Link
                            to={`/pm-dashboard/client/${c.client_id}/pending`}
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
                        <td className="px-3 py-2 text-amber-700">{c.pm_correction_requested}</td>
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
