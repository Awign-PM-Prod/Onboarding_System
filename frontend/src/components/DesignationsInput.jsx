import { useEffect, useMemo, useRef, useState } from 'react';
import { formatDesignationLabel } from '../lib/formatLabels';
import {
  SKILL_LEVELS,
  SKILL_LEVEL_LABELS,
  designationNameOf,
  normalizeDesignationList,
  normalizeSkillLevel
} from '../lib/wageConfig';

/** Predefined designations Payroll Lead can multi-select when creating/editing a client. */
export const DESIGNATION_OPTIONS = [
  'HRManager',
  'OperationsManager',
  'Recruiter',
  'Accountant',
  'TeamLead',
  'FieldExecutive',
  'Engineer',
  'Operator',
  'Inspector',
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
  const [otherSkill, setOtherSkill] = useState('SEMI_SKILLED');
  const [otherError, setOtherError] = useState('');
  const rootRef = useRef(null);
  const otherInputRef = useRef(null);

  const selected = useMemo(() => normalizeDesignationList(value), [value]);

  const selectedSet = useMemo(
    () => new Set(selected.map((v) => normalizeName(v.name)).filter(Boolean)),
    [selected]
  );

  const catalog = useMemo(() => {
    const extras = selected
      .map((d) => d.name)
      .filter((name) => !DESIGNATION_OPTIONS.some((opt) => namesMatch(opt, name)));
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
        setOtherSkill('SEMI_SKILLED');
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

  const emit = (next) => onChange(normalizeDesignationList(next));

  const toggle = (name) => {
    if (selectedSet.has(name)) {
      emit(selected.filter((t) => t.name !== name));
      return;
    }
    emit([...selected, { name, skill_level: 'SEMI_SKILLED' }]);
  };

  const setSkill = (name, skill_level) => {
    const skill = normalizeSkillLevel(skill_level, 'SEMI_SKILLED');
    if (selectedSet.has(name)) {
      emit(
        selected.map((t) => (t.name === name ? { ...t, skill_level: skill } : t))
      );
      return;
    }
    // Choosing a skill also selects the designation (matches radio UX in list).
    emit([...selected, { name, skill_level: skill }]);
  };

  const removeTag = (tagName) => {
    emit(selected.filter((t) => t.name !== tagName));
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
    if (selected.some((t) => namesMatch(t.name, name))) {
      setOtherError('This designation is already selected');
      return;
    }
    emit([...selected, { name, skill_level: normalizeSkillLevel(otherSkill, 'SEMI_SKILLED') }]);
    setOtherName('');
    setOtherSkill('SEMI_SKILLED');
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
            key={tag.name}
            className="inline-flex items-center gap-1 rounded bg-indigo-50 px-2 py-0.5 text-sm text-indigo-700"
          >
            {formatDesignationLabel(tag.name)}
            <span className="text-xs text-indigo-500">
              ({SKILL_LEVEL_LABELS[tag.skill_level] || tag.skill_level})
            </span>
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                removeTag(tag.name);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  removeTag(tag.name);
                }
              }}
              className="cursor-pointer text-indigo-500 hover:text-indigo-800"
              aria-label={`Remove ${tag.name}`}
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
        Select designations and set each as Skilled, Semi-skilled, or Unskilled (used for wage floors).
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
          <ul className="max-h-72 overflow-y-auto py-1" role="listbox" aria-multiselectable="true">
            {filtered.length === 0 && !othersVisible && (
              <li className="px-3 py-2 text-sm text-slate-500">No matching designations.</li>
            )}
            {filtered.map((opt) => {
              const checked = selectedSet.has(opt);
              const current = selected.find((t) => t.name === opt);
              const skillValue = checked ? (current?.skill_level || 'SEMI_SKILLED') : '';
              return (
                <li key={opt} className="border-b border-slate-50 px-3 py-2 last:border-0">
                  <label className="flex cursor-pointer items-center gap-3 text-sm text-slate-800">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(opt)}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="flex-1 font-medium">{formatDesignationLabel(opt)}</span>
                  </label>
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 pl-7">
                    {SKILL_LEVELS.map((s) => (
                      <label
                        key={s}
                        className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-slate-700"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="radio"
                          name={`skill-${opt}`}
                          value={s}
                          checked={skillValue === s}
                          onChange={() => setSkill(opt, s)}
                          className="h-3.5 w-3.5 border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span>{SKILL_LEVEL_LABELS[s]}</span>
                      </label>
                    ))}
                  </div>
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
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      {SKILL_LEVELS.map((s) => (
                        <label
                          key={s}
                          className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-slate-700"
                        >
                          <input
                            type="radio"
                            name="other-designation-skill"
                            value={s}
                            checked={otherSkill === s}
                            onChange={() => setOtherSkill(s)}
                            className="h-3.5 w-3.5 border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <span>{SKILL_LEVEL_LABELS[s]}</span>
                        </label>
                      ))}
                    </div>
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

// Re-export helper for callers that still import from this module path.
export { designationNameOf };
