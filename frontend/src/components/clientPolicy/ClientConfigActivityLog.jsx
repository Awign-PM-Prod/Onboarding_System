import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';

/**
 * PL-only activity log for client / project configuration edits.
 * Use className="contents" inside a flex-wrap header so the panel can span full width.
 */
export default function ClientConfigActivityLog({ clientId, className = '' }) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await api.listClientPolicyChanges(clientId);
      setEntries(rows ?? []);
    } catch (err) {
      setEntries([]);
      setError(err.message || 'Failed to load activity log');
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
      >
        {open ? 'Hide activity' : 'Activity log'}
      </button>
      {open && (
        <div className="mt-3 w-full basis-full max-h-56 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
          {loading && <p className="text-slate-500">Loading…</p>}
          {!loading && error && <p className="text-red-600">{error}</p>}
          {!loading && !error && entries.length === 0 && (
            <p className="text-slate-500">No configuration changes recorded yet.</p>
          )}
          {!loading && !error && entries.length > 0 && (
            <ul className="space-y-2">
              {entries.map((entry) => (
                <li key={entry.id} className="border-b border-slate-200 pb-2 last:border-0 last:pb-0">
                  <div className="text-xs text-slate-500">
                    {entry.created_at ? new Date(entry.created_at).toLocaleString() : '—'}
                    {' · '}
                    {entry.actor_name || entry.actor_email || entry.actor_role || 'System'}
                  </div>
                  <div className="mt-1 text-slate-800">{entry.message}</div>
                  {Array.isArray(entry.changes_json) && entry.changes_json.length > 1 && (
                    <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-slate-600">
                      {entry.changes_json.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
