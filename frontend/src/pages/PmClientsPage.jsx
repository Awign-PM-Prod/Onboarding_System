import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { formatContractPeriod } from '../lib/clientCsv';

const REMARK_BADGES = {
  PL_REJECTED: {
    label: 'PL Rejected',
    className: 'bg-rose-50 text-rose-700 ring-rose-200',
  },
  AWAITING_PM_REVIEW: {
    label: 'Awaiting PM Review',
    className: 'bg-violet-50 text-violet-700 ring-violet-200',
  },
  DATE_JOINING_EXTENDED: {
    label: 'Date Joining Extended',
    className: 'bg-sky-50 text-sky-700 ring-sky-200',
  },
  JOINING_OVERDUE: {
    label: 'Joining Overdue',
    className: 'bg-orange-50 text-orange-700 ring-orange-200',
  },
  CORRECTION_REQUESTED: {
    label: 'Correction Requested',
    className: 'bg-amber-50 text-amber-800 ring-amber-200',
  },
  PENDING_ONBOARDING: {
    label: 'Pending Onboarding',
    className: 'bg-yellow-50 text-yellow-800 ring-yellow-200',
  },
};

function RemarkBadge({ remark }) {
  const badge = REMARK_BADGES[remark];
  if (!badge) return <span className="text-slate-400">—</span>;
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${badge.className}`}
    >
      {badge.label}
    </span>
  );
}

function compareClientsByAttention(a, b, direction) {
  const dir = direction === 'asc' ? 1 : -1;
  const aCount = Number(a.open_change_count) || 0;
  const bCount = Number(b.open_change_count) || 0;
  const aPending = aCount > 0 ? 1 : 0;
  const bPending = bCount > 0 ? 1 : 0;
  if (aPending !== bPending) return (aPending - bPending) * dir;
  if (aCount !== bCount) return (aCount - bCount) * dir;
  return String(a.client_name || '').localeCompare(String(b.client_name || '')) * dir;
}

export default function PmClientsPage() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [sortDir, setSortDir] = useState('desc');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.listPmClients();
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

  const filtered = clients
    .filter((c) => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return (
        c.client_name?.toLowerCase().includes(q) ||
        c.contract_code?.toLowerCase().includes(q)
      );
    })
    .slice()
    .sort((a, b) => compareClientsByAttention(a, b, sortDir));

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Clients</h1>
          <p className="mt-1 text-sm text-slate-500">
            Clients where you are the Program Manager. Select one to open its workspace.
          </p>
        </div>
        <div className="w-full min-w-0 sm:w-64 sm:shrink-0">
          <input
            type="search"
            placeholder="Search clients…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
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
            {search ? 'No clients match your search.' : 'No assigned clients found.'}
          </p>
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
                  <th className="px-4 py-2.5 text-left font-medium">
                    <button
                      type="button"
                      onClick={() => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))}
                      className="inline-flex items-center gap-1 font-medium text-slate-600 hover:text-slate-900"
                      title="Sort by pending changements"
                      aria-label={`Sort clients by pending changements, currently ${sortDir === 'desc' ? 'highest first' : 'lowest first'}`}
                    >
                      Client
                      <span className="inline-flex flex-col text-[10px] leading-none text-slate-400" aria-hidden>
                        <span className={sortDir === 'asc' ? 'text-slate-700' : ''}>▲</span>
                        <span className={sortDir === 'desc' ? 'text-slate-700' : ''}>▼</span>
                      </span>
                    </button>
                  </th>
                  <th className="px-4 py-2.5 text-left font-medium">Contract Code</th>
                  <th className="px-4 py-2.5 text-left font-medium">Contract Period</th>
                  <th className="px-4 py-2.5 text-left font-medium">Designations</th>
                  <th className="px-4 py-2.5 text-left font-medium">Remark/Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link
                        to={`/pm-dashboard/client/${c.id}/dashboard`}
                        className="font-medium text-indigo-700 hover:underline"
                      >
                        {c.client_name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-700">
                      {c.contract_code || '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-500">
                      {formatContractPeriod(
                        c.contract_start_date,
                        c.contract_end_date,
                        c.open_ended_contract
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {c.designations?.length > 0 ? (
                        <>
                          {c.designations
                            .slice(0, 3)
                            .map((d) => (d && typeof d === 'object' ? d.name : d))
                            .filter(Boolean)
                            .join(', ')}
                          {c.designations.length > 3 && ` +${c.designations.length - 3} more`}
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <RemarkBadge remark={c.primary_remark} />
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
