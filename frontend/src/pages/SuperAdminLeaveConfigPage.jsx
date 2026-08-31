import { useEffect, useMemo, useRef, useState } from 'react';
import ModalOverlay from '../components/ModalOverlay';
import { api } from '../lib/api';
import { ACTION_BTN_PRIMARY, ACTION_BTN_SECONDARY } from '../lib/actionButtonStyles';
import { triggerCsvDownload } from '../lib/clientCsv';
import {
  LEAVE_TYPE_LABELS,
  LEAVE_TYPES,
  describeLeaveRule,
  emptyLeaveRule,
  formatAccrualString,
  parseAccrualString
} from '../lib/leaveConfig';
import {
  buildLeaveConfigCsv,
  buildLeaveConfigImportSummary,
  parseLeaveConfigCsvText
} from '../lib/leaveConfigCsv';
import { INDIAN_STATES } from '../lib/indianStates';

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

function configSubtitle(def) {
  if (!def) return '';
  if (def.is_default) return 'Shared by clients on Default';
  if (def.client_name) return def.client_name;
  return 'Unassigned';
}

function blankRuleForm() {
  return {
    states: [],
    leave_type: 'earned_privileged',
    not_applicable: false,
    accrual: '5/60;18/240',
    fixed_days: '',
    accumulation_limit: '45'
  };
}

