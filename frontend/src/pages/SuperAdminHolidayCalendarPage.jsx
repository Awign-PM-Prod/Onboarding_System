import { useEffect, useMemo, useRef, useState } from 'react';
import ModalOverlay from '../components/ModalOverlay';
import { api } from '../lib/api';
import { ACTION_BTN_PRIMARY, ACTION_BTN_SECONDARY } from '../lib/actionButtonStyles';
import { triggerCsvDownload } from '../lib/clientCsv';
import {
  buildHolidayCalendarCsv,
  buildHolidayCalendarImportSummary,
  formatHolidayDisplayDate,
  parseHolidayCalendarCsvText,
  weekdayFromIsoDate
} from '../lib/holidayCalendarCsv';
import { INDIAN_STATES } from '../lib/indianStates';

const MONTHS = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' }
];

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function currentYear() {
  return new Date().getFullYear();
}

function yearOptions() {
  const y = currentYear();
  const out = [];
  for (let i = y - 2; i <= y + 2; i += 1) out.push(i);
  return out;
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

function monthFromIso(isoDate) {
  const m = Number(String(isoDate ?? '').slice(5, 7));
  return Number.isInteger(m) && m >= 1 && m <= 12 ? m : null;
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

function calendarSubtitle(def) {
  if (!def) return '';
  if (def.is_default) return 'Shared by clients on Default';
  if (def.client_name) return def.client_name;
  return 'Unassigned';
}

export default function SuperAdminHolidayCalendarPage() {
  const [year, setYear] = useState(currentYear);
  const [defs, setDefs] = useState([]);
  const [selectedCalendarId, setSelectedCalendarId] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [filterState, setFilterState] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [filterDay, setFilterDay] = useState('');
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

  const selectedDef = useMemo(
    () => defs.find((d) => d.id === selectedCalendarId) || defs.find((d) => d.is_default) || null,
    [defs, selectedCalendarId]
  );
  const activeCalendarId = selectedDef?.id || selectedCalendarId || '';

  const loadDefs = async ({ preferId } = {}) => {
    const data = await api.listSuperAdminHolidayCalendarDefs();
    const list = Array.isArray(data) ? data : [];
    setDefs(list);
    const defaultId = list.find((d) => d.is_default)?.id || '';
    const preferred = preferId && list.some((d) => d.id === preferId)
      ? preferId
      : (defaultId || list[0]?.id || '');
    setSelectedCalendarId(preferred);
    return { list, selectedId: preferred };
  };

  const load = async (nextYear = year, calendarId = activeCalendarId) => {
    setLoading(true);
    setError('');
    try {
      const data = await api.listSuperAdminHolidayCalendars({
        year: nextYear,
        calendarId: calendarId || undefined
      });
      const list = Array.isArray(data) ? data : [];
      setRows(list);
    } catch (err) {
      setError(err.message || 'Could not load holiday calendars.');
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
          setError(err.message || 'Could not load holiday calendars.');
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
    if (!activeCalendarId) return;
    setExpanded({});
    load(year, activeCalendarId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, activeCalendarId]);

  const grouped = useMemo(() => {
    const byState = new Map();
    for (const row of rows) {
      if (filterState && row.state !== filterState) continue;
      if (filterMonth && monthFromIso(row.holiday_date) !== Number(filterMonth)) continue;
      const weekday = String(row.weekday || weekdayFromIsoDate(row.holiday_date) || '').trim();
      if (filterDay && weekday.toLowerCase() !== String(filterDay).toLowerCase()) continue;
      if (filterType && row.holiday_type !== filterType) continue;
      if (!byState.has(row.state)) byState.set(row.state, []);
      byState.get(row.state).push(row);
    }
    const states = INDIAN_STATES.filter((s) => byState.has(s));
    for (const s of byState.keys()) {
      if (!states.includes(s)) states.push(s);
    }
    return states.map((state) => ({
      state,
      holidays: byState.get(state) ?? []
    }));
  }, [rows, filterState, filterMonth, filterDay, filterType]);

  const filtersActive = Boolean(filterState || filterMonth || filterDay || filterType);

  const handleExport = () => {
    const csv = buildHolidayCalendarCsv(rows);
    const slug = String(selectedDef?.name || 'calendar')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'calendar';
    triggerCsvDownload(`holiday-calendar-${slug}-${year}.csv`, csv);
  };

  const handleDownloadTemplate = async () => {
    setError('');
    try {
      const blob = await api.downloadHolidayCalendarTemplate();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'holiday-calendar-template.csv';
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
      const { items, errors } = parseHolidayCalendarCsvText(text);
      if (!items.length) {
        setError(errors[0] || 'The file has no valid holiday rows.');
        return;
      }
      setImportItems(items);
      setImportSummary(buildHolidayCalendarImportSummary(items));
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
      const result = await api.saveSuperAdminHolidayCalendars(importItems, {
        calendarId: activeCalendarId || undefined
      });
      const count = Array.isArray(result?.items) ? result.items.length : importItems.length;
      const years = [...new Set(importItems.map((i) => String(i.holiday_date).slice(0, 4)))];
      if (years.length === 1) setYear(Number(years[0]));
      await load(years.length === 1 ? Number(years[0]) : year, activeCalendarId);
      const recalc = Number(result?.sheets_recalculated) || 0;
      setSuccess(
        `Imported ${count} holiday(s) across ${importSummary.length} state-year set(s).` +
          (recalc ? ` Recalculated ${recalc} attendance sheet(s).` : '')
      );
      closeImportModal();
    } catch (err) {
      setError(err.message || 'Could not import holiday calendar.');
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

  const toggleCreateState = (state) => {
    setCreateStates((prev) => (
      prev.includes(state) ? prev.filter((s) => s !== state) : [...prev, state]
    ));
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
      const { items, errors } = parseHolidayCalendarCsvText(text);
      if (!items.length) {
        setCreateCsvError(errors[0] || 'The file has no valid holiday rows.');
        setCreateCsvItems([]);
        setCreateCsvSummary([]);
        setCreateCsvFileName('');
        return;
      }
      setCreateCsvItems(items);
      setCreateCsvSummary(buildHolidayCalendarImportSummary(items));
      setCreateCsvFileName(file.name || 'holidays.csv');
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
      setError('Calendar name is required.');
      return;
    }
    setCreating(true);
    setError('');
    setSuccess('');
    try {
      const created = await api.createSuperAdminHolidayCalendarDef({
        name,
        states: createCsvItems.length ? [] : createStates,
        year,
        items: createCsvItems.length ? createCsvItems : undefined
      });
      await loadDefs({ preferId: created.id });
      if (createCsvItems.length) {
        const years = [...new Set(createCsvItems.map((i) => String(i.holiday_date).slice(0, 4)))];
        if (years.length === 1) setYear(Number(years[0]));
        setSuccess(
          `Created ${created.name} from CSV (${createCsvItems.length} holiday(s) across ${createCsvSummary.length} state-year set(s)).`
        );
      } else {
        setSuccess(
          createStates.length
            ? `Created ${created.name} and seeded ${createStates.length} state(s) from Default for ${year}.`
            : `Created ${created.name}.`
        );
      }
      closeCreateModal();
    } catch (err) {
      setError(err.message || 'Could not create calendar.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Holiday Calendar</h1>
        <p className="mt-1 text-sm text-slate-500">
          Default is the shared live calendar. Client-specific calendars are assigned 1:1 when a client picks them.
          Import of Default recalculates Default clients; import of a named calendar recalculates only that client.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
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
          <p className="px-1 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Calendars</p>
          <button
            type="button"
            onClick={() => {
              setError('');
              setCreateOpen(true);
            }}
            disabled={loading || saving}
            className={`${ACTION_BTN_SECONDARY} mb-3 w-full justify-center`}
          >
            Create calendar
          </button>
          <div className="max-h-[28rem] space-y-1 overflow-y-auto">
            {defs.map((def) => {
              const active = def.id === activeCalendarId;
              return (
                <button
                  key={def.id}
                  type="button"
                  onClick={() => setSelectedCalendarId(def.id)}
                  className={`w-full rounded-lg px-3 py-2 text-left ${
                    active ? 'bg-indigo-50 text-indigo-900' : 'text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  <span className="block text-sm font-medium">{def.name}</span>
                  <span className={`block text-xs ${active ? 'text-indigo-700' : 'text-slate-500'}`}>
                    {calendarSubtitle(def)}
                  </span>
                </button>
              );
            })}
            {!defs.length && !loading && (
              <p className="px-2 py-3 text-xs text-slate-500">No calendars yet.</p>
            )}
          </div>
        </aside>
        <div>
      <div className="mb-3">
        <p className="text-sm font-medium text-slate-800">
          {selectedDef?.name || 'Calendar'}
        </p>
        <p className="text-xs text-slate-500">{calendarSubtitle(selectedDef)}</p>
      </div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="holiday-year" className="mb-1.5 block text-sm text-slate-600">
            Year
          </label>
          <select
            id="holiday-year"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          >
            {yearOptions().map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="holiday-filter-state" className="mb-1.5 block text-sm text-slate-600">
            State
          </label>
          <select
            id="holiday-filter-state"
            value={filterState}
            onChange={(e) => setFilterState(e.target.value)}
            className="min-w-[12rem] rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          >
            <option value="">All states</option>
            {INDIAN_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="holiday-filter-month" className="mb-1.5 block text-sm text-slate-600">
            Month
          </label>
          <select
            id="holiday-filter-month"
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          >
            <option value="">All months</option>
            {MONTHS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="holiday-filter-day" className="mb-1.5 block text-sm text-slate-600">
            Days
          </label>
          <select
            id="holiday-filter-day"
            value={filterDay}
            onChange={(e) => setFilterDay(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          >
            <option value="">All days</option>
            {WEEKDAYS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="holiday-filter-type" className="mb-1.5 block text-sm text-slate-600">
            NH or FH
          </label>
          <select
            id="holiday-filter-type"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          >
            <option value="">All</option>
            <option value="NH">NH</option>
            <option value="FH">FH</option>
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
            ? `No holidays match the selected filters for ${year}.`
            : `No holidays for ${year} on ${selectedDef?.name || 'this calendar'}. Download the template and import a CSV with columns state, date, day, NH/FH, Holiday Name.`}
        </div>
      )}

      {!loading && grouped.length > 0 && (
        <div className="space-y-3">
          {grouped.map(({ state, holidays }) => (
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
                  {holidays.length} holiday{holidays.length === 1 ? '' : 's'}
                </span>
              </button>
              {expanded[state] && (
                <div className="overflow-x-auto border-t border-slate-100">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-2 font-medium">Date</th>
                        <th className="px-4 py-2 font-medium">Holiday Name</th>
                        <th className="px-4 py-2 font-medium">Day</th>
                        <th className="px-4 py-2 font-medium">NH/FH</th>
                      </tr>
                    </thead>
                    <tbody>
                      {holidays.map((h) => (
                        <tr key={`${h.state}-${h.holiday_date}`} className="border-t border-slate-100">
                          <td className="px-4 py-2 text-slate-800">{formatHolidayDisplayDate(h.holiday_date)}</td>
                          <td className="px-4 py-2 text-slate-800">{h.holiday_name || '—'}</td>
                          <td className="px-4 py-2 text-slate-600">{h.weekday}</td>
                          <td className="px-4 py-2">
                            <span
                              className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                                h.holiday_type === 'FH'
                                  ? 'bg-amber-50 text-amber-800'
                                  : 'bg-indigo-50 text-indigo-700'
                              }`}
                            >
                              {h.holiday_type}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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
              <p className="text-sm text-slate-500">
                These state-year sets on {selectedDef?.name || 'this calendar'} will be replaced with the imported dates:
              </p>
              <div className="mt-3 max-h-72 overflow-y-auto rounded-xl border border-slate-200">
                {importSummary.map((entry, idx) => (
                  <div
                    key={`${entry.state}-${entry.year}`}
                    className={`px-4 py-3 ${idx > 0 ? 'border-t border-slate-100' : ''}`}
                  >
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-sm font-semibold text-slate-900">{entry.state}</span>
                      <span className="text-sm text-slate-400">• {entry.year}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {entry.count} date{entry.count === 1 ? '' : 's'} ({entry.nh} NH, {entry.fh} FH)
                    </p>
                  </div>
                ))}
              </div>
              {importError && <p className="mt-3 text-xs text-amber-700">{importError}</p>}
              <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-indigo-50 px-3.5 py-3 text-sm text-indigo-800">
                <IconInfo className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />
                <span>
                  Existing holidays for each imported state and year will be overwritten. Other years stay unchanged.
                </span>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4">
              <button
                type="button"
                onClick={closeImportModal}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
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
              <h2 className="text-lg font-semibold text-slate-900">Create calendar</h2>
              <button
                type="button"
                onClick={closeCreateModal}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close"
              >
                <IconClose className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 px-5 pt-3">
              <div>
                <label htmlFor="new-calendar-name" className="mb-1.5 block text-sm text-slate-600">
                  Name
                </label>
                <input
                  id="new-calendar-name"
                  type="text"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  maxLength={100}
                  placeholder="Client-specific calendar name"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm text-slate-600">Import CSV (optional)</label>
                <input
                  ref={createFileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={onPickCreateCsv}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => createFileInputRef.current?.click()}
                    disabled={creating}
                    className={ACTION_BTN_SECONDARY}
                  >
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
                {createCsvFileName && (
                  <p className="mt-2 text-xs text-slate-600">{createCsvFileName}</p>
                )}
                {createCsvSummary.length > 0 && (
                  <div className="mt-2 max-h-36 overflow-y-auto rounded-xl border border-slate-200">
                    {createCsvSummary.map((entry, idx) => (
                      <div
                        key={`${entry.state}-${entry.year}`}
                        className={`px-3 py-2 ${idx > 0 ? 'border-t border-slate-100' : ''}`}
                      >
                        <p className="text-sm text-slate-800">
                          {entry.state} <span className="text-slate-400">• {entry.year}</span>
                        </p>
                        <p className="text-xs text-slate-500">
                          {entry.count} date{entry.count === 1 ? '' : 's'} ({entry.nh} NH, {entry.fh} FH)
                        </p>
                      </div>
                    ))}
                  </div>
                )}
                {createCsvError && <p className="mt-2 text-xs text-amber-700">{createCsvError}</p>}
                <p className="mt-2 text-xs text-slate-500">
                  Same template as Import CSV. Dates are saved on this new calendar only, not Default.
                </p>
              </div>
              {!createCsvItems.length && (
              <div>
                <label htmlFor="new-calendar-states" className="mb-1.5 block text-sm text-slate-600">
                  States to seed from Default ({year})
                </label>
                <input
                  id="new-calendar-states"
                  type="text"
                  value={createStateSearch}
                  onChange={(e) => setCreateStateSearch(e.target.value)}
                  placeholder="Search states..."
                  className="mb-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                />
                <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200">
                  {createStateSuggestions.map((state) => (
                    <label
                      key={state}
                      className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm text-slate-800 hover:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        checked={createStates.includes(state)}
                        onChange={() => toggleCreateState(state)}
                      />
                      <span className="truncate">{state}</span>
                    </label>
                  ))}
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  Optional. Selected states copy Default dates for {year}. Leave empty for a blank calendar.
                </p>
              </div>
              )}
            </div>
            <div className="flex justify-end gap-2 px-5 py-4">
              <button
                type="button"
                onClick={closeCreateModal}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
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
    </main>
  );
}
