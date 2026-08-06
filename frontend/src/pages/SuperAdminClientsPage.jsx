import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function SuperAdminClientsPage() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [downloading, setDownloading] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.listSuperAdminClients();
      setClients(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || 'Could not load clients.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = clients.filter((c) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      c.client_name?.toLowerCase().includes(q) ||
      c.contract_code?.toLowerCase().includes(q) ||
      c.payroll_lead_name?.toLowerCase().includes(q) ||
      c.program_manager_name?.toLowerCase().includes(q) ||
      c.state?.toLowerCase().includes(q)
    );
  });

  const handleDownloadAll = async () => {
    setDownloading(true);
    try {
      const blob = await api.downloadSuperAdminMasterReport();
      downloadBlob(blob, 'master-report-all-clients.csv');
    } catch (err) {
      setError(err.message || 'Could not download master report.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">All Clients</h1>
          <p className="mt-1 text-sm text-slate-500">
            Branch view — open a client to see its employees. Download a master report of all employees.
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <input
            type="search"
            placeholder="Search clients…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:w-64"
          />
          <button
            type="button"
            onClick={handleDownloadAll}
            disabled={downloading || loading}
            className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {downloading ? 'Downloading…' : 'Download master report'}
          </button>
        </div>
      </div>

      {loading && (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-500 shadow-sm">
          Loading clients…
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
            {search ? 'No clients match your search.' : 'No clients found.'}
          </p>
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Client</th>
                  <th className="px-3 py-2 text-left font-medium">State</th>
                  <th className="px-3 py-2 text-left font-medium">Payroll Lead</th>
                  <th className="px-3 py-2 text-left font-medium">Program Manager</th>
                  <th className="px-3 py-2 text-left font-medium">Employees</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/80">
                    <td className="px-3 py-2">
                      <Link
                        to={`/super-admin/clients/${c.id}`}
                        className="font-medium text-indigo-700 hover:underline"
                      >
                        {c.client_name}
                      </Link>
                      <div className="text-xs text-slate-500">{c.contract_code || '—'}</div>
                    </td>
                    <td className="px-3 py-2 text-slate-700">{c.state || '—'}</td>
                    <td className="px-3 py-2 text-slate-700">{c.payroll_lead_name || '—'}</td>
                    <td className="px-3 py-2 text-slate-700">{c.program_manager_name || '—'}</td>
                    <td className="px-3 py-2 text-slate-700">{c.employee_count}</td>
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
