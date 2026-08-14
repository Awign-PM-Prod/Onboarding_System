import { useMemo, useState } from 'react';
import {
  MONTH_OPTIONS,
  WEEK_OPTIONS,
  buildYearOptions,
  customRangeLabel
} from '../lib/superAdminDateRange';

function ChevronDownIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
  );
}

function CalendarIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.75 3v2.25M17.25 3v2.25M3.75 8.25h16.5M4.5 6.75h15A1.5 1.5 0 0121 8.25v11.25A1.5 1.5 0 0119.5 21h-15A1.5 1.5 0 013 19.5V8.25A1.5 1.5 0 014.5 6.75z"
      />
    </svg>
  );
}

function FilterSelect({ id, value, onChange, options, className = '' }) {
  return (
    <div className={`relative inline-flex min-w-0 ${className}`}>
      <select
        id={id}
        value={value}
        onChange={onChange}
        className="w-full appearance-none rounded-lg border border-slate-200 bg-white py-2.5 pl-3.5 pr-9 text-sm font-medium text-slate-800 shadow-sm hover:border-slate-300 focus:border-slate-400 focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value || o.label} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
    </div>
  );
}

const PRESET_OPTIONS = [
  { value: '', label: 'All time' },
  { value: '30', label: 'Past 30 days' },
  { value: '7', label: 'Past 7 days' }
];

/**
 * Controlled date filters.
 * - default: Month / Year / Week / Custom Date Range
 * - presets: All time dropdown (Past 7 / 30 days) + Custom Date Range
 * Parent owns applied state; draft custom dates live locally until Apply.
 */
export default function SuperAdminDateRangeFilters({
  month,
  year,
  week,
  appliedCustomFrom,
  appliedCustomTo,
  onMonthChange,
  onYearChange,
  onWeekChange,
  onCustomApply,
  onCustomClear,
  onCustomError,
  /** '' | '7' | '30' — used when variant="presets" */
  preset = '',
  onPresetChange,
  variant = 'default',
  idPrefix = 'sa-date',
  className = ''
}) {
  const yearOptions = useMemo(() => buildYearOptions(), []);
  const [customOpen, setCustomOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const hasCustomRange = Boolean(appliedCustomFrom || appliedCustomTo);
  const label = customRangeLabel(appliedCustomFrom, appliedCustomTo);

  const clearLocalCustom = () => {
    setCustomFrom('');
    setCustomTo('');
    setCustomOpen(false);
  };

  const handleClearCustom = () => {
    clearLocalCustom();
    onCustomClear?.();
    if (variant === 'presets') onPresetChange?.('');
  };

  const handleApplyCustom = () => {
    if (customFrom && customTo && customFrom > customTo) {
      onCustomError?.('Custom range: start date must be on or before end date.');
      return;
    }
    if (!customFrom && !customTo) {
      onCustomError?.('Custom range: pick at least a start or end date.');
      return;
    }
    onPresetChange?.('');
    onCustomApply?.(customFrom, customTo);
    setCustomOpen(false);
  };

  const handlePresetSelect = (value) => {
    clearLocalCustom();
    onCustomClear?.();
    onMonthChange?.('');
    onYearChange?.('');
    onWeekChange?.('');
    onPresetChange?.(value);
  };

  const customButton = (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          if (!customOpen) {
            setCustomFrom(appliedCustomFrom || '');
            setCustomTo(appliedCustomTo || '');
          }
          setCustomOpen((v) => !v);
        }}
        className={`inline-flex items-center gap-2 rounded-lg border bg-white px-3.5 py-2.5 text-sm font-medium shadow-sm hover:border-indigo-300 ${
          hasCustomRange
            ? 'border-indigo-500 text-indigo-700'
            : 'border-slate-200 text-slate-800'
        }`}
      >
        <CalendarIcon className={`h-4 w-4 ${hasCustomRange ? 'text-indigo-500' : 'text-slate-500'}`} />
        <span className="max-w-[16rem] truncate">{label}</span>
        <ChevronDownIcon className={`h-4 w-4 ${hasCustomRange ? 'text-indigo-500' : 'text-slate-500'}`} />
      </button>
      {customOpen && (
        <div className="absolute left-0 z-20 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Custom date range
          </p>
          <div className="mt-2 space-y-2">
            <label className="block text-xs text-slate-600">
              From
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-800"
              />
            </label>
            <label className="block text-xs text-slate-600">
              To
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-800"
              />
            </label>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={handleClearCustom}
              className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={handleApplyCustom}
              className="rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );

  if (variant === 'presets') {
    return (
      <div className={`flex flex-wrap items-center gap-2 ${className}`}>
        <FilterSelect
          id={`${idPrefix}-preset`}
          value={hasCustomRange ? '' : preset}
          onChange={(e) => handlePresetSelect(e.target.value)}
          options={PRESET_OPTIONS}
          className="w-[9.5rem]"
        />
        {customButton}
      </div>
    );
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <FilterSelect
        id={`${idPrefix}-month`}
        value={month}
        onChange={(e) => {
          handleClearCustom();
          onPresetChange?.('');
          onMonthChange?.(e.target.value);
        }}
        options={MONTH_OPTIONS}
        className="w-[9.5rem]"
      />
      <FilterSelect
        id={`${idPrefix}-year`}
        value={year}
        onChange={(e) => {
          handleClearCustom();
          onPresetChange?.('');
          onYearChange?.(e.target.value);
        }}
        options={yearOptions}
        className="w-[7.5rem]"
      />
      <FilterSelect
        id={`${idPrefix}-week`}
        value={week}
        onChange={(e) => {
          handleClearCustom();
          onPresetChange?.('');
          onWeekChange?.(e.target.value);
        }}
        options={WEEK_OPTIONS}
        className="w-[10.5rem]"
      />
      {customButton}
    </div>
  );
}

export { FilterSelect };
