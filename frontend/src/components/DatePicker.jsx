import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  MONTH_LONG_NAMES,
  MONTH_SHORT_NAMES,
  WEEKDAY_SHORT_NAMES,
  buildMonthGrid,
  buildYearRange,
  clampIsoDate,
  clampView,
  formatDisplayDate,
  formatDisplayMonth,
  isDayDisabled,
  isMonthDisabled,
  parseIsoDate,
  parseIsoMonth,
  shiftMonth,
  toIsoMonth,
  todayIsoDate
} from '../lib/datePicker';
import { Z_POPOVER } from '../lib/zIndex';

const POPOVER_GAP = 4;
const VIEWPORT_MARGIN = 8;

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

function ChevronIcon({ direction, className }) {
  const d = direction === 'left' ? 'M15.75 19.5L8.25 12l7.5-7.5' : 'M8.25 4.5l7.5 7.5-7.5 7.5';
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

/**
 * Open/close state, outside-click + Escape handling and fixed positioning for a
 * popover portaled to <body> so it is never clipped by tables, modals or scroll areas.
 */
function usePickerPopover() {
  const triggerRef = useRef(null);
  const popoverRef = useRef(null);
  const [open, setOpen] = useState(false);

  const close = useCallback((restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  const reposition = useCallback(() => {
    const trigger = triggerRef.current;
    const popover = popoverRef.current;
    if (!trigger || !popover) return;
    const rect = trigger.getBoundingClientRect();
    const { offsetWidth: width, offsetHeight: height } = popover;
    let top = rect.bottom + POPOVER_GAP;
    if (top + height > window.innerHeight - VIEWPORT_MARGIN && rect.top - POPOVER_GAP - height >= VIEWPORT_MARGIN) {
      top = rect.top - POPOVER_GAP - height;
    }
    const left = Math.max(
      VIEWPORT_MARGIN,
      Math.min(rect.left, window.innerWidth - width - VIEWPORT_MARGIN)
    );
    popover.style.top = `${top}px`;
    popover.style.left = `${left}px`;
    popover.style.visibility = 'visible';
  }, []);

  useLayoutEffect(() => {
    if (!open) return undefined;
    reposition();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open, reposition]);

  useEffect(() => {
    if (!open) return undefined;
    popoverRef.current?.querySelector('[data-autofocus="true"]')?.focus();
    const onPointerDown = (event) => {
      if (triggerRef.current?.contains(event.target)) return;
      if (popoverRef.current?.contains(event.target)) return;
      close();
    };
    // Capture phase so Escape closes only the picker, not an enclosing ModalOverlay.
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      event.preventDefault();
      close(true);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open, close]);

  const onPopoverBlur = (event) => {
    const next = event.relatedTarget;
    if (!next) return;
    if (popoverRef.current?.contains(next) || triggerRef.current?.contains(next)) return;
    close();
  };

  return { triggerRef, popoverRef, open, setOpen, close, onPopoverBlur };
}

function PickerTrigger({
  triggerRef,
  open,
  onToggle,
  display,
  placeholder,
  disabled,
  className,
  id,
  ariaLabel,
  title
}) {
  return (
    <button
      ref={triggerRef}
      type="button"
      id={id}
      title={title}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={onToggle}
      className={`inline-flex items-center justify-between gap-2 text-left disabled:cursor-not-allowed ${className}`}
    >
      <span className={`min-w-0 truncate ${display ? '' : 'text-slate-400'}`}>{display || placeholder}</span>
      <CalendarIcon className="h-4 w-4 shrink-0 text-slate-400" />
    </button>
  );
}

function PickerPopover({ popoverRef, onBlur, label, children }) {
  return createPortal(
    <div
      ref={popoverRef}
      role="dialog"
      aria-label={label}
      onBlur={onBlur}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      style={{ position: 'fixed', top: 0, left: 0, visibility: 'hidden', zIndex: Z_POPOVER }}
      className="w-72 rounded-xl border border-slate-200 bg-white p-3 text-slate-800 shadow-xl"
    >
      {children}
    </div>,
    document.body
  );
}

const navButtonClass =
  'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30';
const headerSelectClass =
  'min-w-0 rounded-md border border-slate-200 bg-white px-1.5 py-1 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-300';
const footerButtonClass =
  'rounded-md px-2 py-1 text-xs font-medium hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40';

function moveGridFocus(event, columns) {
  const deltas = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns };
  const delta = deltas[event.key];
  if (!delta) return;
  const buttons = Array.from(event.currentTarget.querySelectorAll('button'));
  const index = buttons.indexOf(document.activeElement);
  if (index < 0) return;
  event.preventDefault();
  for (let i = index + delta; i >= 0 && i < buttons.length; i += delta) {
    if (!buttons[i].disabled) {
      buttons[i].focus();
      return;
    }
  }
}

/** Calendar date picker. `value` / `onChange` use 'YYYY-MM-DD' strings ('' when cleared). */
export default function DatePicker({
  value,
  onChange,
  min,
  max,
  disabled = false,
  clearable = true,
  placeholder = 'Select date',
  className = '',
  id,
  title,
  'aria-label': ariaLabel
}) {
  const { triggerRef, popoverRef, open, setOpen, close, onPopoverBlur } = usePickerPopover();
  const [view, setView] = useState({ year: 2000, month: 0 });
  const selectedIso = parseIsoDate(value) ? String(value).slice(0, 10) : '';
  const todayIso = todayIsoDate();

  const toggle = () => {
    if (open) {
      close();
      return;
    }
    const base = parseIsoDate(selectedIso || clampIsoDate(todayIso, min, max));
    setView({ year: base.year, month: base.month });
    setOpen(true);
  };

  const pick = (iso) => {
    onChange(iso);
    close(true);
  };

  const changeView = (year, month) => setView(clampView(year, month, min, max));
  const prev = shiftMonth(view.year, view.month, -1);
  const next = shiftMonth(view.year, view.month, 1);
  const cells = buildMonthGrid(view.year, view.month);
  const years = buildYearRange({ min, max, selectedYear: view.year });
  const autofocusIso =
    cells.find((c) => c.iso === selectedIso)?.iso ??
    cells.find((c) => c.inMonth && c.iso === todayIso && !isDayDisabled(c.iso, min, max))?.iso ??
    cells.find((c) => c.inMonth && !isDayDisabled(c.iso, min, max))?.iso;

  return (
    <>
      <PickerTrigger
        triggerRef={triggerRef}
        open={open}
        onToggle={toggle}
        display={formatDisplayDate(selectedIso)}
        placeholder={placeholder}
        disabled={disabled}
        className={className}
        id={id}
        ariaLabel={ariaLabel}
        title={title}
      />
      {open && (
        <PickerPopover popoverRef={popoverRef} onBlur={onPopoverBlur} label="Choose date">
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Previous month"
              className={navButtonClass}
              disabled={isMonthDisabled(toIsoMonth(prev.year, prev.month), min, max)}
              onClick={() => changeView(prev.year, prev.month)}
            >
              <ChevronIcon direction="left" className="h-4 w-4" />
            </button>
            <select
              aria-label="Month"
              value={view.month}
              onChange={(e) => changeView(view.year, Number(e.target.value))}
              className={`${headerSelectClass} flex-1`}
            >
              {MONTH_LONG_NAMES.map((name, m) => (
                <option key={name} value={m} disabled={isMonthDisabled(toIsoMonth(view.year, m), min, max)}>
                  {name}
                </option>
              ))}
            </select>
            <select
              aria-label="Year"
              value={view.year}
              onChange={(e) => changeView(Number(e.target.value), view.month)}
              className={headerSelectClass}
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <button
              type="button"
              aria-label="Next month"
              className={navButtonClass}
              disabled={isMonthDisabled(toIsoMonth(next.year, next.month), min, max)}
              onClick={() => changeView(next.year, next.month)}
            >
              <ChevronIcon direction="right" className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-3 grid grid-cols-7 text-center text-[11px] font-medium uppercase text-slate-400">
            {WEEKDAY_SHORT_NAMES.map((d) => (
              <span key={d} className="py-1">
                {d}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-y-1" onKeyDown={(e) => moveGridFocus(e, 7)}>
            {cells.map((cell) => {
              const isDisabled = isDayDisabled(cell.iso, min, max);
              const isSelected = cell.iso === selectedIso;
              const isToday = cell.iso === todayIso;
              const tone = isSelected
                ? 'bg-indigo-600 font-semibold text-white hover:bg-indigo-700'
                : isDisabled
                  ? 'text-slate-300'
                  : cell.inMonth
                    ? 'text-slate-800 hover:bg-indigo-50'
                    : 'text-slate-400 hover:bg-slate-100';
              return (
                <button
                  key={cell.iso}
                  type="button"
                  disabled={isDisabled}
                  aria-label={formatDisplayDate(cell.iso)}
                  aria-pressed={isSelected}
                  data-autofocus={cell.iso === autofocusIso ? 'true' : undefined}
                  onClick={() => pick(cell.iso)}
                  className={`mx-auto flex h-8 w-8 items-center justify-center rounded-full text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:cursor-not-allowed ${tone} ${
                    isToday && !isSelected ? 'ring-1 ring-indigo-300' : ''
                  }`}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2">
            <button
              type="button"
              className={`${footerButtonClass} text-indigo-700`}
              disabled={isDayDisabled(todayIso, min, max)}
              onClick={() => pick(todayIso)}
            >
              Today
            </button>
            {clearable && selectedIso ? (
              <button type="button" className={`${footerButtonClass} text-slate-600`} onClick={() => pick('')}>
                Clear
              </button>
            ) : null}
          </div>
        </PickerPopover>
      )}
    </>
  );
}

/** Calendar month picker. `value` / `onChange` use 'YYYY-MM' strings ('' when cleared). */
export function MonthPicker({
  value,
  onChange,
  min,
  max,
  disabled = false,
  clearable = false,
  placeholder = 'Select month',
  className = '',
  id,
  title,
  'aria-label': ariaLabel
}) {
  const { triggerRef, popoverRef, open, setOpen, close, onPopoverBlur } = usePickerPopover();
  const [viewYear, setViewYear] = useState(2000);
  const selected = parseIsoMonth(value) ? String(value) : '';
  const now = new Date();
  const currentMonth = toIsoMonth(now.getFullYear(), now.getMonth());

  const toggle = () => {
    if (open) {
      close();
      return;
    }
    const base = parseIsoMonth(selected) ?? clampView(now.getFullYear(), now.getMonth(), min, max);
    setViewYear(base.year);
    setOpen(true);
  };

  const pick = (isoMonth) => {
    onChange(isoMonth);
    close(true);
  };

  const yearHasEnabledMonth = (year) =>
    MONTH_SHORT_NAMES.some((_, m) => !isMonthDisabled(toIsoMonth(year, m), min, max));
  const years = buildYearRange({ min, max, selectedYear: viewYear });
  const autofocusMonth =
    (selected.startsWith(`${viewYear}-`) && selected) ||
    (currentMonth.startsWith(`${viewYear}-`) && !isMonthDisabled(currentMonth, min, max) && currentMonth) ||
    MONTH_SHORT_NAMES.map((_, m) => toIsoMonth(viewYear, m)).find((iso) => !isMonthDisabled(iso, min, max));

  return (
    <>
      <PickerTrigger
        triggerRef={triggerRef}
        open={open}
        onToggle={toggle}
        display={formatDisplayMonth(selected)}
        placeholder={placeholder}
        disabled={disabled}
        className={className}
        id={id}
        ariaLabel={ariaLabel}
        title={title}
      />
      {open && (
        <PickerPopover popoverRef={popoverRef} onBlur={onPopoverBlur} label="Choose month">
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Previous year"
              className={navButtonClass}
              disabled={!yearHasEnabledMonth(viewYear - 1)}
              onClick={() => setViewYear(viewYear - 1)}
            >
              <ChevronIcon direction="left" className="h-4 w-4" />
            </button>
            <select
              aria-label="Year"
              value={viewYear}
              onChange={(e) => setViewYear(Number(e.target.value))}
              className={`${headerSelectClass} flex-1 text-center`}
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <button
              type="button"
              aria-label="Next year"
              className={navButtonClass}
              disabled={!yearHasEnabledMonth(viewYear + 1)}
              onClick={() => setViewYear(viewYear + 1)}
            >
              <ChevronIcon direction="right" className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2" onKeyDown={(e) => moveGridFocus(e, 3)}>
            {MONTH_SHORT_NAMES.map((name, m) => {
              const iso = toIsoMonth(viewYear, m);
              const isDisabled = isMonthDisabled(iso, min, max);
              const isSelected = iso === selected;
              const tone = isSelected
                ? 'bg-indigo-600 font-semibold text-white hover:bg-indigo-700'
                : isDisabled
                  ? 'text-slate-300'
                  : 'text-slate-800 hover:bg-indigo-50';
              return (
                <button
                  key={iso}
                  type="button"
                  disabled={isDisabled}
                  aria-label={`${MONTH_LONG_NAMES[m]} ${viewYear}`}
                  aria-pressed={isSelected}
                  data-autofocus={iso === autofocusMonth ? 'true' : undefined}
                  onClick={() => pick(iso)}
                  className={`rounded-lg py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:cursor-not-allowed ${tone} ${
                    iso === currentMonth && !isSelected ? 'ring-1 ring-indigo-300' : ''
                  }`}
                >
                  {name}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2">
            <button
              type="button"
              className={`${footerButtonClass} text-indigo-700`}
              disabled={isMonthDisabled(currentMonth, min, max)}
              onClick={() => pick(currentMonth)}
            >
              This month
            </button>
            {clearable && selected ? (
              <button type="button" className={`${footerButtonClass} text-slate-600`} onClick={() => pick('')}>
                Clear
              </button>
            ) : null}
          </div>
        </PickerPopover>
      )}
    </>
  );
}
