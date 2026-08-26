import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Searchable multi-select dropdown for program managers.
 * value: string[] of user ids
 * options: [{ id, name, email }]
 */
export default function ProgramManagersMultiSelect({
  value = [],
  options = [],
  onChange,
  placeholder = 'Select program managers',
  disabled = false
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef(null);

  const selectedIds = useMemo(
    () => [...new Set((value ?? []).map((id) => String(id)).filter(Boolean))],
    [value]
  );
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const selectedPms = useMemo(
    () => (options ?? []).filter((pm) => selectedSet.has(pm.id)),
    [options, selectedSet]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = options ?? [];
    if (!q) return list;
    return list.filter((pm) => {
      const name = String(pm.name ?? '').toLowerCase();
      const email = String(pm.email ?? '').toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [options, query]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false);
        setQuery('');
      }
    };
    const onKey = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const emit = (nextIds) => {
    onChange?.([...new Set(nextIds)]);
  };

  const toggle = (pmId) => {
    if (selectedSet.has(pmId)) {
      emit(selectedIds.filter((id) => id !== pmId));
      return;
    }
    emit([...selectedIds, pmId]);
  };

  const removeTag = (pmId) => {
    emit(selectedIds.filter((id) => id !== pmId));
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen((v) => !v);
        }}
        className="input flex min-h-[42px] w-full flex-wrap items-center gap-1.5 text-left disabled:cursor-not-allowed disabled:bg-slate-100"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {selectedPms.length === 0 ? (
          <span className="text-slate-400">{placeholder}</span>
        ) : (
          selectedPms.map((pm) => (
            <span
              key={pm.id}
              className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-800"
            >
              <span>{pm.name || pm.email || pm.id}</span>
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  removeTag(pm.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    removeTag(pm.id);
                  }
                }}
                className="cursor-pointer text-indigo-500 hover:text-indigo-800"
                aria-label={`Remove ${pm.name || pm.email || pm.id}`}
              >
                ×
              </span>
            </span>
          ))
        )}
        {selectedPms.length > 0 && (
          <span className="px-1 text-sm text-slate-400">Add another…</span>
        )}
        <span className="ml-auto pl-2 text-slate-400" aria-hidden="true">
          ▾
        </span>
      </button>

      {open && (
        <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="border-b border-slate-100 px-3 py-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or email…"
              className="w-full rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-indigo-300"
              autoFocus
            />
          </div>
          <ul className="max-h-56 overflow-y-auto py-1" role="listbox" aria-multiselectable="true">
            {(options ?? []).length === 0 ? (
              <li className="px-3 py-2 text-sm text-slate-500">No program managers available.</li>
            ) : filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-slate-500">No matching program managers.</li>
            ) : (
              filtered.map((pm) => {
                const checked = selectedSet.has(pm.id);
                return (
                  <li key={pm.id}>
                    <label className="flex cursor-pointer items-start gap-3 px-3 py-2 text-sm text-slate-800 hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(pm.id)}
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span>
                        <span className="font-medium">{pm.name || 'Unnamed'}</span>
                        {pm.email ? (
                          <span className="block text-xs text-slate-500">{pm.email}</span>
                        ) : null}
                      </span>
                    </label>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
