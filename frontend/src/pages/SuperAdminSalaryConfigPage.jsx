import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { displayNumericValue } from '../lib/numericInput';

export default function SuperAdminSalaryConfigPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [dirty, setDirty] = useState({});

  const load = async () => {
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const data = await api.listSuperAdminSalaryMinimums();
      setRows(Array.isArray(data) ? data : []);
      setDirty({});
    } catch (err) {
      setError(err.message || 'Could not load salary minimums.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const setMin = (state, value) => {
    setRows((prev) =>
      prev.map((r) => (r.state === state ? { ...r, min_monthly_ctc: value } : r))
    );
    setDirty((prev) => ({ ...prev, [state]: true }));
    setSuccess('');
  };

  const handleSave = async () => {
    const items = rows
      .filter((r) => dirty[r.state])
      .map((r) => {
        const raw = r.min_monthly_ctc;
        if (raw === '' || raw === null || raw === undefined) {
          return { state: r.state, min_monthly_ctc: null, invalidEmpty: true };
        }
        const n = Number(raw);
        return { state: r.state, min_monthly_ctc: n };
      });

    if (items.length === 0) {
      setError('No changes to save.');
      return;
    }

    for (const item of items) {
      if (item.invalidEmpty) {
        setError(`Enter a non-negative amount for ${item.state} (or discard that change).`);
        return;
      }
      if (!Number.isFinite(item.min_monthly_ctc) || item.min_monthly_ctc < 0) {
        setError(`Invalid amount for ${item.state}. Enter a non-negative number.`);
        return;
      }
    }

    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await api.saveSuperAdminSalaryMinimums(
        items.map(({ state, min_monthly_ctc }) => ({ state, min_monthly_ctc }))
      );
      setSuccess(`Saved ${items.length} state minimum(s).`);
      await load();
    } catch (err) {
      setError(err.message || 'Could not save salary minimums.');
    } finally {
      setSaving(false);
    }
  };

  const dirtyCount = Object.keys(dirty).length;

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Salary Configuration</h1>
          <p className="mt-1 text-sm text-slate-500">
            Set minimum monthly CTC by state. Program Managers must meet or exceed this when assigning CTC
            (Net Pay is not constrained).
          </p>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || loading || dirtyCount === 0}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {saving ? 'Saving…' : dirtyCount ? `Save ${dirtyCount} change(s)` : 'Save'}
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>
      )}
      {success && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          {success}
        </div>
      )}

      {loading && (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-500 shadow-sm">
          Loading…
        </div>
      )}

      {!loading && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">State / UT</th>
                  <th className="px-3 py-2 text-left font-medium">Min monthly CTC (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.state} className={dirty[r.state] ? 'bg-amber-50/40' : undefined}>
                    <td className="px-3 py-2 font-medium text-slate-800">{r.state}</td>
                    <td className="px-3 py-2">
                      <input
                        className="w-40 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                        type="text"
                        inputMode="decimal"
                        placeholder="Not set"
                        value={
                          r.min_monthly_ctc === null || r.min_monthly_ctc === ''
                            ? ''
                            : displayNumericValue(String(r.min_monthly_ctc))
                        }
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (raw === '') {
                            setMin(r.state, '');
                            return;
                          }
                          if (/^\d*\.?\d*$/.test(raw)) setMin(r.state, raw);
                        }}
                      />
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
