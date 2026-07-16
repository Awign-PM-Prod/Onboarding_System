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

export default function DesignationsInput({ value = [], onChange }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef(null);

  const selected = Array.isArray(value) ? value : [];

  const selectedSet = useMemo(
    () => new Set(selected.map((v) => String(v).trim()).filter(Boolean)),
    [selected]
  );

  // Keep any existing custom values (e.g. from older clients) visible even if not in the catalog.
  const catalog = useMemo(() => {
    const extras = selected.filter(
      (name) => !DESIGNATION_OPTIONS.some((opt) => opt.toLowerCase() === String(name).toLowerCase())
    );
    return [...DESIGNATION_OPTIONS, ...extras];
  }, [selected]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter((opt) => opt.toLowerCase().includes(q));
  }, [catalog, query]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

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

      <p className="mt-1 text-xs text-slate-500">Select one or more designations from the list.</p>

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
            {filtered.length === 0 && (
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
          </ul>
        </div>
      )}
    </div>
  );
}
