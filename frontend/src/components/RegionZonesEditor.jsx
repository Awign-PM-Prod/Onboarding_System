import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { ACTION_BTN_PRIMARY, ACTION_BTN_SECONDARY } from '../lib/actionButtonStyles';
import { INDIAN_STATES } from '../lib/indianStates';
import { WAGE_ZONES, ZONE_LABELS, normalizeRegionName } from '../lib/wageConfig';

function IconSearch({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
    </svg>
  );
}

function newRow() {
  return { key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, region: '', zone: 'zone1' };
}

/**
 * Shared state→region→zone editor used by Super Admin page and Configure Zones modal.
 * @param {'page' | 'modal'} variant
 */
export default function RegionZonesEditor({
  variant = 'page',
  initialState = '',
  onSaved,
  onCancel,
  className = ''
}) {
  const isModal = variant === 'modal';
  const [allRows, setAllRows] = useState([]);
  const [selectedState, setSelectedState] = useState(initialState || '');
  const [draftRows, setDraftRows] = useState([]);
  const [stateSearch, setStateSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.listRegionZones();
      setAllRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || 'Could not load region zones.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (initialState) setSelectedState(initialState);
  }, [initialState]);

  const statesWithRegions = useMemo(() => {
    const set = new Set();
    for (const r of allRows) {
      if (r?.state) set.add(r.state);
    }
    return INDIAN_STATES.filter((s) => set.has(s));
  }, [allRows]);

  const filteredStates = useMemo(() => {
    const q = stateSearch.trim().toLowerCase();
    if (!q) return INDIAN_STATES;
    return INDIAN_STATES.filter((s) => s.toLowerCase().includes(q));
  }, [stateSearch]);

  useEffect(() => {
    if (!selectedState) {
      setDraftRows([]);
      return;
    }
    const rows = allRows
      .filter((r) => r.state === selectedState)
      .map((r) => ({
        key: r.id || `${r.state}-${r.region}`,
        region: r.region || '',
        zone: r.zone || 'zone1'
      }));
    setDraftRows(rows.length ? rows : []);
    setSuccess('');
    setError('');
  }, [selectedState, allRows]);

  const baselineForState = useMemo(() => {
    if (!selectedState) return [];
    return allRows
      .filter((r) => r.state === selectedState)
      .map((r) => ({
        region: String(r.region || '').trim(),
        zone: r.zone || 'zone1'
      }))
      .sort((a, b) => a.region.localeCompare(b.region));
  }, [allRows, selectedState]);

  const isDirty = useMemo(() => {
    if (!selectedState) return false;
    const serialize = (rows) =>
      rows
        .map((r) => `${String(r.region || '').trim().toLowerCase()}|${r.zone || 'zone1'}`)
        .filter((s) => !s.startsWith('|'))
        .sort()
        .join('\n');
    const draftSerialized = serialize(
      draftRows.map((r) => ({
        region: normalizeRegionName(r.region) || '',
        zone: r.zone
      }))
    );
    const baselineSerialized = serialize(baselineForState);
    if (draftSerialized !== baselineSerialized) return true;
    return draftRows.some((r) => String(r.region || '').trim() === '');
  }, [draftRows, baselineForState, selectedState]);

  const setRow = (key, patch) => {
    setDraftRows((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    setSuccess('');
  };

  const addRow = () => {
    setDraftRows((rows) => [...rows, newRow()]);
    setSuccess('');
  };

  const removeRow = (key) => {
    setDraftRows((rows) => rows.filter((r) => r.key !== key));
    setSuccess('');
  };

  const handleSave = async () => {
    if (!selectedState) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const items = [];
      const seen = new Set();
      for (const row of draftRows) {
        const region = normalizeRegionName(row.region);
        if (!region) {
          if (String(row.region || '').trim()) {
            throw new Error('Region names cannot be blank.');
          }
          continue;
        }
        const key = region.toLowerCase();
        if (seen.has(key)) {
          throw new Error(`Duplicate region "${region}" for ${selectedState}.`);
        }
        seen.add(key);
        if (!WAGE_ZONES.includes(row.zone)) {
          throw new Error(`Invalid zone for region "${region}".`);
        }
        items.push({ region, zone: row.zone });
      }

      const saved = await api.saveRegionZones(selectedState, items);
      setSuccess(`Saved ${items.length} region(s) for ${selectedState}.`);
      const data = await api.listRegionZones();
      const nextRows = Array.isArray(data)
        ? data
        : Array.isArray(saved)
          ? [...allRows.filter((r) => r.state !== selectedState), ...saved]
          : allRows;
      setAllRows(nextRows);
      onSaved?.(nextRows);
    } catch (err) {
      setError(err.message || 'Could not save region zones.');
    } finally {
      setSaving(false);
    }
  };

  const gridClass = isModal
    ? 'grid min-h-0 flex-1 gap-4 overflow-hidden lg:grid-cols-[14rem_minmax(0,1fr)]'
    : 'grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]';

  const stateListMaxH = isModal ? 'max-h-[18rem] lg:max-h-none lg:flex-1' : 'max-h-[28rem]';

  return (
    <div className={`flex min-h-0 flex-col ${className}`}>
      {!isModal && (
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Region Zones</h1>
            <p className="mt-1 text-sm text-slate-600">
              Map regions/areas under each state to wage zones. When a client has zone dependency on, PMs
              pick a region and zone wages apply automatically.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={load} disabled={loading || saving} className={ACTION_BTN_SECONDARY}>
              Refresh
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!selectedState || saving || loading}
              className={ACTION_BTN_PRIMARY}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 shrink-0 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 shrink-0 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          {success}
        </div>
      )}

      <div className={gridClass}>
        <div
          className={`flex min-h-0 flex-col rounded-xl border border-slate-200 bg-white p-3 shadow-sm ${
            isModal ? 'overflow-hidden' : ''
          }`}
        >
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Select state
          </p>
          <div className="relative mb-3 shrink-0">
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              id="region-state-search"
              type="search"
              value={stateSearch}
              onChange={(e) => setStateSearch(e.target.value)}
              placeholder="Search states…"
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
          </div>
          <div className={`space-y-0.5 overflow-y-auto ${stateListMaxH}`}>
            {filteredStates.map((state) => {
              const count = allRows.filter((r) => r.state === state).length;
              const active = selectedState === state;
              return (
                <button
                  key={state}
                  type="button"
                  onClick={() => setSelectedState(state)}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${
                    active
                      ? 'bg-indigo-50 font-medium text-indigo-800'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span className="truncate pr-2">{state}</span>
                  {count > 0 && (
                    <span className={`shrink-0 text-xs ${active ? 'text-indigo-600' : 'text-slate-400'}`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
            {filteredStates.length === 0 && (
              <p className="px-2 py-4 text-center text-sm text-slate-500">No states match.</p>
            )}
          </div>
          {statesWithRegions.length > 0 && (
            <p className="mt-3 shrink-0 border-t border-slate-100 pt-3 text-xs text-slate-500">
              {statesWithRegions.length} state(s) have regions configured
            </p>
          )}
        </div>

        <div
          className={`flex min-h-0 flex-col rounded-xl border border-slate-200 bg-white shadow-sm ${
            isModal ? 'overflow-hidden' : ''
          }`}
        >
          {loading && <div className="p-10 text-center text-slate-500">Loading…</div>}
          {!loading && !selectedState && (
            <div className="p-10 text-center text-sm text-slate-500">
              Choose a state to add or edit region → zone mappings.
            </div>
          )}
          {!loading && selectedState && (
            <div className={`flex min-h-0 flex-1 flex-col p-4 sm:p-5 ${isModal ? 'overflow-y-auto' : ''}`}>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-slate-900">{selectedState}</h2>
                <button type="button" onClick={addRow} className={ACTION_BTN_SECONDARY}>
                  + Add region
                </button>
              </div>

              {draftRows.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                  No regions yet. Add regions and assign each to Zone 1, 2, or 3.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500">
                        <th className="pb-2 pr-3 font-medium">Region / Area</th>
                        <th className="pb-2 pr-3 font-medium">Zone</th>
                        <th className="pb-2 w-16 font-medium" />
                      </tr>
                    </thead>
                    <tbody>
                      {draftRows.map((row) => (
                        <tr key={row.key} className="border-b border-slate-100">
                          <td className="py-2 pr-3">
                            <input
                              className="input w-full min-w-[12rem]"
                              value={row.region}
                              placeholder="e.g. Mumbai Metro"
                              onChange={(e) => setRow(row.key, { region: e.target.value })}
                            />
                          </td>
                          <td className="py-2 pr-3">
                            <select
                              className="input min-w-[8rem]"
                              value={row.zone}
                              onChange={(e) => setRow(row.key, { zone: e.target.value })}
                            >
                              {WAGE_ZONES.map((z) => (
                                <option key={z} value={z}>
                                  {ZONE_LABELS[z]}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-2">
                            <button
                              type="button"
                              onClick={() => removeRow(row.key)}
                              className="text-sm font-medium text-rose-600 hover:text-rose-700"
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {isDirty && (
                <p className="mt-3 text-xs text-amber-700">Unsaved changes — click Save to apply.</p>
              )}
            </div>
          )}
        </div>
      </div>

      {isModal && (
        <div className="mt-4 flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-200 pt-4">
          <button type="button" onClick={onCancel} disabled={saving} className={ACTION_BTN_SECONDARY}>
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!selectedState || saving || loading}
            className={ACTION_BTN_PRIMARY}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}
    </div>
  );
}

/** Count distinct states that have at least one region row. */
export function countConfiguredStates(rows) {
  if (!Array.isArray(rows)) return 0;
  const set = new Set();
  for (const r of rows) {
    if (r?.state) set.add(r.state);
  }
  return set.size;
}
