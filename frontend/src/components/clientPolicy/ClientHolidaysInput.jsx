import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { formatHolidayDisplayDate, normalizeHolidayName, weekdayFromIsoDate } from '../../lib/holidayCalendarCsv';
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

function masterToRows(items) {
  return (items ?? []).map((h) => ({
    state: String(h.state ?? '').trim() || null,
    holiday_date: String(h.holiday_date ?? '').slice(0, 10),
    holiday_type: normalizeHolidayType(h.holiday_type),
    holiday_name: normalizeHolidayName(h.holiday_name)
  }));
}

function hasDatedHolidays(holidays) {
  return (holidays ?? []).some((h) => String(h?.holiday_date ?? '').trim());
}

function holidayYear(h) {
  const d = String(h?.holiday_date ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const y = Number(d.slice(0, 4));
  return Number.isInteger(y) && y >= 1900 ? y : null;
}

function allDatedHolidaysAreYear(holidays, y) {
  const dated = (holidays ?? []).filter((h) => holidayYear(h) != null);
  if (!dated.length) return false;
  return dated.every((h) => holidayYear(h) === y);
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
  holidaySource = 'custom',
  onHolidaySourceChange,
  error
}) {
  const holidays = value ?? [];
  const source = holidaySource === 'default' ? 'default' : 'custom';
  const sourceName = useId();
  const yearSelectId = useId();
  const searchId = useId();
  const [year, setYear] = useState(currentYear);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState({});
  const [masterHolidays, setMasterHolidays] = useState([]);
  const [masterLoading, setMasterLoading] = useState(false);
  const [masterError, setMasterError] = useState('');
  const [stateMenuOpen, setStateMenuOpen] = useState(false);
  const stateMenuRef = useRef(null);
  const customEditedRef = useRef(false);
  const skipSeedRef = useRef(false);
  const prevYearRef = useRef(null);

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
  }, [year]);

  useEffect(() => {
    if (source !== 'custom') return;
    if (customEditedRef.current || skipSeedRef.current) return;
    if (masterLoading) return;

    const empty = !hasDatedHolidays(holidays);
    const looksLikePreviousSeed = prevYearRef.current != null
      && prevYearRef.current !== year
      && allDatedHolidaysAreYear(holidays, prevYearRef.current);

    if (!empty && !looksLikePreviousSeed) {
      if (allDatedHolidaysAreYear(holidays, year) && prevYearRef.current === year) {
        return;
      }
      skipSeedRef.current = true;
      prevYearRef.current = year;
      return;
    }

    if (empty && prevYearRef.current === year) return;

    prevYearRef.current = year;
    onChangeRef.current(masterToRows(masterHolidays));
  }, [source, year, masterHolidays, masterLoading, holidays]);

  const setSource = (next) => {
    if (typeof onHolidaySourceChange !== 'function') return;
    if (next === source) return;
    if (
      next === 'custom'
      && !skipSeedRef.current
      && !customEditedRef.current
      && !hasDatedHolidays(holidays)
    ) {
      prevYearRef.current = year;
      onChange(masterToRows(masterHolidays));
    }
    onHolidaySourceChange(next);
  };

  const displayRows = source === 'default' ? masterHolidays : holidays;
  const yearGroups = useMemo(() => groupByState(displayRows, year), [displayRows, year]);
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
  const canAddState = source === 'custom' && Boolean(matchedState) && !statesInList.has(matchedState);
  const stateSuggestions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return INDIAN_STATES;
    return INDIAN_STATES.filter((s) => s.toLowerCase().includes(q));
  }, [search]);

  const addRow = (state) => {
    customEditedRef.current = true;
    onChange([
      ...holidays,
      { state: state || null, holiday_date: '', holiday_type: 'NH', holiday_name: '' }
    ]);
    if (state) {
      setExpanded((prev) => ({ ...prev, [state]: true }));
      setSearch(state);
    }
  };

  const addSearchedState = () => {
    if (!canAddState || !matchedState) return;
    addRow(matchedState);
    setStateMenuOpen(false);
  };

  const pickState = (state) => {
    setSearch(state);
    setStateMenuOpen(false);
    if (source === 'custom' && !statesInList.has(state)) {
      addRow(state);
      return;
    }
    setExpanded((prev) => ({ ...prev, [state]: true }));
  };

  const updateRow = (index, patch) => {
    customEditedRef.current = true;
    onChange(
      holidays.map((h, i) => {
        if (i !== index) return h;
        const next = { ...h, ...patch };
        return { ...next, holiday_type: normalizeHolidayType(next.holiday_type) };
      })
    );
  };

  const removeAtAbsoluteIndex = (absIndex) => {
    customEditedRef.current = true;
    onChange(holidays.filter((_, i) => i !== absIndex));
  };

  const indexOfRow = (row) => holidays.indexOf(row);

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-slate-700">
        Client Holidays
      </label>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="inline-flex items-center gap-2">
          <input
            type="radio"
            name={sourceName}
            checked={source === 'default'}
            onChange={() => setSource('default')}
          />
          Default calendar
        </label>
        <label className="inline-flex items-center gap-2">
          <input
            type="radio"
            name={sourceName}
            checked={source === 'custom'}
            onChange={() => setSource('custom')}
          />
          Custom calendar
        </label>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-3 text-sm text-sky-900">
        <p className="font-medium">National and festival holidays</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            Attendance uses each hired employee&apos;s work state. This does not use the client&apos;s contract state.
          </li>
          <li>
            Default follows the Super Admin calendar for all states. Custom starts from that list; add or delete dates per state.
          </li>
        </ul>
      </div>

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
              placeholder={source === 'custom' ? 'Search or add state...' : 'Search state...'}
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
      {source === 'default' && masterLoading && (
        <p className="text-xs text-slate-500">Loading default calendar…</p>
      )}

      {grouped.length === 0 && !masterLoading && (
        <p className="text-xs text-slate-500">
          No holidays for {year}. Import a calendar in Super Admin → Holiday Calendar, or add dates on Custom.
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
                onClick={() => setExpanded((prev) => ({ ...prev, [key]: !open }))}
                className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-slate-50"
              >
                <span className="text-sm font-semibold text-slate-900">{label}</span>
                <span className="text-xs text-slate-500">
                  {group.holidays.length} holiday{group.holidays.length === 1 ? '' : 's'}
                </span>
              </button>
              {open && (
                <div className="border-t border-slate-100">
                  {source === 'default' ? (
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
                      {!group.legacy && (
                        <button
                          type="button"
                          onClick={() => addRow(group.state)}
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
