import { useEffect, useMemo, useRef, useState } from 'react';
import ModalOverlay from '../components/ModalOverlay';
import { api } from '../lib/api';
import { ACTION_BTN_PRIMARY, ACTION_BTN_SECONDARY } from '../lib/actionButtonStyles';
import { triggerCsvDownload } from '../lib/clientCsv';
import { INDIAN_STATES } from '../lib/indianStates';
import { displayNumericValue } from '../lib/numericInput';
import {
  buildImportSummary,
  buildSalaryMinimumsCsv,
  parseSalaryMinimumsCsvText
} from '../lib/salaryMinimumsCsv';
import {
  SKILL_LEVELS,
  SKILL_LEVEL_LABELS,
  WAGE_ZONES,
  ZONE_LABELS
} from '../lib/wageConfig';

function cellKey(state, zone, skill_level) {
  return `${state}|${zone}|${skill_level}`;
}

function IconSearch({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
    </svg>
  );
}

function IconChevron({ open, className }) {
  return (
    <svg
      className={`${className} transition-transform ${open ? 'rotate-180' : ''}`}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
  );
}

function IconClose({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function IconInfo({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
      />
    </svg>
  );
}

function IconCheck({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

export default function SuperAdminSalaryConfigPage() {
  const [rows, setRows] = useState([]);
  const [listedStates, setListedStates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [dirty, setDirty] = useState({});
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState({});
  const [selected, setSelected] = useState({});

  const [addOpen, setAddOpen] = useState(false);
  const [addSearch, setAddSearch] = useState('');
  const [addSelected, setAddSelected] = useState({});

  const [importOpen, setImportOpen] = useState(false);
  const [importItems, setImportItems] = useState([]);
  const [importSummary, setImportSummary] = useState([]);
  const [importError, setImportError] = useState('');
  const fileInputRef = useRef(null);

  const load = async () => {
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const data = await api.listSuperAdminSalaryMinimums();
      const list = Array.isArray(data) ? data : [];
      setRows(list);
      const states = [];
      const seen = new Set();
      for (const r of list) {
        if (!seen.has(r.state)) {
          seen.add(r.state);
          states.push(r.state);
        }
      }
      setListedStates(states);
      setDirty({});
      setSelected({});
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

  const filteredStates = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return listedStates;
    return listedStates.filter((s) => s.toLowerCase().includes(q));
  }, [listedStates, search]);

  const availableToAdd = useMemo(() => {
    const listed = new Set(listedStates);
    const q = addSearch.trim().toLowerCase();
    return INDIAN_STATES.filter((s) => {
      if (listed.has(s)) return false;
      if (!q) return true;
      return s.toLowerCase().includes(q);
    });
  }, [listedStates, addSearch]);

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
        setError(
          `Enter a non-negative amount for ${state} / ${ZONE_LABELS[zone] || zone} / ${SKILL_LEVEL_LABELS[skill_level] || skill_level}.`
        );
        return;
      }
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) {
        setError(
          `Invalid amount for ${state} / ${ZONE_LABELS[zone] || zone} / ${SKILL_LEVEL_LABELS[skill_level] || skill_level}.`
        );
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
  const selectedCount = filteredStates.filter((s) => selected[s]).length;
  const allFilteredExpanded =
    filteredStates.length > 0 && filteredStates.every((s) => expanded[s]);

  const toggleExpand = (state) => {
    setExpanded((prev) => ({ ...prev, [state]: !prev[state] }));
  };

  const toggleExpandAll = () => {
    if (allFilteredExpanded) {
      setExpanded((prev) => {
        const next = { ...prev };
        for (const s of filteredStates) next[s] = false;
        return next;
      });
      return;
    }
    setExpanded((prev) => {
      const next = { ...prev };
      for (const s of filteredStates) next[s] = true;
      return next;
    });
  };

  const toggleSelected = (state) => {
    setSelected((prev) => ({ ...prev, [state]: !prev[state] }));
  };

  const handleDeleteSelected = () => {
    const toRemove = new Set(filteredStates.filter((s) => selected[s]));
    if (!toRemove.size) {
      setError('Select at least one state to delete from the list.');
      return;
    }
    setListedStates((prev) => prev.filter((s) => !toRemove.has(s)));
    setSelected((prev) => {
      const next = { ...prev };
      for (const s of toRemove) delete next[s];
      return next;
    });
    setExpanded((prev) => {
      const next = { ...prev };
      for (const s of toRemove) delete next[s];
      return next;
    });
    setError('');
    setSuccess(`Removed ${toRemove.size} state(s) from the list. Saved values are unchanged until you edit and save.`);
  };

  const openAddModal = () => {
    setAddSearch('');
    setAddSelected({});
    setAddOpen(true);
  };

  const closeAddModal = () => {
    setAddOpen(false);
    setAddSearch('');
    setAddSelected({});
  };

  const confirmAddStates = () => {
    const toAdd = INDIAN_STATES.filter((s) => addSelected[s] && !listedStates.includes(s));
    if (!toAdd.length) {
      setError('Select at least one state to add.');
      return;
    }
    setListedStates((prev) => [...prev, ...toAdd]);
    setExpanded((prev) => {
      const next = { ...prev };
      for (const s of toAdd) next[s] = true;
      return next;
    });
    setSuccess(`Added ${toAdd.length} state(s).`);
    setError('');
    closeAddModal();
  };

  const handleExport = () => {
    const csv = buildSalaryMinimumsCsv(rows, { states: listedStates });
    triggerCsvDownload('salary-minimums.csv', csv);
  };

  const onPickImportFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const name = (file.name || '').toLowerCase();
    if (!name.endsWith('.csv') && file.type !== 'text/csv') {
      setError('Only .csv files are supported.');
      return;
    }

    setImportError('');
    setError('');
    setSuccess('');
    try {
      const text = await file.text();
      const { items, errors } = parseSalaryMinimumsCsvText(text);
      if (!items.length) {
        setError(errors[0] || 'The file has no valid salary rows.');
        return;
      }
      setImportItems(items);
      setImportSummary(buildImportSummary(items));
      setImportError(errors.length ? `${errors.length} row(s) skipped due to validation errors.` : '');
      setImportOpen(true);
    } catch (err) {
      setError(err.message || 'Could not read the CSV file.');
    }
  };

  const closeImportModal = () => {
    setImportOpen(false);
    setImportItems([]);
    setImportSummary([]);
    setImportError('');
  };

  const applyImport = () => {
    if (!importItems.length) return;

    const nextDirty = { ...dirty };
    for (const item of importItems) {
      nextDirty[cellKey(item.state, item.zone, item.skill_level)] = true;
    }

    setRows((prev) => {
      const map = new Map(prev.map((r) => [cellKey(r.state, r.zone, r.skill_level), { ...r }]));
      for (const item of importItems) {
        const key = cellKey(item.state, item.zone, item.skill_level);
        const existing = map.get(key) || {
          state: item.state,
          zone: item.zone,
          skill_level: item.skill_level,
          min_monthly_ctc: null,
          updated_by: null,
          updated_at: null
        };
        map.set(key, { ...existing, min_monthly_ctc: item.min_monthly_ctc });
      }
      return [...map.values()];
    });
    setDirty(nextDirty);

    const importedStates = [...new Set(importItems.map((i) => i.state))];
    setListedStates((prev) => {
      const set = new Set(prev);
      for (const s of importedStates) set.add(s);
      return INDIAN_STATES.filter((s) => set.has(s));
    });
    setExpanded((prev) => {
      const next = { ...prev };
      for (const s of importedStates) next[s] = true;
      return next;
    });

    setSuccess(`Imported ${importItems.length} value(s) across ${importedStates.length} state(s). Click Save to persist.`);
    setError('');
    closeImportModal();
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Salary Configuration</h1>
          <p className="mt-1 text-sm text-slate-500">Configure minimum monthly CTC by state and zone.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExport}
            disabled={loading || !listedStates.length}
            className={ACTION_BTN_SECONDARY}
          >
            Master Report
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            className={ACTION_BTN_SECONDARY}
          >
            Import CSV
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={onPickImportFile}
          />
          <button
            type="button"
            onClick={openAddModal}
            disabled={loading}
            className={ACTION_BTN_PRIMARY}
          >
            + Add State
          </button>
        </div>
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
        <>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-[16rem] flex-1">
              <label htmlFor="salary-state-search" className="mb-1.5 block text-sm text-slate-600">
                Select state
              </label>
              <div className="relative">
                <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="salary-state-search"
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search state..."
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-800 shadow-sm placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                />
              </div>
            </div>
            <div className="flex items-center gap-4 pb-1 text-sm">
              <button
                type="button"
                onClick={toggleExpandAll}
                disabled={!filteredStates.length}
                className="font-medium text-slate-700 underline-offset-2 hover:underline disabled:opacity-50"
              >
                {allFilteredExpanded ? 'Collapse all' : 'Expand all'}
              </button>
              <button
                type="button"
                onClick={handleDeleteSelected}
                disabled={!selectedCount}
                className="font-medium text-rose-600 hover:text-rose-700 disabled:opacity-40"
              >
                Delete{selectedCount ? ` (${selectedCount})` : ''}
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {filteredStates.length === 0 && (
              <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 shadow-sm">
                {listedStates.length === 0
                  ? 'No states in the list. Use + Add State or Import CSV to begin.'
                  : 'No states match your search.'}
              </div>
            )}

            {filteredStates.map((state) => {
              const isOpen = !!expanded[state];
              const isChecked = !!selected[state];
              const stateDirty = WAGE_ZONES.some((zone) =>
                SKILL_LEVELS.some((s) => dirty[cellKey(state, zone, s)])
              );

              return (
                <div
                  key={state}
                  className={`overflow-hidden rounded-xl border bg-white shadow-sm ${
                    stateDirty ? 'border-amber-200' : 'border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-3 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleSelected(state)}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      aria-label={`Select ${state}`}
                    />
                    <button
                      type="button"
                      onClick={() => toggleExpand(state)}
                      className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
                    >
                      <span className="truncate text-sm font-semibold text-slate-900">{state}</span>
                      <IconChevron open={isOpen} className="h-4 w-4 shrink-0 text-slate-500" />
                    </button>
                  </div>

                  {isOpen && (
                    <div className="border-t border-slate-100 px-4 pb-4 pt-2">
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                          <thead>
                            <tr className="text-slate-600">
                              <th className="px-2 py-2 text-left font-medium">Zone</th>
                              {SKILL_LEVELS.map((s) => (
                                <th key={s} className="px-2 py-2 text-left font-medium">
                                  {SKILL_LEVEL_LABELS[s]}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {WAGE_ZONES.map((zone) => (
                              <tr key={zone}>
                                <td className="px-2 py-2 font-medium text-slate-800">{ZONE_LABELS[zone]}</td>
                                {SKILL_LEVELS.map((skill_level) => {
                                  const key = cellKey(state, zone, skill_level);
                                  const r = byKey.get(key);
                                  const val = r?.min_monthly_ctc;
                                  return (
                                    <td key={skill_level} className="px-2 py-2">
                                      <input
                                        className="w-28 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-800 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
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
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || dirtyCount === 0}
              className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {saving ? 'Saving…' : dirtyCount ? `Save ${dirtyCount} change(s)` : 'Save'}
            </button>
          </div>
        </>
      )}

      {addOpen && (
        <ModalOverlay onClose={closeAddModal} backdropClassName="bg-slate-900/50">
          <div className="w-[min(92vw,28rem)] rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between px-5 pt-5">
              <h2 className="text-lg font-semibold text-slate-900">Add State</h2>
              <button
                type="button"
                onClick={closeAddModal}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close"
              >
                <IconClose className="h-5 w-5" />
              </button>
            </div>

            <div className="px-5 pt-4">
              <label htmlFor="add-state-search" className="mb-1.5 block text-sm text-slate-600">
                Search state
              </label>
              <div className="relative">
                <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="add-state-search"
                  type="search"
                  value={addSearch}
                  onChange={(e) => setAddSearch(e.target.value)}
                  placeholder="Search state"
                  className="w-full rounded-lg border border-indigo-300 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  autoFocus
                />
              </div>
            </div>

            <div className="mt-3 max-h-64 overflow-y-auto px-3">
              {availableToAdd.length === 0 ? (
                <p className="px-2 py-6 text-center text-sm text-slate-500">
                  {listedStates.length >= INDIAN_STATES.length
                    ? 'All states are already in the list.'
                    : 'No states match your search.'}
                </p>
              ) : (
                <ul className="space-y-0.5">
                  {availableToAdd.map((state) => {
                    const checked = !!addSelected[state];
                    return (
                      <li key={state}>
                        <button
                          type="button"
                          onClick={() =>
                            setAddSelected((prev) => ({ ...prev, [state]: !prev[state] }))
                          }
                          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm ${
                            checked
                              ? 'bg-indigo-50 text-slate-900'
                              : 'text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <span
                            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                              checked
                                ? 'border-indigo-600 bg-indigo-600 text-white'
                                : 'border-slate-300 bg-white'
                            }`}
                          >
                            {checked ? <IconCheck className="h-3 w-3" /> : null}
                          </span>
                          <span className="flex-1 font-medium">{state}</span>
                          {checked ? <IconCheck className="h-4 w-4 text-indigo-600" /> : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="flex justify-end gap-2 px-5 py-4">
              <button
                type="button"
                onClick={closeAddModal}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmAddStates}
                disabled={!Object.values(addSelected).some(Boolean)}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                Add
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {importOpen && (
        <ModalOverlay onClose={closeImportModal} backdropClassName="bg-slate-900/50">
          <div className="w-[min(92vw,32rem)] rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between px-5 pt-5">
              <h2 className="text-lg font-semibold text-slate-900">Import Summary</h2>
              <button
                type="button"
                onClick={closeImportModal}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close"
              >
                <IconClose className="h-5 w-5" />
              </button>
            </div>

            <div className="px-5 pt-3">
              <p className="text-sm text-slate-500">The following states have been updated:</p>

              <div className="mt-3 max-h-72 overflow-y-auto rounded-xl border border-slate-200">
                {importSummary.map((entry, idx) => (
                  <div
                    key={entry.state}
                    className={`px-4 py-3 ${idx > 0 ? 'border-t border-slate-100' : ''}`}
                  >
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="text-sm font-semibold text-slate-900">{entry.state}</span>
                      <span className="text-sm text-slate-400">
                        • {entry.zonesUpdated} zone{entry.zonesUpdated === 1 ? '' : 's'} updated
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {entry.skills.map((label) => (
                        <span
                          key={label}
                          className="rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700"
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {importError && (
                <p className="mt-3 text-xs text-amber-700">{importError}</p>
              )}

              <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-indigo-50 px-3.5 py-3 text-sm text-indigo-800">
                <IconInfo className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />
                <span>Existing values will be overwritten with the imported data.</span>
              </div>
            </div>

            <div className="flex justify-end gap-2 px-5 py-4">
              <button
                type="button"
                onClick={closeImportModal}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={applyImport}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                Save Changes
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </main>
  );
}