export default function SuperAdminLeaveConfigPage() {
  const [defs, setDefs] = useState([]);
  const [selectedConfigId, setSelectedConfigId] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [filterState, setFilterState] = useState('');
  const [filterType, setFilterType] = useState('');
  const [expanded, setExpanded] = useState({});

  const [importOpen, setImportOpen] = useState(false);
  const [importItems, setImportItems] = useState([]);
  const [importSummary, setImportSummary] = useState([]);
  const [importError, setImportError] = useState('');
  const fileInputRef = useRef(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createStates, setCreateStates] = useState([]);
  const [createStateSearch, setCreateStateSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [createCsvItems, setCreateCsvItems] = useState([]);
  const [createCsvSummary, setCreateCsvSummary] = useState([]);
  const [createCsvError, setCreateCsvError] = useState('');
  const [createCsvFileName, setCreateCsvFileName] = useState('');
  const createFileInputRef = useRef(null);

  const [ruleOpen, setRuleOpen] = useState(false);
  const [ruleForm, setRuleForm] = useState(blankRuleForm);
  const [ruleStateSearch, setRuleStateSearch] = useState('');
  const [ruleError, setRuleError] = useState('');

  const selectedDef = useMemo(
    () => defs.find((d) => d.id === selectedConfigId) || defs.find((d) => d.is_default) || null,
    [defs, selectedConfigId]
  );
  const activeConfigId = selectedDef?.id || selectedConfigId || '';

  const loadDefs = async ({ preferId } = {}) => {
    const data = await api.listSuperAdminLeaveConfigDefs();
    const list = Array.isArray(data) ? data : [];
    setDefs(list);
    const defaultId = list.find((d) => d.is_default)?.id || '';
    const preferred = preferId && list.some((d) => d.id === preferId)
      ? preferId
      : (defaultId || list[0]?.id || '');
    setSelectedConfigId(preferred);
    return { list, selectedId: preferred };
  };

  const load = async (configId = activeConfigId) => {
    setLoading(true);
    setError('');
    try {
      const data = await api.listSuperAdminLeaveConfigRules({
        configId: configId || undefined
      });
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || 'Could not load leave configuration.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadDefs();
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Could not load leave configurations.');
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!activeConfigId) return;
    setExpanded({});
    load(activeConfigId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConfigId]);

  const grouped = useMemo(() => {
    const byState = new Map();
    for (const row of rows) {
      if (filterState && row.state !== filterState) continue;
      if (filterType && row.leave_type !== filterType) continue;
      if (!byState.has(row.state)) byState.set(row.state, []);
      byState.get(row.state).push(row);
    }
    const states = INDIAN_STATES.filter((s) => byState.has(s));
    for (const s of byState.keys()) {
      if (!states.includes(s)) states.push(s);
    }
    return states.map((state) => ({
      state,
      rules: byState.get(state) ?? []
    }));
  }, [rows, filterState, filterType]);

  const filtersActive = Boolean(filterState || filterType);

  const handleExport = () => {
    const csv = buildLeaveConfigCsv(rows);
    const slug = String(selectedDef?.name || 'leave-config')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'leave-config';
    triggerCsvDownload(`leave-config-${slug}.csv`, csv);
  };

  const handleDownloadTemplate = async () => {
    setError('');
    try {
      const blob = await api.downloadLeaveConfigTemplate();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'leave-config-template.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message || 'Could not download template.');
    }
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
      const { items, errors } = parseLeaveConfigCsvText(text);
      if (!items.length) {
        setError(errors[0] || 'The file has no valid leave-config rows.');
        return;
      }
      setImportItems(items);
      setImportSummary(buildLeaveConfigImportSummary(items));
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

  const applyImport = async () => {
    if (!importItems.length) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const result = await api.saveSuperAdminLeaveConfigRules(importItems, {
        configId: activeConfigId || undefined
      });
      const count = Array.isArray(result?.items) ? result.items.length : importItems.length;
      await load(activeConfigId);
      const recalc = Number(result?.sheets_recalculated) || 0;
      setSuccess(
        `Imported ${count} rule(s) across ${importSummary.length} state(s).` +
          (recalc ? ` Recalculated ${recalc} attendance sheet(s).` : '')
      );
      closeImportModal();
    } catch (err) {
      setError(err.message || 'Could not import leave configuration.');
    } finally {
      setSaving(false);
    }
  };

  const toggleExpand = (state) => {
    setExpanded((prev) => ({ ...prev, [state]: !prev[state] }));
  };

  const createStateSuggestions = useMemo(() => {
    const q = createStateSearch.trim().toLowerCase();
    if (!q) return INDIAN_STATES;
    return INDIAN_STATES.filter((s) => s.toLowerCase().includes(q));
  }, [createStateSearch]);

  const ruleStateSuggestions = useMemo(() => {
    const q = ruleStateSearch.trim().toLowerCase();
    if (!q) return INDIAN_STATES;
    return INDIAN_STATES.filter((s) => s.toLowerCase().includes(q));
  }, [ruleStateSearch]);

  const toggleCreateState = (state) => {
    setCreateStates((prev) => (
      prev.includes(state) ? prev.filter((s) => s !== state) : [...prev, state]
    ));
  };

  const toggleRuleState = (state) => {
    setRuleForm((prev) => ({
      ...prev,
      states: prev.states.includes(state)
        ? prev.states.filter((s) => s !== state)
        : [...prev.states, state]
    }));
  };

  const closeCreateModal = () => {
    setCreateOpen(false);
    setCreateName('');
    setCreateStates([]);
    setCreateStateSearch('');
    setCreateCsvItems([]);
    setCreateCsvSummary([]);
    setCreateCsvError('');
    setCreateCsvFileName('');
  };

  const onPickCreateCsv = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const name = (file.name || '').toLowerCase();
    if (!name.endsWith('.csv') && file.type !== 'text/csv') {
      setCreateCsvError('Only .csv files are supported.');
      setCreateCsvItems([]);
      setCreateCsvSummary([]);
      setCreateCsvFileName('');
      return;
    }
    try {
      const text = await file.text();
      const { items, errors } = parseLeaveConfigCsvText(text);
      if (!items.length) {
        setCreateCsvError(errors[0] || 'The file has no valid leave-config rows.');
        setCreateCsvItems([]);
        setCreateCsvSummary([]);
        setCreateCsvFileName('');
        return;
      }
      setCreateCsvItems(items);
      setCreateCsvSummary(buildLeaveConfigImportSummary(items));
      setCreateCsvFileName(file.name || 'leave-config.csv');
      setCreateCsvError(errors.length ? `${errors.length} row(s) skipped due to validation errors.` : '');
      setCreateStates([]);
    } catch (err) {
      setCreateCsvError(err.message || 'Could not read the CSV file.');
      setCreateCsvItems([]);
      setCreateCsvSummary([]);
      setCreateCsvFileName('');
    }
  };

  const submitCreate = async () => {
    const name = createName.trim();
    if (!name) {
      setError('Template name is required.');
      return;
    }
    setCreating(true);
    setError('');
    setSuccess('');
    try {
      const created = await api.createSuperAdminLeaveConfigDef({
        name,
        states: createCsvItems.length ? [] : createStates,
        items: createCsvItems.length ? createCsvItems : undefined
      });
      await loadDefs({ preferId: created.id });
      if (createCsvItems.length) {
        setSuccess(
          `Created ${created.name} from CSV (${createCsvItems.length} rule(s) across ${createCsvSummary.length} state(s)).`
        );
      } else {
        setSuccess(
          createStates.length
            ? `Created ${created.name} and seeded ${createStates.length} state(s) from Default.`
            : `Created ${created.name}.`
        );
      }
      closeCreateModal();
    } catch (err) {
      setError(err.message || 'Could not create leave configuration.');
    } finally {
      setCreating(false);
    }
  };

  const openAddRule = (preset = {}) => {
    setRuleError('');
    setRuleStateSearch('');
    setRuleForm({
      ...blankRuleForm(),
      ...preset,
      states: preset.states ?? (preset.state ? [preset.state] : [])
    });
    setRuleOpen(true);
  };

  const openEditRule = (rule) => {
    openAddRule({
      states: [rule.state],
      leave_type: rule.leave_type,
      not_applicable: rule.not_applicable === true,
      accrual: formatAccrualString(rule.accrual_rules ?? []),
      fixed_days: rule.fixed_days == null ? '' : String(rule.fixed_days),
      accumulation_limit: rule.accumulation_limit == null ? '' : String(rule.accumulation_limit)
    });
  };

  const submitRule = async () => {
    if (!ruleForm.states.length) {
      setRuleError('Select at least one state.');
      return;
    }
    let accrual_rules = [];
    if (!ruleForm.not_applicable && ruleForm.accrual.trim()) {
      const parsed = parseAccrualString(ruleForm.accrual);
      if (parsed == null) {
        setRuleError('Accrual must look like 5/60 or 5/60;18/240.');
        return;
      }
      accrual_rules = parsed;
    }
    const fixedRaw = ruleForm.fixed_days.trim();
    const accumRaw = ruleForm.accumulation_limit.trim();
    const fixed_days = fixedRaw === '' ? null : Number(fixedRaw);
    const accumulation_limit = accumRaw === '' ? null : Number(accumRaw);
    if (fixedRaw !== '' && (!Number.isFinite(fixed_days) || fixed_days < 0)) {
      setRuleError('Fixed days must be a number ≥ 0.');
      return;
    }
    if (accumRaw !== '' && (!Number.isFinite(accumulation_limit) || accumulation_limit < 0)) {
      setRuleError('Accumulation limit must be a number ≥ 0.');
      return;
    }

    const items = ruleForm.states.map((state) => ({
      ...emptyLeaveRule(state, ruleForm.leave_type),
      not_applicable: ruleForm.not_applicable,
      accrual_rules: ruleForm.not_applicable ? [] : accrual_rules,
      fixed_days: ruleForm.not_applicable ? null : fixed_days,
      accumulation_limit: ruleForm.not_applicable ? null : accumulation_limit
    }));

    setSaving(true);
    setError('');
    setSuccess('');
    setRuleError('');
    try {
      const result = await api.saveSuperAdminLeaveConfigRules(items, {
        configId: activeConfigId || undefined
      });
      await load(activeConfigId);
      const recalc = Number(result?.sheets_recalculated) || 0;
      setSuccess(
        `Saved ${items.length} rule(s) for ${LEAVE_TYPE_LABELS[ruleForm.leave_type] || ruleForm.leave_type}.` +
          (recalc ? ` Recalculated ${recalc} attendance sheet(s).` : '')
      );
      setRuleOpen(false);
    } catch (err) {
      setRuleError(err.message || 'Could not save rule.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Leave Configuration</h1>
        <p className="mt-1 text-sm text-slate-500">
          Default is the shared live template. State-wise rules (accrual, fixed days, or Not Applicable)
          apply by each employee&apos;s work state. Named templates are assigned 1:1 when a client picks them.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => openAddRule()}
            disabled={loading || saving || !activeConfigId}
            className={ACTION_BTN_PRIMARY}
          >
            Add / edit rule
          </button>
          <button
            type="button"
            onClick={handleDownloadTemplate}
            disabled={loading}
            className={ACTION_BTN_SECONDARY}
          >
            Download template
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={loading || !rows.length}
            className={ACTION_BTN_SECONDARY}
          >
            Export
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={loading || saving}
            className={ACTION_BTN_PRIMARY}
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

      <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <p className="px-1 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Templates</p>
          <button
            type="button"
            onClick={() => {
              setError('');
              setCreateOpen(true);
            }}
            disabled={loading || saving}
            className={`${ACTION_BTN_SECONDARY} mb-3 w-full justify-center`}
          >
            Create template
          </button>
          <div className="max-h-[28rem] space-y-1 overflow-y-auto">
            {defs.map((def) => {
              const active = def.id === activeConfigId;
              return (
                <button
                  key={def.id}
                  type="button"
                  onClick={() => setSelectedConfigId(def.id)}
                  className={`w-full rounded-lg px-3 py-2 text-left ${
                    active ? 'bg-indigo-50 text-indigo-900' : 'text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  <span className="block text-sm font-medium">{def.name}</span>
                  <span className={`block text-xs ${active ? 'text-indigo-700' : 'text-slate-500'}`}>
                    {configSubtitle(def)}
                  </span>
                </button>
              );
            })}
            {!defs.length && !loading && (
              <p className="px-2 py-3 text-xs text-slate-500">No templates yet.</p>
            )}
          </div>
        </aside>
        <div>
          <div className="mb-3">
            <p className="text-sm font-medium text-slate-800">{selectedDef?.name || 'Template'}</p>
            <p className="text-xs text-slate-500">{configSubtitle(selectedDef)}</p>
          </div>
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="leave-filter-state" className="mb-1.5 block text-sm text-slate-600">
                State
              </label>
              <select
                id="leave-filter-state"
                value={filterState}
                onChange={(e) => setFilterState(e.target.value)}
                className="min-w-[12rem] rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              >
                <option value="">All states</option>
                {INDIAN_STATES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="leave-filter-type" className="mb-1.5 block text-sm text-slate-600">
                Leave type
              </label>
              <select
                id="leave-filter-type"
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="min-w-[12rem] rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              >
                <option value="">All types</option>
                {LEAVE_TYPES.map((t) => (
                  <option key={t} value={t}>{LEAVE_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>
          </div>

          {loading && (
            <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-500 shadow-sm">
              Loading…
            </div>
          )}

          {!loading && grouped.length === 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 shadow-sm">
              {filtersActive
                ? 'No rules match the selected filters.'
                : `No rules on ${selectedDef?.name || 'this template'}. Download the template and import a CSV, or add a rule for one or more states.`}
            </div>
          )}

          {!loading && grouped.length > 0 && (
            <div className="space-y-3">
              {grouped.map(({ state, rules }) => (
                <div key={state} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                  <button
                    type="button"
                    onClick={() => toggleExpand(state)}
                    aria-expanded={Boolean(expanded[state])}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <IconChevron open={Boolean(expanded[state])} className="h-4 w-4 shrink-0 text-slate-500" />
                      <span className="text-sm font-semibold text-slate-900">{state}</span>
                    </span>
                    <span className="text-xs text-slate-500">
                      {rules.length} rule{rules.length === 1 ? '' : 's'}
                    </span>
                  </button>
                  {expanded[state] && (
                    <div className="overflow-x-auto border-t border-slate-100">
                      <table className="min-w-full text-sm">
                        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                          <tr>
                            <th className="px-4 py-2 font-medium">Criteria</th>
                            <th className="px-4 py-2 font-medium">Rule</th>
                            <th className="px-4 py-2 font-medium" />
                          </tr>
                        </thead>
                        <tbody>
                          {rules.map((r) => (
                            <tr key={`${r.state}-${r.leave_type}`} className="border-t border-slate-100">
                              <td className="px-4 py-2 font-medium text-slate-800">
                                {LEAVE_TYPE_LABELS[r.leave_type] || r.leave_type}
                              </td>
                              <td className="px-4 py-2 text-slate-700">{describeLeaveRule(r)}</td>
                              <td className="px-4 py-2 text-right">
                                <button
                                  type="button"
                                  onClick={() => openEditRule(r)}
                                  className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
                                >
                                  Edit
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div className="border-t border-slate-100 px-4 py-2">
                        <button
                          type="button"
                          onClick={() => openAddRule({ states: [state], accrual: '', accumulation_limit: '' })}
                          className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
                        >
                          Add leave type for {state}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {importOpen && (
        <ModalOverlay onClose={closeImportModal} backdropClassName="bg-slate-900/50">
          <div className="w-[min(92vw,32rem)] rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between px-5 pt-5">
              <h2 className="text-lg font-semibold text-slate-900">Import Summary</h2>
              <button type="button" onClick={closeImportModal} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
                <IconClose className="h-5 w-5" />
              </button>
            </div>
            <div className="px-5 pt-3">
              <p className="text-sm text-slate-500">
                These state + leave-type rules on {selectedDef?.name || 'this template'} will be replaced:
              </p>
              <div className="mt-3 max-h-72 overflow-y-auto rounded-xl border border-slate-200">
                {importSummary.map((entry, idx) => (
                  <div key={entry.state} className={`px-4 py-3 ${idx > 0 ? 'border-t border-slate-100' : ''}`}>
                    <span className="text-sm font-semibold text-slate-900">{entry.state}</span>
                    <p className="mt-1 text-xs text-slate-500">
                      {entry.count} rule{entry.count === 1 ? '' : 's'}: {entry.types.join(', ')}
                    </p>
                  </div>
                ))}
              </div>
              {importError && <p className="mt-3 text-xs text-amber-700">{importError}</p>}
              <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-indigo-50 px-3.5 py-3 text-sm text-indigo-800">
                <IconInfo className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />
                <span>Existing rules for each imported state and leave type will be overwritten.</span>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4">
              <button type="button" onClick={closeImportModal} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
                Cancel
              </button>
              <button
                type="button"
                onClick={applyImport}
                disabled={saving}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {saving ? 'Importing…' : 'Import'}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {createOpen && (
        <ModalOverlay onClose={closeCreateModal} backdropClassName="bg-slate-900/50">
          <div className="w-[min(92vw,32rem)] rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between px-5 pt-5">
              <h2 className="text-lg font-semibold text-slate-900">Create template</h2>
              <button type="button" onClick={closeCreateModal} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
                <IconClose className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 px-5 pt-3">
              <div>
                <label htmlFor="new-leave-config-name" className="mb-1.5 block text-sm text-slate-600">Name</label>
                <input
                  id="new-leave-config-name"
                  type="text"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  maxLength={100}
                  placeholder="Client-specific leave config name"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm text-slate-600">Import CSV (optional)</label>
                <input ref={createFileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onPickCreateCsv} />
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => createFileInputRef.current?.click()} disabled={creating} className={ACTION_BTN_SECONDARY}>
                    {createCsvFileName ? 'Replace CSV' : 'Choose CSV'}
                  </button>
                  {createCsvFileName && (
                    <button
                      type="button"
                      onClick={() => {
                        setCreateCsvItems([]);
                        setCreateCsvSummary([]);
                        setCreateCsvError('');
                        setCreateCsvFileName('');
                      }}
                      className="text-xs text-slate-600 hover:text-slate-800"
                    >
                      Remove
                    </button>
                  )}
                </div>
                {createCsvFileName && <p className="mt-2 text-xs text-slate-600">{createCsvFileName}</p>}
                {createCsvSummary.length > 0 && (
                  <div className="mt-2 max-h-36 overflow-y-auto rounded-xl border border-slate-200">
                    {createCsvSummary.map((entry, idx) => (
                      <div key={entry.state} className={`px-3 py-2 ${idx > 0 ? 'border-t border-slate-100' : ''}`}>
                        <p className="text-sm text-slate-800">{entry.state}</p>
                        <p className="text-xs text-slate-500">{entry.count} rule{entry.count === 1 ? '' : 's'}</p>
                      </div>
                    ))}
                  </div>
                )}
                {createCsvError && <p className="mt-2 text-xs text-amber-700">{createCsvError}</p>}
              </div>
              {!createCsvItems.length && (
                <div>
                  <label htmlFor="new-leave-config-states" className="mb-1.5 block text-sm text-slate-600">
                    States to seed from Default
                  </label>
                  <input
                    id="new-leave-config-states"
                    type="text"
                    value={createStateSearch}
                    onChange={(e) => setCreateStateSearch(e.target.value)}
                    placeholder="Search states..."
                    className="mb-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  />
                  <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200">
                    {createStateSuggestions.map((state) => (
                      <label key={state} className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm text-slate-800 hover:bg-slate-50">
                        <input type="checkbox" checked={createStates.includes(state)} onChange={() => toggleCreateState(state)} />
                        <span className="truncate">{state}</span>
                      </label>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    Optional. Selected states copy Default rules. Leave empty for a blank template.
                  </p>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 px-5 py-4">
              <button type="button" onClick={closeCreateModal} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
                Cancel
              </button>
              <button
                type="button"
                onClick={submitCreate}
                disabled={creating || !createName.trim()}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {creating ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {ruleOpen && (
        <ModalOverlay onClose={() => setRuleOpen(false)} backdropClassName="bg-slate-900/50">
          <div className="w-[min(92vw,36rem)] rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between px-5 pt-5">
              <h2 className="text-lg font-semibold text-slate-900">Add / edit rule</h2>
              <button type="button" onClick={() => setRuleOpen(false)} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
                <IconClose className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 px-5 pt-3">
              <div>
                <label htmlFor="rule-leave-type" className="mb-1.5 block text-sm text-slate-600">Criteria</label>
                <select
                  id="rule-leave-type"
                  value={ruleForm.leave_type}
                  onChange={(e) => setRuleForm((p) => ({ ...p, leave_type: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm"
                >
                  {LEAVE_TYPES.map((t) => (
                    <option key={t} value={t}>{LEAVE_TYPE_LABELS[t]}</option>
                  ))}
                </select>
              </div>
              <div>
                <p className="mb-1.5 text-sm text-slate-600">
                  States ({ruleForm.states.length} selected)
                </p>
                <input
                  type="text"
                  value={ruleStateSearch}
                  onChange={(e) => setRuleStateSearch(e.target.value)}
                  placeholder="Search states..."
                  className="mb-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm"
                />
                <div className="max-h-36 overflow-y-auto rounded-xl border border-slate-200">
                  {ruleStateSuggestions.map((state) => (
                    <label key={state} className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm text-slate-800 hover:bg-slate-50">
                      <input type="checkbox" checked={ruleForm.states.includes(state)} onChange={() => toggleRuleState(state)} />
                      <span className="truncate">{state}</span>
                    </label>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-800">
                <input
                  type="checkbox"
                  checked={ruleForm.not_applicable}
                  onChange={(e) => setRuleForm((p) => ({ ...p, not_applicable: e.target.checked }))}
                />
                Not Applicable
              </label>
              {!ruleForm.not_applicable && (
                <>
                  <div>
                    <label htmlFor="rule-accrual" className="mb-1.5 block text-sm text-slate-600">
                      Accrual (days / days worked)
                    </label>
                    <input
                      id="rule-accrual"
                      type="text"
                      value={ruleForm.accrual}
                      onChange={(e) => setRuleForm((p) => ({ ...p, accrual: e.target.value }))}
                      placeholder="5/60;18/240"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm"
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      Example: 5 days for every 60 days worked and 18 for every 240 — enter 5/60;18/240. The higher clause wins.
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label htmlFor="rule-fixed" className="mb-1.5 block text-sm text-slate-600">Fixed days</label>
                      <input
                        id="rule-fixed"
                        type="text"
                        value={ruleForm.fixed_days}
                        onChange={(e) => setRuleForm((p) => ({ ...p, fixed_days: e.target.value }))}
                        placeholder="e.g. 12"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm"
                      />
                    </div>
                    <div>
                      <label htmlFor="rule-accum" className="mb-1.5 block text-sm text-slate-600">Accumulation limit</label>
                      <input
                        id="rule-accum"
                        type="text"
                        value={ruleForm.accumulation_limit}
                        onChange={(e) => setRuleForm((p) => ({ ...p, accumulation_limit: e.target.value }))}
                        placeholder="e.g. 45"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm"
                      />
                    </div>
                  </div>
                </>
              )}
              {ruleError && <p className="text-xs text-rose-600">{ruleError}</p>}
            </div>
            <div className="flex justify-end gap-2 px-5 py-4">
              <button type="button" onClick={() => setRuleOpen(false)} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
                Cancel
              </button>
              <button
                type="button"
                onClick={submitRule}
                disabled={saving}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {saving ? 'Saving…' : 'Save rule'}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </main>
  );
}
