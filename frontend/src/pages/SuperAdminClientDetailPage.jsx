import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';

function formatPayAmount(payType, ctcType, ctcValue) {
  if (ctcValue === null || ctcValue === undefined || String(ctcValue).trim() === '') return '—';
  const n = Number(ctcValue);
  const formatted = Number.isFinite(n)
    ? n.toLocaleString('en-IN', { maximumFractionDigits: 2 })
    : String(ctcValue);
  const kind = String(payType ?? '').trim().toUpperCase();
  const period = String(ctcType ?? '').trim().toUpperCase();
  if (kind === 'NET_PAY') return `${formatted} (Net Pay)`;
  if (!period) return kind === 'CTC' ? `${formatted} (CTC)` : formatted;
  const periodLabel = period === 'ANNUAL' ? '/ yr' : '/ mo';
  return kind === 'CTC' ? `${formatted} ${periodLabel} (CTC)` : `${formatted} ${periodLabel}`;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function SuperAdminClientDetailPage() {
  const { id } = useParams();
  const [client, setClient] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [downloading, setDownloading] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.getSuperAdminClientEmployees(id);
      setClient(data?.client ?? null);
      setEmployees(Array.isArray(data?.employees) ? data.employees : []);
    } catch (err) {
      setError(err.message || 'Could not load client employees.');
      setClient(null);
      setEmployees([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  const filtered = employees.filter((e) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      e.name?.toLowerCase().includes(q) ||
      e.emp_code?.toLowerCase().includes(q) ||
      e.mobile?.toLowerCase().includes(q) ||
      e.email?.toLowerCase().includes(q) ||
      e.onboarding_status?.toLowerCase().includes(q)
    );
  });

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const blob = await api.downloadSuperAdminMasterReport(id);
      const safeName = (client?.client_name || 'client').replace(/[^\w\-]+/g, '_').slice(0, 40);
      downloadBlob(blob, `master-report-${safeName}.csv`);
    } catch (err) {
      setError(err.message || 'Could not download report.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-4">
        <Link to="/super-admin/clients" className="text-sm text-indigo-700 hover:underline">
          ← All clients
        </Link>
      </div>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            {client?.client_name || (loading ? 'Loading…' : 'Client')}
          </h1>
          {client && (
            <p className="mt-1 text-sm text-slate-500">
              {client.contract_code || '—'}
              {client.state ? ` · ${client.state}` : ''}
              {client.payroll_lead_name ? ` · PL: ${client.payroll_lead_name}` : ''}
              {client.program_manager_name ? ` · PM: ${client.program_manager_name}` : ''}
            </p>
          )}
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <input
            type="search"
            placeholder="Search employees…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm sm:w-56"
          />
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading || loading || !client}
            className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {downloading ? 'Downloading…' : 'Download report'}
          </button>
        </div>
      </div>

      {loading && (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-500 shadow-sm">
          Loading employees…
        </div>
      )}

      {error && !loading && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          <span>{error}</span>
          <button type="button" onClick={load} className="text-sm underline">
            Retry
          </button>
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <p className="font-medium text-slate-700">
            {search ? 'No employees match your search.' : 'No employees for this client.'}
          </p>
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Employee</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                  <th className="px-3 py-2 text-left font-medium">Pay</th>
                  <th className="px-3 py-2 text-left font-medium">State</th>
                  <th className="px-3 py-2 text-left font-medium">Designation</th>
                  <th className="px-3 py-2 text-left font-medium">DOJ</th>
                  <th className="px-3 py-2 text-left font-medium">Reviews</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((e) => (
                  <tr key={e.id}>
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-900">{e.name || '—'}</div>
                      <div className="text-xs text-slate-500">
                        {[e.emp_code, e.mobile].filter(Boolean).join(' · ') || '—'}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-slate-700">{e.onboarding_status || '—'}</td>
                    <td className="px-3 py-2 text-slate-700">
                      {formatPayAmount(e.pay_type, e.ctc_type, e.ctc_value)}
                    </td>
                    <td className="px-3 py-2 text-slate-700">{e.state || '—'}</td>
                    <td className="px-3 py-2 text-slate-700">{e.designation || '—'}</td>
                    <td className="px-3 py-2 text-slate-700">{e.date_of_joining || '—'}</td>
                    <td className="px-3 py-2 text-xs text-slate-600">
                      <div>Form: {e.form_submission_status || '—'}</div>
                      <div>PM: {e.form_review_status || '—'}</div>
                      <div>PL: {e.form_payroll_review_status || '—'}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </main>
  );
}
