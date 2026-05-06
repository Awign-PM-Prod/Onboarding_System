import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';

export default function PayrollClientDashboardHome() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api
      .listClients()
      .then((rows) => {
        if (active) setClients(rows || []);
      })
      .catch((err) => {
        if (active) setError(err.message || 'Could not load client.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const client = useMemo(() => clients.find((c) => c.id === id) || null, [clients, id]);

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{client?.client_name || 'Client Dashboard'}</h1>
          <p className="mt-1 text-sm text-slate-500">Dashboard is intentionally empty for now.</p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/dashboard')}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
        >
          Back to Clients
        </button>
      </div>
      {loading && (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-500">Loading client...</div>
      )}
      {error && !loading && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>
      )}
      {!loading && !error && (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          No dashboard widgets configured yet.
        </div>
      )}
    </main>
  );
}
