import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { formatContractPeriod } from '../lib/clientCsv';
import ClientCsvImportModal from '../components/ClientCsvImportModal';

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function PayrollLeadClientsPage() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [search, setSearch] = useState('');
  const [exportingId, setExportingId] = useState(null);
  const [showImport, setShowImport] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    setActionError('');
    try {
      const data = await api.listClients();
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

  const downloadTemplate = async () => {
    setActionError('');
    try {
      const blob = await api.downloadClientCsvTemplate();
      downloadBlob(blob, 'client-creation-template.csv');
    } catch (err) {
      setActionError(err.message || 'Could not download CSV template.');
    }
  };

  const exportClient = async (client) => {
    setExportingId(client.id);
    setActionError('');
    try {
      const blob = await api.exportClientCsv(client.id);
      const safeCode = String(client.contract_code || 'client')
        .replace(/[^a-zA-Z0-9_-]+/g, '-')
        .slice(0, 40);
      downloadBlob(blob, `client-${safeCode}-export.csv`);
    } catch (err) {
      setActionError(err.message || 'Could not export client details.');
    } finally {
      setExportingId(null);
    }
  };

  const filtered = clients.filter((c) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      c.client_name?.toLowerCase().includes(q) ||
      c.contract_code?.toLowerCase().includes(q) ||
      c.program_manager_name?.toLowerCase().includes(q) ||
      c.entity?.toLowerCase().includes(q) ||
      c.state?.toLowerCase().includes(q)
    );
  });

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Clients</h1>
          <p className="mt-1 text-sm text-slate-500">
            Select a client to open its workspace, or add a new client.
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
          <div className="min-w-0 flex-1 sm:w-64 sm:flex-none">
            <input
              type="search"
              placeholder="Search clients…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <button
            type="button"
            onClick={downloadTemplate}
            className="inline-flex shrink-0 items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            CSV Template
          </button>
          <button
            type="button"
            onClick={() => setShowImport(true)}
            className="inline-flex shrink-0 items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Import CSV
          </button>
          <Link
            to="/clients/new"
            className="inline-flex shrink-0 items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
          >
            Add Client
          </Link>
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

      {actionError && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {actionError}
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <p className="font-medium text-slate-700">
            {search ? 'No clients match your search.' : 'No clients yet.'}
          </p>
          {!search && (
            <Link
              to="/clients/new"
              className="mt-3 inline-flex text-sm font-medium text-indigo-700 hover:underline"
            >
              Add your first client
            </Link>
          )}
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">
              {search
                ? `${filtered.length} result${filtered.length !== 1 ? 's' : ''}`
                : `${clients.length} client${clients.length !== 1 ? 's' : ''}`}
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">Client</th>
                  <th className="px-4 py-2.5 text-left font-medium">Entity</th>
                  <th className="px-4 py-2.5 text-left font-medium">State</th>
                  <th className="px-4 py-2.5 text-left font-medium">Contract Code</th>
                  <th className="px-4 py-2.5 text-left font-medium">Program Manager</th>
                  <th className="px-4 py-2.5 text-left font-medium">Contract Period</th>
                  <th className="px-4 py-2.5 text-left font-medium">Insurance</th>
                  <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link
                        to={`/dashboard/client/${c.id}/dashboard`}
                        className="font-medium text-indigo-700 hover:underline"
                      >
                        {c.client_name}
                      </Link>
                      {c.designations?.length > 0 && (
                        <p className="mt-0.5 text-xs text-slate-500">
                          {c.designations.slice(0, 3).join(', ')}
                          {c.designations.length > 3 && ` +${c.designations.length - 3} more`}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{c.entity || '—'}</td>
                    <td className="px-4 py-3 text-slate-700">{c.state || '—'}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-700">
                      {c.contract_code || '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{c.program_manager_name || '—'}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-500">
                      {formatContractPeriod(
                        c.contract_start_date,
                        c.contract_end_date,
                        c.open_ended_contract
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {c.insurance_applicable ? (
                        <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                          {c.insurance_name || 'Yes'}
                          {c.insurance_amount != null && c.insurance_amount !== ''
                            ? ` · ₹${Number(c.insurance_amount).toLocaleString('en-IN')}`
                            : ''}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">None</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <button
                          type="button"
                          disabled={exportingId === c.id}
                          onClick={() => exportClient(c)}
                          className="text-sm font-medium text-slate-600 hover:text-indigo-700 hover:underline disabled:opacity-60"
                        >
                          {exportingId === c.id ? 'Exporting…' : 'Export'}
                        </button>
                        <Link
                          to={`/clients/${c.id}/edit`}
                          className="text-sm font-medium text-slate-600 hover:text-indigo-700 hover:underline"
                        >
                          Edit
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showImport && (
        <ClientCsvImportModal
          onClose={() => setShowImport(false)}
          onDone={() => {
            setShowImport(false);
            load();
          }}
        />
      )}
    </main>
  );
}
