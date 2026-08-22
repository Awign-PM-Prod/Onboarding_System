import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { formatHolidayDisplayDate, normalizeHolidayName, parseHolidayCalendarCsvText, weekdayFromIsoDate } from '../../lib/holidayCalendarCsv';
import { INDIAN_STATES } from '../../lib/indianStates';

const HOLIDAY_TYPES = [
  { value: 'NH', label: 'NH — National Holiday' },
  { value: 'FH', label: 'FH — Festival Holiday' }
];

const LEGACY_STATE_KEY = '';

function normalizeHolidayType(type) {
  return type === 'FH' ? 'FH' : 'NH';
}

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

function masterToRows(items) {
  return (items ?? []).map((h) => ({
    state: String(h.state ?? '').trim() || null,
    holiday_date: String(h.holiday_date ?? '').slice(0, 10),
    holiday_type: normalizeHolidayType(h.holiday_type),
    holiday_name: normalizeHolidayName(h.holiday_name)
  }));
}

function holidayYear(h) {
  const d = String(h?.holiday_date ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const y = Number(d.slice(0, 4));
  return Number.isInteger(y) && y >= 1900 ? y : null;
}

function stateKeyOf(h) {
  return String(h?.state ?? '').trim();
}

function hasHolidayDate(h) {
  return Boolean(String(h?.holiday_date ?? '').trim());
}

function datedHolidaysOnly(holidays) {
  return (holidays ?? []).filter(hasHolidayDate);
}

function dropUndatedOnlyState(holidays, state) {
  const st = String(state ?? '').trim();
  if (!st) return holidays ?? [];
  const dated = (holidays ?? []).some((h) => stateKeyOf(h) === st && hasHolidayDate(h));
  if (dated) return holidays ?? [];
  return (holidays ?? []).filter((h) => stateKeyOf(h) !== st);
}

function groupByState(rows, yearFilter) {
  const byState = new Map();
  for (const h of rows ?? []) {
    const y = holidayYear(h);
    if (yearFilter && y != null && y !== yearFilter) continue;
    const key = String(h.state ?? '').trim() || LEGACY_STATE_KEY;
    if (!byState.has(key)) byState.set(key, []);
    byState.get(key).push(h);
  }
  for (const list of byState.values()) {
    list.sort((a, b) => String(a.holiday_date).localeCompare(String(b.holiday_date)));
  }
  const ordered = [];
  for (const state of INDIAN_STATES) {
    if (byState.has(state)) ordered.push({ state, holidays: byState.get(state) });
  }
  for (const [state, holidays] of byState.entries()) {
    if (state && !INDIAN_STATES.includes(state)) ordered.push({ state, holidays });
  }
  if (byState.has(LEGACY_STATE_KEY)) {
    ordered.push({ state: LEGACY_STATE_KEY, holidays: byState.get(LEGACY_STATE_KEY), legacy: true });
  }
  return ordered;
}

export default function ClientHolidaysInput({
  value,
  onChange,
  holidayCalendarId = null,
  onHolidayCalendarIdChange,
  holidaySource,
  onHolidaySourceChange,
  createHolidayCalendar = false,
  onCreateHolidayCalendarChange,
  clientId = null,
  clientName = '',
  error
}) {
  const holidays = value ?? [];
  const namedCalendarId = holidayCalendarId || null;
  const pendingNewCalendar = Boolean(createHolidayCalendar) && !namedCalendarId;
  const isDefault = !namedCalendarId && !pendingNewCalendar;
  const yearSelectId = useId();
  const searchId = useId();
  const calendarSelectId = useId();
  const csvInputId = useId();
  const [year, setYear] = useState(currentYear);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState({});
  const [defs, setDefs] = useState([]);
  const [masterHolidays, setMasterHolidays] = useState([]);
  const [masterLoading, setMasterLoading] = useState(false);
  const [masterError, setMasterError] = useState('');
  const [stateMenuOpen, setStateMenuOpen] = useState(false);
  const [pinnedStates, setPinnedStates] = useState([]);
  const [draftByState, setDraftByState] = useState({});
  const [csvError, setCsvError] = useState('');
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
      .listHolidayCalendarDefs({ forClientId: clientId || undefined })
      .then((rows) => {
        if (!cancelled) setDefs(Array.isArray(rows) ? rows : []);
      })
      .catch((err) => {
        if (!cancelled) setMasterError(err.message || 'Could not load calendars.');
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
      .listHolidayCalendars({ year })
      .then((rows) => {
        if (!cancelled) setMasterHolidays(Array.isArray(rows) ? rows : []);
      })
      .catch((err) => {
        if (!cancelled) {
          setMasterHolidays([]);
          setMasterError(err.message || 'Could not load default calendar.');
        }
      })
      .finally(() => {
        if (!cancelled) setMasterLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [year, isDefault]);

  const notifyCalendarChange = (nextId, { createNew = false } = {}) => {
    if (typeof onCreateHolidayCalendarChange === 'function') {
      onCreateHolidayCalendarChange(createNew && !nextId);
    }
    if (typeof onHolidayCalendarIdChange === 'function') onHolidayCalendarIdChange(nextId);
    if (typeof onHolidaySourceChange === 'function') {
      onHolidaySourceChange(nextId || createNew ? 'custom' : 'default');
    }
  };

  const setCalendar = (nextId) => {
    const id = nextId || null;
    if (id === '__pending__') return;
    if ((id || null) === (namedCalendarId || null) && !pendingNewCalendar) return;
    notifyCalendarChange(id, { createNew: false });
    if (!id) {
      onChangeRef.current([]);
      return;
    }
    setMasterError('');
    setCsvError('');
    api
      .listHolidayCalendars({ calendarId: id })
      .then((rows) => {
        onChangeRef.current(datedHolidaysOnly(masterToRows(rows)));
      })
      .catch((err) => {
        setMasterError(err.message || 'Could not load calendar dates.');
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
      const { items, errors } = parseHolidayCalendarCsvText(text);
      if (!items.length) {
        setCsvError(errors[0] || 'The file has no valid holiday rows.');
        return;
      }
      const rows = datedHolidaysOnly(masterToRows(items));
      onChangeRef.current(rows);
      if (isDefault) {
        notifyCalendarChange(null, { createNew: true });
      }
      const years = [...new Set(rows.map((h) => holidayYear(h)).filter(Boolean))];
      if (years.length === 1) setYear(years[0]);
      if (errors.length) {
        setCsvError(`${errors.length} row(s) skipped due to validation errors.`);
      }
    } catch (err) {
      setCsvError(err.message || 'Could not read the CSV file.');
    }
  };

  const displayRows = isDefault ? masterHolidays : datedHolidaysOnly(holidays);
  const yearGroups = useMemo(() => {
    const groups = groupByState(displayRows, year);
    if (isDefault) return groups;
    const seen = new Set(groups.map((g) => g.state));
    const extras = pinnedStates
      .filter((state) => state && !seen.has(state))
      .map((state) => ({ state, holidays: [] }));
    if (!extras.length) return groups;
    const extraByState = new Map(extras.map((g) => [g.state, g]));
    const ordered = [];
    for (const state of INDIAN_STATES) {
      const existing = groups.find((g) => g.state === state);
      if (existing) ordered.push(existing);
      else if (extraByState.has(state)) ordered.push(extraByState.get(state));
    }
    for (const g of groups) {
      if (!ordered.includes(g)) ordered.push(g);
    }
    return ordered;
  }, [displayRows, year, isDefault, pinnedStates]);
  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    return yearGroups.filter((g) => {
      if (!q) return true;
      const label = g.legacy ? 'all states' : String(g.state).toLowerCase();
      return label.includes(q);
    });
  }, [yearGroups, search]);

  const statesInList = useMemo(
    () => new Set(yearGroups.map((g) => g.state).filter(Boolean)),
    [yearGroups]
  );
  const matchedState = INDIAN_STATES.find(
    (s) => s.toLowerCase() === search.trim().toLowerCase()
  );
  const canAddState = !isDefault && Boolean(matchedState) && !statesInList.has(matchedState);
  const stateSuggestions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return INDIAN_STATES;
    return INDIAN_STATES.filter((s) => s.toLowerCase().includes(q));
  }, [search]);

  useEffect(() => {
    if (isDefault) return;
    const next = datedHolidaysOnly(holidays);
    if (next.length === holidays.length) return;
    onChangeRef.current(next);
  }, [isDefault, holidays]);

  const addDraftRow = (state) => {
    if (!state || draftByState[state]) return;
    setDraftByState((prev) => ({
      ...prev,
      [state]: { state, holiday_date: '', holiday_type: 'NH', holiday_name: '' }
    }));
    setExpanded((prev) => ({ ...prev, [state]: true }));
    setPinnedStates((prev) => (prev.includes(state) ? prev : [...prev, state]));
  };

  const addSearchedState = () => {
    if (!canAddState || !matchedState) return;
    pickState(matchedState);
  };

  const pickState = (state) => {
    setSearch(state);
    setStateMenuOpen(false);
    setExpanded((prev) => ({ ...prev, [state]: true }));
    if (isDefault) return;
    setPinnedStates((prev) => (prev.includes(state) ? prev : [...prev, state]));
    const next = datedHolidaysOnly(holidays);
    if (next.length !== holidays.length) onChange(next);
  };

  const updateRow = (index, patch) => {
    const next = holidays.map((h, i) => {
      if (i !== index) return h;
      return { ...h, ...patch, holiday_type: normalizeHolidayType(patch.holiday_type ?? h.holiday_type) };
    });
    onChange(datedHolidaysOnly(next));
  };

  const commitDraft = (state, patch) => {
    const current = draftByState[state] || { state, holiday_date: '', holiday_type: 'NH', holiday_name: '' };
    const nextDraft = {
      ...current,
      ...patch,
      state,
      holiday_type: normalizeHolidayType(patch.holiday_type ?? current.holiday_type)
    };
    if (hasHolidayDate(nextDraft)) {
      onChange([...datedHolidaysOnly(holidays), nextDraft]);
      setDraftByState((prev) => {
        const copy = { ...prev };
        delete copy[state];
        return copy;
      });
      return;
    }
    setDraftByState((prev) => ({ ...prev, [state]: nextDraft }));
  };

  const removeAtAbsoluteIndex = (absIndex) => {
    onChange(datedHolidaysOnly(holidays.filter((_, i) => i !== absIndex)));
  };

  const indexOfRow = (row) => holidays.indexOf(row);

  return (
    <div className="space-y-2">
      <label htmlFor={calendarSelectId} className="block text-sm font-medium text-slate-700">
        Client Holidays
      </label>
      <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-3 text-sm text-sky-900">
        <p className="font-medium">National and festival holidays</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            Attendance uses each hired employee&apos;s work state. This does not use the client&apos;s contract state.
          </li>
          <li>
            New clients start on Default (read-only, all states). Pick an unassigned client calendar, or upload a CSV to create one on save.
          </li>
        </ul>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          id={calendarSelectId}
          value={pendingNewCalendar ? '__pending__' : (namedCalendarId || '')}
          onChange={(e) => setCalendar(e.target.value || null)}
          className="input w-full max-w-md"
        >
          <option value="">Default</option>
          {pendingNewCalendar && (
            <option value="__pending__">
              {clientName.trim() ? `${clientName.trim()} calendar` : 'New calendar (from CSV)'}
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
      {pendingNewCalendar && (
        <p className="text-xs text-slate-500">
          A new calendar
          {clientName.trim() ? ` named “${clientName.trim()} calendar”` : ''}
          {' '}will be created when you save this client. Super Admin will see it in Holiday Calendar.
        </p>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
      {csvError && <p className="text-xs text-amber-700">{csvError}</p>}

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor={yearSelectId} className="mb-1 block text-xs font-medium text-slate-600">
            Year
          </label>
          <select
            id={yearSelectId}
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="input w-full min-w-0 sm:w-auto"
          >
            {yearOptions().map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <div className="w-full min-w-0 max-w-sm">
          <label htmlFor={searchId} className="mb-1 block text-xs font-medium text-slate-600">
            State
          </label>
          <div ref={stateMenuRef} className="relative">
            <input
              id={searchId}
              type="text"
              role="combobox"
              aria-expanded={stateMenuOpen}
              aria-controls={`${searchId}-listbox`}
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
              <ul
                id={`${searchId}-listbox`}
                role="listbox"
                className="absolute left-0 right-0 z-50 mt-1 max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
              >
                {stateSuggestions.length === 0 ? (
                  <li className="px-3 py-2 text-sm text-slate-500">No matching state</li>
                ) : (
                  stateSuggestions.map((s) => (
                    <li key={s} role="option" aria-selected={s === matchedState}>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => pickState(s)}
                        className={`block w-full truncate px-3 py-1.5 text-left text-sm ${
                          s === matchedState
                            ? 'bg-indigo-50 font-medium text-indigo-900'
                            : 'text-slate-800 hover:bg-slate-50'
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
      </div>

      {masterError && <p className="text-xs text-red-600">{masterError}</p>}
      {isDefault && masterLoading && (
        <p className="text-xs text-slate-500">Loading default calendar…</p>
      )}

      {grouped.length === 0 && !masterLoading && (
        <p className="text-xs text-slate-500">
          {isDefault
            ? `No holidays for ${year}. Import a calendar in Super Admin → Holiday Calendar.`
            : `No holidays for ${year} on this calendar. Add a state and dates, or import in Super Admin.`}
        </p>
      )}

      <div className="space-y-2">
        {grouped.map((group) => {
          const key = group.legacy ? '__legacy__' : group.state;
          const open = Boolean(search.trim()) || expanded[key] === true;
          const label = group.legacy ? 'All states (legacy dates)' : group.state;
          return (
            <div key={key} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              <button
                type="button"
                onClick={() => {
                  const nextOpen = !open;
                  setExpanded((prev) => ({ ...prev, [key]: nextOpen }));
                  if (!isDefault && open && !nextOpen && group.state) {
                    setPinnedStates((prev) => prev.filter((s) => s !== group.state));
                    setDraftByState((prev) => {
                      const copy = { ...prev };
                      delete copy[group.state];
                      return copy;
                    });
                    const next = datedHolidaysOnly(dropUndatedOnlyState(holidays, group.state));
                    if (next.length !== holidays.length) onChange(next);
                  }
                }}
                aria-expanded={open}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-slate-50"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <IconChevron open={open} className="h-4 w-4 shrink-0 text-slate-500" />
                  <span className="text-sm font-semibold text-slate-900">{label}</span>
                </span>
                <span className="text-xs text-slate-500">
                  {group.holidays.length} holiday{group.holidays.length === 1 ? '' : 's'}
                </span>
              </button>
              {open && (
                <div className="border-t border-slate-100">
                  {isDefault ? (
                    <table className="min-w-full text-sm">
                      <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-3 py-2 font-medium">Date</th>
                          <th className="px-3 py-2 font-medium">Holiday Name</th>
                          <th className="px-3 py-2 font-medium">Day</th>
                          <th className="px-3 py-2 font-medium">NH/FH</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.holidays.map((h) => (
                          <tr key={`${h.state}-${h.holiday_date}`} className="border-t border-slate-100">
                            <td className="px-3 py-2 text-slate-800">{formatHolidayDisplayDate(h.holiday_date)}</td>
                            <td className="px-3 py-2 text-slate-800">{h.holiday_name || '—'}</td>
                            <td className="px-3 py-2 text-slate-600">
                              {h.weekday || weekdayFromIsoDate(h.holiday_date)}
                            </td>
                            <td className="px-3 py-2 text-slate-800">{normalizeHolidayType(h.holiday_type)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="space-y-2 px-3 py-2">
                      {group.holidays.map((h) => {
                        const abs = indexOfRow(h);
                        return (
                          <div key={abs < 0 ? `${h.state}-${h.holiday_date}` : abs} className="flex flex-wrap items-center gap-2">
                            <input
                              type="date"
                              value={h.holiday_date ?? ''}
                              onChange={(e) => updateRow(abs, { holiday_date: e.target.value })}
                              className="input w-full min-w-0 sm:w-auto sm:shrink-0"
                            />
                            <input
                              type="text"
                              value={h.holiday_name ?? ''}
                              onChange={(e) => updateRow(abs, { holiday_name: e.target.value })}
                              placeholder="Holiday name"
                              maxLength={120}
                              className="input min-w-0 flex-1 sm:min-w-[10rem]"
                            />
                            <span className="text-xs text-slate-500">
                              {weekdayFromIsoDate(h.holiday_date) || '—'}
                            </span>
                            <select
                              value={normalizeHolidayType(h.holiday_type)}
                              onChange={(e) => updateRow(abs, { holiday_type: e.target.value })}
                              className="input w-full min-w-0 sm:w-auto sm:min-w-[12rem] sm:shrink-0"
                            >
                              {HOLIDAY_TYPES.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => removeAtAbsoluteIndex(abs)}
                              className="shrink-0 text-xs text-red-600 hover:text-red-800"
                            >
                              Remove
                            </button>
                          </div>
                        );
                      })}
                      {draftByState[group.state] && (
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            type="date"
                            value={draftByState[group.state].holiday_date ?? ''}
                            onChange={(e) => commitDraft(group.state, { holiday_date: e.target.value })}
                            className="input w-full min-w-0 sm:w-auto sm:shrink-0"
                          />
                          <input
                            type="text"
                            value={draftByState[group.state].holiday_name ?? ''}
                            onChange={(e) => commitDraft(group.state, { holiday_name: e.target.value })}
                            placeholder="Holiday name"
                            maxLength={120}
                            className="input min-w-0 flex-1 sm:min-w-[10rem]"
                          />
                          <span className="text-xs text-slate-500">
                            {weekdayFromIsoDate(draftByState[group.state].holiday_date) || '—'}
                          </span>
                          <select
                            value={normalizeHolidayType(draftByState[group.state].holiday_type)}
                            onChange={(e) => commitDraft(group.state, { holiday_type: e.target.value })}
                            className="input w-full min-w-0 sm:w-auto sm:min-w-[12rem] sm:shrink-0"
                          >
                            {HOLIDAY_TYPES.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => {
                              setDraftByState((prev) => {
                                const copy = { ...prev };
                                delete copy[group.state];
                                return copy;
                              });
                            }}
                            className="shrink-0 text-xs text-red-600 hover:text-red-800"
                          >
                            Remove
                          </button>
                        </div>
                      )}
                      {!group.legacy && !draftByState[group.state] && (
                        <button
                          type="button"
                          onClick={() => addDraftRow(group.state)}
                          className="text-xs text-indigo-600 hover:text-indigo-800"
                        >
                          + Add holiday
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
