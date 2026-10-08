import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { clientUrlForRole, employeeUrlForRole, GLOBAL_SEARCH_ROLES } from '../lib/globalSearchRoutes';
import { employeeStatusBadgeClass, resolveEmployeeStatusLabel } from '../lib/employeeStatusBadge';
import { formatEmployeeStatusLabel } from '../lib/formatLabels';
import { isClientActive } from '../lib/clientStatus';

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 250;
const EMPTY_RESPONSE = { query: '', clients: [], employees: [], error: '' };

function IconSearch({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
    </svg>
  );
}

function IconClear({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function Highlight({ text, query }) {
  const value = String(text ?? '');
  const q = query.trim();
  if (!value || !q) return value;
  const parts = value.split(new RegExp(`(${escapeRegExp(q)})`, 'ig'));
  return parts.map((part, i) =>
    part.toLowerCase() === q.toLowerCase() ? (
      <mark key={i} className="rounded-sm bg-amber-100 px-0.5 text-inherit">
        {part}
      </mark>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

export default function GlobalSearch({ className = '' }) {
  const { profile } = useAuth();
  const role = profile?.role;
  const navigate = useNavigate();
  const listboxId = useId();
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState(EMPTY_RESPONSE);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const trimmed = query.trim();
  const ready = trimmed.length >= MIN_QUERY_LENGTH;
  const results = ready && response.query === trimmed ? response : EMPTY_RESPONSE;
  const { error } = results;
  const loading = ready && response.query !== trimmed;

  useEffect(() => {
    if (!ready) return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const data = await api.globalSearch(trimmed);
        if (cancelled) return;
        setResponse({
          query: trimmed,
          clients: Array.isArray(data?.clients) ? data.clients : [],
          employees: Array.isArray(data?.employees) ? data.employees : [],
          error: ''
        });
      } catch (err) {
        if (cancelled) return;
        setResponse({ ...EMPTY_RESPONSE, query: trimmed, error: err?.message || 'Search failed.' });
      }
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trimmed, ready]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const items = useMemo(
    () => [
      ...results.clients.map((c) => ({ kind: 'client', key: `c:${c.id}`, data: c })),
      ...results.employees.map((e) => ({ kind: 'employee', key: `e:${e.id}`, data: e }))
    ],
    [results]
  );

  if (!GLOBAL_SEARCH_ROLES.includes(role)) return null;

  const go = (item) => {
    const url =
      item.kind === 'client'
        ? clientUrlForRole(role, item.data.id)
        : employeeUrlForRole(role, item.data);
    setOpen(false);
    setQuery('');
    navigate(url);
  };

  const onKeyDown = (event) => {
    if (event.key === 'Escape') {
      if (open) setOpen(false);
      else setQuery('');
      return;
    }
    if (!items.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((i) => (i + 1) % items.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((i) => (i <= 0 ? items.length - 1 : i - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      go(items[activeIndex >= 0 ? activeIndex : 0]);
    }
  };

  const showDropdown = open && ready;
  const activeItem = activeIndex >= 0 ? items[activeIndex] : null;
  const optionId = (item) => `${listboxId}-${item.key}`;

  const renderItem = (item, index) => {
    const active = index === activeIndex;
    const base = `flex w-full cursor-pointer items-start gap-3 px-4 py-2.5 text-left ${
      active ? 'bg-indigo-50' : 'hover:bg-slate-50'
    }`;
    if (item.kind === 'client') {
      const c = item.data;
      return (
        <li
          key={item.key}
          id={optionId(item)}
          role="option"
          aria-selected={active}
          className={base}
          onMouseEnter={() => setActiveIndex(index)}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => go(item)}
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-900">
              <Highlight text={c.client_name} query={trimmed} />
            </p>
            <p className="truncate text-xs text-slate-500">
              <Highlight text={c.contract_code} query={trimmed} />
              {c.state ? ` · ${c.state}` : ''}
            </p>
          </div>
          {!isClientActive(c) ? (
            <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
              Inactive
            </span>
          ) : null}
        </li>
      );
    }
    const e = item.data;
    const statusLabel = resolveEmployeeStatusLabel(e);
    const secondary = [e.mobile, e.email, e.emp_code, e.reference_id].filter(Boolean);
    return (
      <li
        key={item.key}
        id={optionId(item)}
        role="option"
        aria-selected={active}
        className={base}
        onMouseEnter={() => setActiveIndex(index)}
        onMouseDown={(ev) => ev.preventDefault()}
        onClick={() => go(item)}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-900">
            <Highlight text={e.name} query={trimmed} />
            {e.client_name ? <span className="font-normal text-slate-500"> · {e.client_name}</span> : null}
          </p>
          <p className="truncate text-xs text-slate-500">
            {secondary.map((value, i) => (
              <span key={i}>
                {i > 0 ? ' · ' : ''}
                <Highlight text={value} query={trimmed} />
              </span>
            ))}
          </p>
        </div>
        {statusLabel && statusLabel !== '-' ? (
          <span className={`shrink-0 ${employeeStatusBadgeClass(statusLabel)}`}>
            {formatEmployeeStatusLabel(statusLabel)}
          </span>
        ) : null}
      </li>
    );
  };

  const sectionHeader = (label) => (
    <li
      role="presentation"
      className="bg-slate-50 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500"
    >
      {label}
    </li>
  );

  return (
    <div ref={containerRef} className={`relative w-full max-w-3xl ${className}`}>
      <div className="flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2.5 shadow-sm transition focus-within:border-indigo-400 focus-within:shadow-md focus-within:ring-2 focus-within:ring-indigo-100">
        <IconSearch className="h-5 w-5 shrink-0 text-slate-400" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(-1);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search clients or employees by name, mobile, email, emp code, reference ID"
          className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={activeItem ? optionId(activeItem) : undefined}
          aria-label="Search clients or employees"
        />
        {loading ? (
          <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-500" aria-hidden />
        ) : null}
        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setActiveIndex(-1);
              inputRef.current?.focus();
            }}
            className="shrink-0 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Clear search"
          >
            <IconClear className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {showDropdown ? (
        <div className="absolute left-0 right-0 z-[70] mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
          <ul id={listboxId} role="listbox" className="max-h-[26rem] overflow-y-auto py-1">
            {error ? (
              <li className="px-4 py-3 text-sm text-rose-700">{error}</li>
            ) : !loading && items.length === 0 ? (
              <li className="px-4 py-3 text-sm text-slate-500">No clients or employees match “{trimmed}”.</li>
            ) : null}
            {results.clients.length > 0 ? sectionHeader('Clients') : null}
            {results.clients.map((c, i) => renderItem(items[i], i))}
            {results.employees.length > 0 ? sectionHeader('Employees') : null}
            {results.employees.map((e, i) => {
              const index = results.clients.length + i;
              return renderItem(items[index], index);
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
