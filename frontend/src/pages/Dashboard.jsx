import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';

export default function Dashboard() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.listClients();
      setClients(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Clients</h1>
            <p className="text-sm text-slate-500">Manage your client contracts.</p>
          </div>
          <Link
            to="/clients/new"
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-md px-4 py-2"
          >
            + Add Client
          </Link>
        </div>

        {loading && (
          <div className="bg-white border border-slate-200 rounded-lg p-8 text-center text-slate-500">
            Loading clients...
          </div>
        )}

        {error && !loading && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 flex items-center justify-between">
            <span>{error}</span>
            <button
              onClick={load}
              className="text-sm underline"
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && clients.length === 0 && (
          <div className="bg-white border border-slate-200 rounded-lg p-10 text-center">
            <p className="text-slate-700 font-medium">No clients yet</p>
            <p className="text-sm text-slate-500 mt-1 mb-4">Create your first one to get started.</p>
            <Link
              to="/clients/new"
              className="inline-block bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-md px-4 py-2"
            >
              + Add Client
            </Link>
          </div>
        )}

        {!loading && !error && clients.length > 0 && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {clients.map((c) => (
              <Link
                key={c.id}
                to={`/dashboard/client/${c.id}/dashboard`}
                className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-indigo-300 hover:shadow-md"
              >
                <h3 className="font-semibold text-slate-900 group-hover:text-indigo-700">{c.client_name}</h3>
                <p className="mt-1 text-xs text-slate-500">{c.contract_code}</p>
              </Link>
            ))}
          </div>
        )}
      </main>
  );
}
