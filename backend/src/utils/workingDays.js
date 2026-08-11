/**
 * IST calendar helpers for joining-status DOJ windows.
 * Working days = Mon–Fri (no holiday calendar).
 */

export function todayDateInIST(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Parse YYYY-MM-DD as a UTC noon Date for stable weekday math. */
function parseYmd(ymd) {
  const s = String(ymd ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function formatYmdUtc(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Add N working days (Mon–Fri) to a YYYY-MM-DD date.
 * @param {string} ymd
 * @param {number} n
 * @returns {string|null}
 */
export function addWorkingDays(ymd, n) {
  const start = parseYmd(ymd);
  if (!start) return null;
  const steps = Number(n);
  if (!Number.isFinite(steps) || steps < 0) return null;
  if (steps === 0) return formatYmdUtc(start);

  let remaining = steps;
  const cursor = new Date(start.getTime());
  while (remaining > 0) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const dow = cursor.getUTCDay(); // 0 Sun … 6 Sat
    if (dow !== 0 && dow !== 6) remaining -= 1;
  }
  return formatYmdUtc(cursor);
}

/**
 * Window: doj <= today <= addWorkingDays(doj, 2)
 * Overdue: today > addWorkingDays(doj, 2)
 */
export function classifyDojReminderBucket(dojYmd, todayYmd = todayDateInIST()) {
  const doj = String(dojYmd ?? '').trim();
  const today = String(todayYmd ?? '').trim();
  if (!doj || !today || doj > today) return null;
  const windowEnd = addWorkingDays(doj, 2);
  if (!windowEnd) return null;
  if (today <= windowEnd) return 'within_2_days';
  return 'overdue';
}
