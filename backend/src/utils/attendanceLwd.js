/** Last working date + exit reason (AB / R / T) helpers. */

export const EXIT_CODE_TO_STATUS = {
  AB: 'Abscond',
  R: 'Resigned',
  T: 'Termination'
};

export const STATUS_TO_EXIT_CODE = {
  Abscond: 'AB',
  Resigned: 'R',
  Termination: 'T'
};

export const EXIT_CODES = Object.keys(EXIT_CODE_TO_STATUS);
export const EXIT_STATUS_LABELS = Object.values(EXIT_CODE_TO_STATUS);

const EXIT_CODE_SET = new Set(EXIT_CODES);
const EXIT_STATUS_SET = new Set(EXIT_STATUS_LABELS);

const EXIT_CODE_ALIASES = new Map([
  ['AB', 'AB'],
  ['ABS', 'AB'],
  ['ABSCOND', 'AB'],
  ['ABSCONDED', 'AB'],
  ['ABSCONDER', 'AB'],
  ['R', 'R'],
  ['RESIGNED', 'R'],
  ['RESIGN', 'R'],
  ['RESIGNATION', 'R'],
  ['T', 'T'],
  ['TERMINATION', 'T'],
  ['TERMINATED', 'T'],
  ['TERMINATE', 'T']
]);

export function parseIsoDate(iso) {
  const s = String(iso ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

export function sheetMonthYm(monthOrDate) {
  const s = String(monthOrDate ?? '');
  if (/^\d{4}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 7);
  return null;
}

export function sheetMonthStart(monthOrDate) {
  const ym = sheetMonthYm(monthOrDate);
  return ym ? `${ym}-01` : null;
}

export function isExitCode(code) {
  return EXIT_CODE_SET.has(String(code ?? '').trim().toUpperCase());
}

export function isExitStatus(statusLabel) {
  return EXIT_STATUS_SET.has(String(statusLabel ?? '').trim());
}

export function normalizeExitCode(raw) {
  const compact = String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s_-]+/g, '');
  if (!compact) return null;
  return EXIT_CODE_ALIASES.get(compact) ?? null;
}

export function statusFromExitCode(code) {
  const normalized = normalizeExitCode(code) ?? String(code ?? '').trim().toUpperCase();
  return EXIT_CODE_TO_STATUS[normalized] ?? null;
}

export function exitCodeFromStatus(statusLabel) {
  const s = String(statusLabel ?? '').trim();
  return STATUS_TO_EXIT_CODE[s] ?? null;
}

export function isAfterLwd(iso, lwd) {
  const d = parseIsoDate(iso);
  const leave = parseIsoDate(lwd);
  if (!d || !leave) return false;
  return d > leave;
}

export function isLwdDate(iso, lwd) {
  const d = parseIsoDate(iso);
  const leave = parseIsoDate(lwd);
  if (!d || !leave) return false;
  return d === leave;
}

export function isLwdInMonth(lwd, monthOrDate) {
  const leave = parseIsoDate(lwd);
  const ym = sheetMonthYm(monthOrDate);
  if (!leave || !ym) return false;
  return leave.startsWith(`${ym}-`);
}

/** True when LWD is strictly before the first day of the attendance month. */
export function isLwdBeforeSheetMonth(lwd, monthOrDate) {
  const leave = parseIsoDate(lwd);
  const start = sheetMonthStart(monthOrDate);
  if (!leave || !start) return false;
  return leave < start;
}

export function formatLwdSkipMessage(lwd, statusLabel) {
  const leave = parseIsoDate(lwd);
  const lwdLabel = leave
    ? new Date(`${leave}T00:00:00Z`).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC'
      })
    : String(lwd ?? '');
  const status = String(statusLabel ?? '').trim();
  const statusPart = status ? ` (${status})` : '';
  return `Last working date ${lwdLabel}${statusPart} — not included after LWD month`;
}

/**
 * Keep marks on/before LWD; set the LWD date to exitCode; drop dates after LWD.
 */
export function applyLwdToDayMarks(dayMarks, lwd, exitCode) {
  const leave = parseIsoDate(lwd);
  const code = normalizeExitCode(exitCode);
  const kept = [];
  let sawLwd = false;
  for (const m of dayMarks ?? []) {
    const d = parseIsoDate(m.mark_date);
    if (!d) continue;
    if (leave && d > leave) continue;
    if (leave && d === leave && code) {
      kept.push({ ...m, mark_date: d, code });
      sawLwd = true;
      continue;
    }
    kept.push({ ...m, mark_date: d, code: m.code });
  }
  if (leave && code && !sawLwd) {
    kept.push({ mark_date: leave, code });
  }
  return kept;
}

export function marksAfterLwd(dayMarks, lwd) {
  const leave = parseIsoDate(lwd);
  if (!leave) return [];
  return (dayMarks ?? []).filter((m) => {
    const d = parseIsoDate(m.mark_date);
    return d && d > leave;
  });
}
