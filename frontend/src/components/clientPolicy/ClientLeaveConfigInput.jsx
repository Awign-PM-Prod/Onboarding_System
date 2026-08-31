import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { INDIAN_STATES } from '../../lib/indianStates';
import {
  LEAVE_TYPE_LABELS,
  LEAVE_TYPES,
  describeLeaveRule,
  emptyLeaveRule,
  formatAccrualString,
  parseAccrualString
} from '../../lib/leaveConfig';
import { parseLeaveConfigCsvText } from '../../lib/leaveConfigCsv';

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

function groupByState(rows) {
  const byState = new Map();
  for (const r of rows ?? []) {
    const key = String(r.state ?? '').trim();
    if (!key) continue;
    if (!byState.has(key)) byState.set(key, []);
    byState.get(key).push(r);
  }
  const ordered = [];
  for (const state of INDIAN_STATES) {
    if (byState.has(state)) ordered.push({ state, rules: byState.get(state) });
  }
  for (const [state, rules] of byState.entries()) {
    if (!INDIAN_STATES.includes(state)) ordered.push({ state, rules });
  }
  return ordered;
}

export default function ClientLeaveConfigInput({
  value,
  onChange,
  leaveConfigId = null,
  onLeaveConfigIdChange,
  leaveSource,
  onLeaveSourceChange,
  createLeaveConfig = false,
  onCreateLeaveConfigChange,
  clientId = null,
  clientName = '',
  error
}) {
  const rules = value ?? [];
  const namedConfigId = leaveConfigId || null;
  const pendingNew = Boolean(createLeaveConfig) && !namedConfigId;
  const isDefault = !namedConfigId && !pendingNew;
  const searchId = useId();
  const configSelectId = useId();
  const csvInputId = useId();
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState({});
  const [defs, setDefs] = useState([]);
  const [masterRules, setMasterRules] = useState([]);
  const [masterLoading, setMasterLoading] = useState(false);
  const [masterError, setMasterError] = useState('');
  const [stateMenuOpen, setStateMenuOpen] = useState(false);
  const [pinnedStates, setPinnedStates] = useState([]);
  const [csvError, setCsvError] = useState('');
  const [editDraft, setEditDraft] = useState(null);
  const stateMenuRef = useRef(null);
  const csvInputRef = useRef(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!stateMenuOpen) return undefined;
    const onPointer = (e) => {
      if (!stateMenuRef.current?.contains(e.target)) setStateMenuOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setStateMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [stateMenuOpen]);

  useEffect(() => {
    let cancelled = false;
    api
      .listLeaveConfigDefs({ forClientId: clientId || undefined })
      .then((rows) => {
        if (!cancelled) setDefs(Array.isArray(rows) ? rows : []);
      })
      .catch((err) => {
        if (!cancelled) setMasterError(err.message || 'Could not load leave configurations.');
      });
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  useEffect(() => {
    if (!isDefault) {
      setMasterLoading(false);
      return undefined;
    }
    let cancelled = false;
    setMasterLoading(true);
    setMasterError('');
    api
      .listLeaveConfigRules({})
      .then((rows) => {
        if (!cancelled) setMasterRules(Array.isArray(rows) ? rows : []);
      })
      .catch((err) => {
        if (!cancelled) {
          setMasterRules([]);
          setMasterError(err.message || 'Could not load default leave configuration.');
        }
      })
      .finally(() => {
        if (!cancelled) setMasterLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isDefault]);

  const notifyConfigChange = (nextId, { createNew = false } = {}) => {
    if (typeof onCreateLeaveConfigChange === 'function') {
      onCreateLeaveConfigChange(createNew && !nextId);
    }
    if (typeof onLeaveConfigIdChange === 'function') onLeaveConfigIdChange(nextId);
    if (typeof onLeaveSourceChange === 'function') {
      onLeaveSourceChange(nextId || createNew ? 'custom' : 'default');
    }
  };

  const setConfig = (nextId) => {
    const id = nextId || null;
    if (id === '__pending__') return;
    if ((id || null) === (namedConfigId || null) && !pendingNew) return;
    notifyConfigChange(id, { createNew: false });
    if (!id) {
      onChangeRef.current([]);
      return;
    }
    setMasterError('');
    setCsvError('');
    api
      .listLeaveConfigRules({ configId: id })
      .then((rows) => {
        onChangeRef.current(Array.isArray(rows) ? rows : []);
      })
      .catch((err) => {
        setMasterError(err.message || 'Could not load leave rules.');
        onChangeRef.current([]);
      });
  };

  const onPickCsv = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const name = (file.name || '').toLowerCase();
    if (!name.endsWith('.csv') && file.type !== 'text/csv') {
      setCsvError('Only .csv files are supported.');
      return;
    }
    setCsvError('');
    setMasterError('');
    try {
      const text = await file.text();
      const { items, errors } = parseLeaveConfigCsvText(text);
      if (!items.length) {
        setCsvError(errors[0] || 'The file has no valid leave-config rows.');
        return;
      }
      onChangeRef.current(items);
      if (isDefault) notifyConfigChange(null, { createNew: true });
      if (errors.length) setCsvError(`${errors.length} row(s) skipped due to validation errors.`);
    } catch (err) {
      setCsvError(err.message || 'Could not read the CSV file.');
    }
  };

  const displayRows = isDefault ? masterRules : rules;
  const grouped = useMemo(() => {
    const list = groupByState(displayRows);
    if (isDefault) return list;
    const present = new Set(list.map((g) => g.state));
    const extra = pinnedStates
      .filter((s) => !present.has(s))
      .map((state) => ({ state, rules: [] }));
    return [...list, ...extra];
  }, [displayRows, isDefault, pinnedStates]);

  const matchedState = INDIAN_STATES.find((s) => s.toLowerCase() === search.trim().toLowerCase()) || '';
  const stateSuggestions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return INDIAN_STATES.slice(0, 12);
    return INDIAN_STATES.filter((s) => s.toLowerCase().includes(q)).slice(0, 12);
  }, [search]);
  const canAddState = Boolean(matchedState) && !isDefault;

  const pickState = (s) => {
    setSearch(s);
    setStateMenuOpen(false);
    if (isDefault) {
      setExpanded((prev) => ({ ...prev, [s]: true }));
      return;
    }
    setPinnedStates((prev) => (prev.includes(s) ? prev : [...prev, s]));
    setExpanded((prev) => ({ ...prev, [s]: true }));
  };

  const addSearchedState = () => {
    if (!canAddState) return;
    pickState(matchedState);
    setSearch('');
  };

  const upsertRule = (nextRule) => {
    const key = `${nextRule.state}|${nextRule.leave_type}`;
    const without = rules.filter((r) => `${r.state}|${r.leave_type}` !== key);
    onChange([...without, nextRule]);
  };

  const removeRule = (rule) => {
    onChange(rules.filter((r) => !(r.state === rule.state && r.leave_type === rule.leave_type)));
  };

  const startEdit = (rule) => {
    setEditDraft({
      state: rule.state,
      leave_type: rule.leave_type,
      not_applicable: rule.not_applicable === true,
      accrual: formatAccrualString(rule.accrual_rules ?? []),
      fixed_days: rule.fixed_days == null ? '' : String(rule.fixed_days),
      accumulation_limit: rule.accumulation_limit == null ? '' : String(rule.accumulation_limit)
    });
  };

  const saveDraft = () => {
    if (!editDraft) return;
    let accrual_rules = [];
    if (!editDraft.not_applicable && editDraft.accrual.trim()) {
      const parsed = parseAccrualString(editDraft.accrual);
      if (parsed == null) {
        setCsvError('Accrual must look like 5/60 or 5/60;18/240.');
        return;
      }
      accrual_rules = parsed;
    }
    const fixedRaw = editDraft.fixed_days.trim();
    const accumRaw = editDraft.accumulation_limit.trim();
    upsertRule({
      ...emptyLeaveRule(editDraft.state, editDraft.leave_type),
      not_applicable: editDraft.not_applicable,
      accrual_rules: editDraft.not_applicable ? [] : accrual_rules,
      fixed_days: editDraft.not_applicable || fixedRaw === '' ? null : Number(fixedRaw),
      accumulation_limit: editDraft.not_applicable || accumRaw === '' ? null : Number(accumRaw)
    });
    setEditDraft(null);
    setCsvError('');
  };

  const addTypeToState = (state, leaveType) => {
    if (rules.some((r) => r.state === state && r.leave_type === leaveType)) {
      startEdit(rules.find((r) => r.state === state && r.leave_type === leaveType));
      return;
    }
    const next = emptyLeaveRule(state, leaveType);
    onChange([...rules, next]);
    startEdit(next);
  };

  return (
    <div className="space-y-2">
      <label htmlFor={configSelectId} className="block text-sm font-medium text-slate-700">
        Leave configuration (state-wise)
      </label>
      <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-3 text-sm text-sky-900">
        <p className="font-medium">Statutory leave rules by employee work state</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Attendance uses each hired employee&apos;s work state, not the client contract state.</li>
          <li>New clients start on Default (read-only). Pick an unassigned template, or upload a CSV to create one on save.</li>
        </ul>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          id={configSelectId}
          value={pendingNew ? '__pending__' : (namedConfigId || '')}
          onChange={(e) => setConfig(e.target.value || null)}
          className="input w-full max-w-md"
        >
          <option value="">Default</option>
          {pendingNew && (
            <option value="__pending__">
              {clientName.trim() ? `${clientName.trim()} leave config` : 'New leave config (from CSV)'}
            </option>
          )}
          {defs.filter((d) => !d.is_default).map((d) => (
            <option key={d.id} value={d.id}>
              {d.client_name ? `${d.name} (${d.client_name})` : `${d.name} (unassigned)`}
            </option>
          ))}
        </select>
        <input
          id={csvInputId}
          ref={csvInputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={onPickCsv}
        />
        <button
          type="button"
          onClick={() => csvInputRef.current?.click()}
          className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
        >
          Upload CSV
        </button>
      </div>
      {pendingNew && (
        <p className="text-xs text-slate-500">
          A new leave configuration
          {clientName.trim() ? ` named “${clientName.trim()} leave config”` : ''}
          {' '}will be created when you save this client. Super Admin will see it in Leave Config.
        </p>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
      {csvError && <p className="text-xs text-amber-700">{csvError}</p>}
      {masterError && <p className="text-xs text-red-600">{masterError}</p>}
      {isDefault && masterLoading && (
        <p className="text-xs text-slate-500">Loading default leave configuration…</p>
      )}

      <div className="w-full min-w-0 max-w-sm">
        <label htmlFor={searchId} className="mb-1 block text-xs font-medium text-slate-600">State</label>
        <div ref={stateMenuRef} className="relative">
          <input
            id={searchId}
            type="text"
            role="combobox"
            aria-expanded={stateMenuOpen}
            autoComplete="off"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setStateMenuOpen(true);
            }}
            onFocus={() => setStateMenuOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canAddState) {
                e.preventDefault();
                addSearchedState();
              }
              if (e.key === 'Escape') setStateMenuOpen(false);
            }}
            placeholder={isDefault ? 'Search state...' : 'Search or add state...'}
            className="input w-full"
          />
          {stateMenuOpen && (
            <ul className="absolute left-0 right-0 z-50 mt-1 max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
              {stateSuggestions.length === 0 ? (
                <li className="px-3 py-2 text-sm text-slate-500">No matching state</li>
              ) : (
                stateSuggestions.map((s) => (
                  <li key={s}>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => pickState(s)}
                      className={`block w-full truncate px-3 py-1.5 text-left text-sm ${
                        s === matchedState ? 'bg-indigo-50 font-medium text-indigo-900' : 'text-slate-800 hover:bg-slate-50'
                      }`}
                    >
                      {s}
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      </div>

      {grouped.length === 0 && !masterLoading && (
        <p className="text-xs text-slate-500">
          {isDefault
            ? 'No rules on Default. Import a template in Super Admin → Leave Config.'
            : 'No rules on this template. Add a state and leave types, or import in Super Admin.'}
        </p>
      )}

      <div className="space-y-2">
        {grouped.map((group) => {
          const open = Boolean(search.trim()) || expanded[group.state] === true;
          return (
            <div key={group.state} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              <button
                type="button"
                onClick={() => setExpanded((prev) => ({ ...prev, [group.state]: !open }))}
                aria-expanded={open}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-slate-50"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <IconChevron open={open} className="h-4 w-4 shrink-0 text-slate-500" />
                  <span className="text-sm font-semibold text-slate-900">{group.state}</span>
                </span>
                <span className="text-xs text-slate-500">
                  {group.rules.length} rule{group.rules.length === 1 ? '' : 's'}
                </span>
              </button>
              {open && (
                <div className="border-t border-slate-100 px-3 py-2">
                  {isDefault ? (
                    <ul className="space-y-1 text-sm">
                      {group.rules.map((r) => (
                        <li key={`${r.state}-${r.leave_type}`}>
                          <span className="font-medium text-slate-800">
                            {LEAVE_TYPE_LABELS[r.leave_type] || r.leave_type}:
                          </span>{' '}
                          <span className="text-slate-600">{describeLeaveRule(r)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="space-y-2">
                      {group.rules.map((r) => {
                        const editing = editDraft
                          && editDraft.state === r.state
                          && editDraft.leave_type === r.leave_type;
                        if (editing) {
                          return (
                            <div key={`${r.state}-${r.leave_type}`} className="space-y-2 rounded-lg border border-indigo-100 bg-indigo-50/50 p-2">
                              <p className="text-xs font-medium text-slate-700">
                                {LEAVE_TYPE_LABELS[r.leave_type] || r.leave_type}
                              </p>
                              <label className="flex items-center gap-2 text-xs text-slate-800">
                                <input
                                  type="checkbox"
                                  checked={editDraft.not_applicable}
                                  onChange={(e) => setEditDraft((p) => ({ ...p, not_applicable: e.target.checked }))}
                                />
                                Not Applicable
                              </label>
                              {!editDraft.not_applicable && (
                                <>
                                  <input
                                    type="text"
                                    value={editDraft.accrual}
                                    onChange={(e) => setEditDraft((p) => ({ ...p, accrual: e.target.value }))}
                                    placeholder="Accrual 5/60;18/240"
                                    className="input w-full text-sm"
                                  />
                                  <div className="grid grid-cols-2 gap-2">
                                    <input
                                      type="text"
                                      value={editDraft.fixed_days}
                                      onChange={(e) => setEditDraft((p) => ({ ...p, fixed_days: e.target.value }))}
                                      placeholder="Fixed days"
                                      className="input text-sm"
                                    />
                                    <input
                                      type="text"
                                      value={editDraft.accumulation_limit}
                                      onChange={(e) => setEditDraft((p) => ({ ...p, accumulation_limit: e.target.value }))}
                                      placeholder="Accumulation limit"
                                      className="input text-sm"
                                    />
                                  </div>
                                </>
                              )}
                              <div className="flex gap-2">
                                <button type="button" onClick={saveDraft} className="text-xs font-medium text-indigo-600">
                                  Save
                                </button>
                                <button type="button" onClick={() => setEditDraft(null)} className="text-xs text-slate-600">
                                  Cancel
                                </button>
                              </div>
                            </div>
                          );
                        }
                        return (
                          <div key={`${r.state}-${r.leave_type}`} className="flex flex-wrap items-start justify-between gap-2 text-sm">
                            <p>
                              <span className="font-medium text-slate-800">
                                {LEAVE_TYPE_LABELS[r.leave_type] || r.leave_type}:
                              </span>{' '}
                              <span className="text-slate-600">{describeLeaveRule(r)}</span>
                            </p>
                            <span className="shrink-0 space-x-2">
                              <button type="button" onClick={() => startEdit(r)} className="text-xs text-indigo-600">
                                Edit
                              </button>
                              <button type="button" onClick={() => removeRule(r)} className="text-xs text-red-600">
                                Remove
                              </button>
                            </span>
                          </div>
                        );
                      })}
                      <div className="flex flex-wrap gap-2 pt-1">
                        {LEAVE_TYPES.filter((t) => !group.rules.some((r) => r.leave_type === t)).map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => addTypeToState(group.state, t)}
                            className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
                          >
                            + {LEAVE_TYPE_LABELS[t]}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="sr-only">{leaveSource}</p>
    </div>
  );
}
