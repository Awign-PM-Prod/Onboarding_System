/**
 * Debounced per-row save scheduler for attendance inline edits.
 */
export function createDebouncedRowSaver({ delayMs = 400, onSave }) {
  const timers = new Map();
  const listeners = new Set();
  let inFlight = 0;

  function emitPending() {
    const pending = timers.size + inFlight;
    for (const fn of listeners) fn(pending);
  }

  function schedule(rowId) {
    if (timers.has(rowId)) clearTimeout(timers.get(rowId));
    const timer = setTimeout(async () => {
      timers.delete(rowId);
      emitPending();
      inFlight += 1;
      emitPending();
      try {
        await onSave(rowId);
      } finally {
        inFlight = Math.max(0, inFlight - 1);
        emitPending();
      }
    }, delayMs);
    timers.set(rowId, timer);
    emitPending();
  }

  function cancelAll() {
    for (const t of timers.values()) clearTimeout(t);
    timers.clear();
    emitPending();
  }

  function onPendingChange(fn) {
    listeners.add(fn);
    fn(timers.size + inFlight);
    return () => listeners.delete(fn);
  }

  return { schedule, cancelAll, onPendingChange };
}
