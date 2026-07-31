import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';

export default function PayrollClientAssignPmPage() {
  const { id } = useParams();
  const [client, setClient] = useState(null);
  const [pms, setPms] = useState([]);
  const [history, setHistory] = useState([]);
  const [programManagerId, setProgramManagerId] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, pmList] = await Promise.all([
        api.listClients(),
        api.listProgramManagers()
      ]);
      const found = list.find((c) => c.id === id);
      if (!found) {
        setError('Client not found');
        return;
      }
      setClient(found);
      setPms(pmList);
      setProgramManagerId(found.program_manager_id);
      try {
        const transfers = await api.listClientPmTransfers(id);
        setHistory(transfers);
      } catch {
        setHistory([]);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!client || !programManagerId) return;

    setSubmitting(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await api.assignClientProgramManager(id, {
        program_manager_id: programManagerId,
        reason: reason.trim() || undefined
      });
      setClient(updated);
      setProgramManagerId(updated.program_manager_id);
      setReason('');
      setSaved(true);
      const transfers = await api.listClientPmTransfers(id);
      setHistory(transfers);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const currentPmName = client?.program_manager_name
    || pms.find((p) => p.id === client?.program_manager_id)?.name
    || '—';

  if (loading) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8 text-slate-500">Loading...</main>
    );
  }

  if (error && !client) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Re-Assign Program Manager</h1>
        <p className="mt-1 text-sm text-slate-500">
          {client.client_name} · {client.contract_code}
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {saved && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          Program Manager updated. The new PM will see this client in their dashboard; the previous PM will lose access.
        </div>
      )}

      <form onSubmit={onSubmit} className="rounded-lg border border-slate-200 bg-white p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Current Program Manager</label>
          <p className="text-sm text-slate-900">{currentPmName}</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Assign to</label>
          <select
            value={programManagerId}
            onChange={(e) => setProgramManagerId(e.target.value)}
            className="input"
          >
            <option value="">Select a program manager</option>
            {pms.map((pm) => (
              <option key={pm.id} value={pm.id}>{pm.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Reason (optional)</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="input"
            placeholder="e.g. PM workload rebalancing"
          />
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={submitting || !programManagerId}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-md px-4 py-2 disabled:opacity-60"
          >
            {submitting ? 'Saving...' : 'Re-Assign Program Manager'}
          </button>
        </div>
      </form>

      {history.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-slate-900 mb-3">Transfer history</h2>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">When</th>
                  <th className="px-3 py-2 text-left font-medium">From</th>
                  <th className="px-3 py-2 text-left font-medium">To</th>
                  <th className="px-3 py-2 text-left font-medium">By</th>
                  <th className="px-3 py-2 text-left font-medium">Reason</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100">
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                      {row.created_at ? new Date(row.created_at).toLocaleString() : '—'}
                    </td>
                    <td className="px-3 py-2 text-slate-800">{row.from_program_manager_name || '—'}</td>
                    <td className="px-3 py-2 text-slate-800">{row.to_program_manager_name || '—'}</td>
                    <td className="px-3 py-2 text-slate-700">{row.transferred_by_name || '—'}</td>
                    <td className="px-3 py-2 text-slate-600">{row.reason || '—'}</td>
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
