import { useEffect, useMemo, useRef, useState } from 'react';

/** Predefined designations Payroll Lead can multi-select when creating/editing a client. */
export const DESIGNATION_OPTIONS = [
  'HRManager',
  'OperationsManager',
  'Recruiter',
  'Accountant',
  'TeamLead',
  'FieldExecutive',
  'Supervisor',
  'QualityAnalyst',
  'DataEntryOperator',
  'StoreManager'
];

const OTHERS_LABEL = 'Others';

function normalizeName(name) {
  return String(name ?? '').trim();
}

function namesMatch(a, b) {
  return normalizeName(a).toLowerCase() === normalizeName(b).toLowerCase();
}

export default function DesignationsInput({ value = [], onChange }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [showOtherInput, setShowOtherInput] = useState(false);
  const [otherName, setOtherName] = useState('');
  const [otherError, setOtherError] = useState('');
  const rootRef = useRef(null);
  const otherInputRef = useRef(null);

  const selected = Array.isArray(value) ? value : [];

  const selectedSet = useMemo(
    () => new Set(selected.map((v) => normalizeName(v)).filter(Boolean)),
    [selected]
  );

  // Keep any existing custom values (e.g. from older clients) visible even if not in the catalog.
  const catalog = useMemo(() => {
    const extras = selected.filter(
      (name) => !DESIGNATION_OPTIONS.some((opt) => namesMatch(opt, name))
    );
    return [...DESIGNATION_OPTIONS, ...extras];
  }, [selected]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter((opt) => opt.toLowerCase().includes(q));
  }, [catalog, query]);

  const othersVisible =
    !query.trim() || OTHERS_LABEL.toLowerCase().includes(query.trim().toLowerCase());

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false);
        setQuery('');
        setShowOtherInput(false);
        setOtherName('');
        setOtherError('');
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  useEffect(() => {
    if (showOtherInput && otherInputRef.current) {
      otherInputRef.current.focus();
    }
  }, [showOtherInput]);

  const toggle = (name) => {
    if (selectedSet.has(name)) {
      onChange(selected.filter((t) => t !== name));
      return;
    }
    onChange([...selected, name]);
  };

  const removeTag = (tag) => {
    onChange(selected.filter((t) => t !== tag));
  };

  const addOtherDesignation = () => {
    const name = normalizeName(otherName);
    if (!name) {
      setOtherError('Enter a designation name');
      return;
    }
    if (namesMatch(name, OTHERS_LABEL)) {
      setOtherError('Choose a specific designation name');
      return;
    }
    if (selected.some((t) => namesMatch(t, name))) {
      setOtherError('This designation is already selected');
      return;
    }
    onChange([...selected, name]);
    setOtherName('');
    setOtherError('');
    setShowOtherInput(false);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full flex-wrap items-center gap-2 rounded-md border border-slate-300 bg-white px-2 py-2 text-left focus:outline-none focus:ring-2 focus:ring-indigo-300"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {selected.length === 0 && (
          <span className="px-1 text-sm text-slate-400">Select designations…</span>
        )}
        {selected.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded bg-indigo-50 px-2 py-0.5 text-sm text-indigo-700"
          >
            {tag}
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                removeTag(tag);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  removeTag(tag);
                }
              }}
              className="cursor-pointer text-indigo-500 hover:text-indigo-800"
              aria-label={`Remove ${tag}`}
            >
              ×
            </span>
          </span>
        ))}
        {selected.length > 0 && (
          <span className="px-1 text-sm text-slate-400">Add another…</span>
        )}
      </button>

      <p className="mt-1 text-xs text-slate-500">
        Select one or more designations from the list, or choose Others to add a custom name.
      </p>

      {open && (
        <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="border-b border-slate-100 px-3 py-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search designations…"
              className="w-full rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-indigo-300"
              autoFocus
            />
          </div>
          <ul className="max-h-56 overflow-y-auto py-1" role="listbox" aria-multiselectable="true">
            {filtered.length === 0 && !othersVisible && (
              <li className="px-3 py-2 text-sm text-slate-500">No matching designations.</li>
            )}
            {filtered.map((opt) => {
              const checked = selectedSet.has(opt);
              return (
                <li key={opt}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm text-slate-800 hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(opt)}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>{opt}</span>
                  </label>
                </li>
              );
            })}
            {othersVisible && (
              <li className="border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setShowOtherInput(true);
                    setOtherError('');
                  }}
                  className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                    showOtherInput ? 'bg-indigo-50 text-indigo-700' : 'text-slate-800'
                  }`}
                >
                  <span
                    className={`flex h-4 w-4 items-center justify-center rounded border ${
                      showOtherInput
                        ? 'border-indigo-600 bg-indigo-600 text-white'
                        : 'border-slate-300 bg-white'
                    }`}
                    aria-hidden
                  >
                    {showOtherInput ? '✓' : ''}
                  </span>
                  <span className="font-medium">{OTHERS_LABEL}</span>
                </button>
                {showOtherInput && (
                  <div className="space-y-2 bg-slate-50 px-3 pb-3 pt-1">
                    <input
                      ref={otherInputRef}
                      type="text"
                      value={otherName}
                      onChange={(e) => {
                        setOtherName(e.target.value);
                        if (otherError) setOtherError('');
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addOtherDesignation();
                        }
                      }}
                      placeholder="Enter designation name"
                      className="w-full rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-indigo-300"
                    />
                    {otherError && <p className="text-xs text-red-600">{otherError}</p>}
                    <button
                      type="button"
                      onClick={addOtherDesignation}
                      className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
                    >
                      Add designation
                    </button>
                  </div>
                )}
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
