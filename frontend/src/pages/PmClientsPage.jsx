import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';

export default function PmClientsPage() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    api.listPmClients()
      .then((data) => {
        if (active) setClients(data);
      })
      .catch((err) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Assigned clients</h1>
        <p className="mt-1 text-sm text-slate-500">Clients where you are the Program Manager.</p>
      </div>

      {loading && (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-500 shadow-sm">
          Loading clients...
        </div>
      )}

      {error && !loading && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      {!loading && !error && clients.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center shadow-sm">
          <p className="font-medium text-slate-800">No clients assigned to you yet</p>
          <p className="mt-1 text-sm text-slate-500">Ask the Payroll Lead to assign a client to your profile.</p>
        </div>
      )}

      {!loading && !error && clients.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {clients.map((c) => (
            <Link
              key={c.id}
              to={`/pm-dashboard/client/${c.id}/pending`}
              className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-indigo-300 hover:shadow-md"
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-semibold text-slate-900 group-hover:text-indigo-700">{c.client_name}</h3>
                  <p className="mt-0.5 text-xs text-slate-500">{c.contract_code}</p>
                </div>
                {c.insurance_applicable && (
                  <span className="shrink-0 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                    Insured
                  </span>
                )}
              </div>
              <p className="mb-3 text-xs text-slate-500">
                {c.contract_start_date} &rarr; {c.contract_end_date}
              </p>
              <div className="flex flex-wrap gap-1">
                {c.designations.map((d) => (
                  <span key={d} className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                    {d}
                  </span>
                ))}
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
