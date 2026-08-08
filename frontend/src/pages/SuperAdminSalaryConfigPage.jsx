import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { displayNumericValue } from '../lib/numericInput';
import {
  SKILL_LEVELS,
  SKILL_LEVEL_LABELS,
  WAGE_ZONES,
  ZONE_LABELS
} from '../lib/wageConfig';

function cellKey(state, zone, skill_level) {
  return `${state}|${zone}|${skill_level}`;
}

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

  const byKey = useMemo(() => {
    const map = new Map();
    for (const r of rows) {
      map.set(cellKey(r.state, r.zone, r.skill_level), r);
    }
    return map;
  }, [rows]);

  const states = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const r of rows) {
      if (!seen.has(r.state)) {
        seen.add(r.state);
        out.push(r.state);
      }
    }
    return out;
  }, [rows]);

  const setMin = (state, zone, skill_level, value) => {
    const key = cellKey(state, zone, skill_level);
    setRows((prev) =>
      prev.map((r) =>
        r.state === state && r.zone === zone && r.skill_level === skill_level
          ? { ...r, min_monthly_ctc: value }
          : r
      )
    );
    setDirty((prev) => ({ ...prev, [key]: true }));
    setSuccess('');
  };

  const handleSave = async () => {
    const keys = Object.keys(dirty);
    if (keys.length === 0) {
      setError('No changes to save.');
      return;
    }

    const items = [];
    for (const key of keys) {
      const [state, zone, skill_level] = key.split('|');
      const row = byKey.get(key);
      const raw = row?.min_monthly_ctc;
      if (raw === '' || raw === null || raw === undefined) {
        setError(`Enter a non-negative amount for ${state} / ${ZONE_LABELS[zone] || zone} / ${SKILL_LEVEL_LABELS[skill_level] || skill_level}.`);
        return;
      }
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) {
        setError(`Invalid amount for ${state} / ${ZONE_LABELS[zone] || zone} / ${SKILL_LEVEL_LABELS[skill_level] || skill_level}.`);
        return;
      }
      items.push({ state, zone, skill_level, min_monthly_ctc: n });
    }

    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await api.saveSuperAdminSalaryMinimums(items);
      setSuccess(`Saved ${items.length} wage minimum(s).`);
      await load();
    } catch (err) {
      setError(err.message || 'Could not save salary minimums.');
    } finally {
      setSaving(false);
    }
  };

  const dirtyCount = Object.keys(dirty).length;

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Salary Configuration</h1>
          <p className="mt-1 text-sm text-slate-500">
            Set minimum monthly CTC by state, zone (zone1–zone3), and skill level. Program Managers must
            meet or exceed this when assigning CTC (Net Pay is not constrained).
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
                  <th className="px-3 py-2 text-left font-medium">Zone</th>
                  {SKILL_LEVELS.map((s) => (
                    <th key={s} className="px-3 py-2 text-left font-medium">
                      {SKILL_LEVEL_LABELS[s]} (₹)
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {states.map((state) =>
                  WAGE_ZONES.map((zone, zoneIdx) => {
                    const rowDirty = SKILL_LEVELS.some((s) => dirty[cellKey(state, zone, s)]);
                    return (
                      <tr
                        key={`${state}-${zone}`}
                        className={rowDirty ? 'bg-amber-50/40' : undefined}
                      >
                        {zoneIdx === 0 ? (
                          <td
                            className="px-3 py-2 font-medium text-slate-800 align-top"
                            rowSpan={WAGE_ZONES.length}
                          >
                            {state}
                          </td>
                        ) : null}
                        <td className="px-3 py-2 text-slate-700">{ZONE_LABELS[zone]}</td>
                        {SKILL_LEVELS.map((skill_level) => {
                          const key = cellKey(state, zone, skill_level);
                          const r = byKey.get(key);
                          const val = r?.min_monthly_ctc;
                          return (
                            <td key={skill_level} className="px-3 py-2">
                              <input
                                className="w-28 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                                type="text"
                                inputMode="decimal"
                                placeholder="Not set"
                                value={
                                  val === null || val === undefined || val === ''
                                    ? ''
                                    : displayNumericValue(String(val))
                                }
                                onChange={(e) => {
                                  const raw = e.target.value;
                                  if (raw === '') {
                                    setMin(state, zone, skill_level, '');
                                    return;
                                  }
                                  if (/^\d*\.?\d*$/.test(raw)) {
                                    setMin(state, zone, skill_level, raw);
                                  }
                                }}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </main>
  );
}
