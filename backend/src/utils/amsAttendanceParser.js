import Papa from 'papaparse';
import { computeLegendTotals, normalizeAttendanceCode } from './attendanceLegend.js';

function normalizeHeaderKey(k) {
  return String(k ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function compactKey(k) {
  return normalizeHeaderKey(k).replace(/[^a-z0-9]/g, '');
}

const MONTH_MAP = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11
};

/** Parse headers like 1-Apr-26, 01-Apr-2026, 1 Apr 26, 1-Jul, 01/07/2026, Excel serial */
export function parseDayHeaderToDate(header, monthHint = null) {
  let raw = String(header ?? '').trim();
  if (!raw) return null;
  // Normalize fancy dashes / spaces from Excel exports
  raw = raw.replace(/[\u2010-\u2015\u2212]/g, '-').replace(/\s+/g, ' ').trim();

  const hintYear = monthHint ? Number(String(monthHint).slice(0, 4)) : null;
  const hintMon = monthHint ? Number(String(monthHint).slice(5, 7)) - 1 : null; // 0-based

  // Excel serial date (e.g. 45839) — common when CSV is exported from Excel
  if (/^\d{5}(\.\d+)?$/.test(raw)) {
    const serial = Math.floor(Number(raw));
    if (serial >= 30000 && serial <= 60000) {
      const utc = Date.UTC(1899, 11, 30) + serial * 86400000;
      const d = new Date(utc);
      if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
  }

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  // Jul-1-26 / Jul 1 2026 (month first)
  const mFirst = raw.match(/^([A-Za-z]{3,9})[-\s./]+(\d{1,2})(?:[-\s./]+(\d{2,4}))?$/);
  if (mFirst) {
    const mon = MONTH_MAP[mFirst[1].toLowerCase()] ?? MONTH_MAP[mFirst[1].toLowerCase().slice(0, 3)];
    const day = Number(mFirst[2]);
    let year = mFirst[3] != null ? Number(mFirst[3]) : hintYear;
    if (year != null && year < 100) year += 2000;
    if (mon != null && year != null && Number.isFinite(day)) {
      const d = new Date(Date.UTC(year, mon, day));
      if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
  }

  // 1-Apr-26 / 01 Apr 2026 / 1-Apr-2026 / 1-Jul (year optional)
  const mNamed = raw.match(/^(\d{1,2})[-\s./]+([A-Za-z]{3,9})(?:[-\s./]+(\d{2,4}))?$/);
  if (mNamed) {
    const day = Number(mNamed[1]);
    const mon = MONTH_MAP[mNamed[2].toLowerCase()] ?? MONTH_MAP[mNamed[2].toLowerCase().slice(0, 3)];
    let year = mNamed[3] != null ? Number(mNamed[3]) : hintYear;
    if (year != null && year < 100) year += 2000;
    if (mon != null && year != null && Number.isFinite(day)) {
      const d = new Date(Date.UTC(year, mon, day));
      if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
  }

  // DD/MM/YYYY or DD-MM-YYYY (prefer day-first for IN AMS sheets)
  const dmy = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmy) {
    let year = Number(dmy[3]);
    if (year < 100) year += 2000;
    const a = Number(dmy[1]);
    const b = Number(dmy[2]);
    // If first part > 12, must be DD/MM; if second > 12, must be MM/DD; else assume DD/MM
    let day;
    let mon;
    if (a > 12) {
      day = a;
      mon = b;
    } else if (b > 12) {
      mon = a;
      day = b;
    } else {
      day = a;
      mon = b;
    }
    if (mon >= 1 && mon <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  // Bare day-of-month "1".."31" when month hint known
  if (/^\d{1,2}$/.test(raw) && hintYear != null && hintMon != null) {
    const day = Number(raw);
    if (day >= 1 && day <= 31) {
      const d = new Date(Date.UTC(hintYear, hintMon, day));
      if (!Number.isNaN(d.getTime()) && d.getUTCMonth() === hintMon) {
        return d.toISOString().slice(0, 10);
      }
    }
  }

  return null;
}

const NON_DAY_COMPACT = new Set([
  'empcode',
  'employeecode',
  'employeename',
  'name',
  'mobile',
  'phone',
  'gender',
  'location',
  'city',
  'designation',
  'role',
  'doj',
  'dateofjoining',
  'lwd',
  'lastworkingday',
  'status',
  'employeestatus',
  'employmentstatus',
  'empstatus',
  'currentstatus',
  'workerstatus',
  'amttype',
  'amounttype',
  'monthlyamt',
  'monthlyamount',
  'ctc',
  'contractcode',
  'entity',
  'cycletype',
  'payrollcycle',
  'payrollmonth',
  'attendancemonth',
  'payrollstartdate',
  'startdate',
  'payrollenddate',
  'enddate',
  'salarypayoutdate',
  'payoutdate',
  'projectmanager',
  'programmanager',
  'pmname',
  'paiddays',
  'lop',
  'notconsidered',
  'totaldays',
  'remarks',
  'remark',
  'incentive',
  'incentiveamount',
  'incentives',
  'addonincentive',
  'addonincentives',
  'addonincentiveamount',
  'eltaken',
  'eltaken',
  'cltaken',
  'sltaken',
  'cotaken',
  'rhtaken',
  'mltaken',
  'pltaken',
  'nhtaken',
  'fhtaken',
  'elleft',
  'clleft',
  'slleft',
  'nhleft',
  'fhleft',
  'coleft',
  'rhleft',
  'mlleft',
  'plleft',
  'el',
  'cl',
  'sl',
  'co',
  'rh',
  'ml',
  'pl',
  'nh',
  'fh'
]);

function looksLikeAttendanceCode(raw) {
  const s = String(raw ?? '').trim().toUpperCase();
  if (!s) return true; // empty cells inside day block are ok
  return Boolean(normalizeAttendanceCode(s) || s === 'OC');
}

function buildColumnMap(headers, monthHint = null, sampleRows = []) {
  const map = {
    dayCols: [], // { index, date, header }
    byCompact: {}
  };
  headers.forEach((h, index) => {
    const compact = compactKey(h);
    if (compact) map.byCompact[compact] = index;
    if (NON_DAY_COMPACT.has(compact)) return;
    const date = parseDayHeaderToDate(h, monthHint);
    if (date) map.dayCols.push({ index, date, header: String(h) });
  });

  // Fallback: consecutive columns whose data looks like day codes (P/A/W/…)
  if (map.dayCols.length === 0 && sampleRows.length > 0) {
    const paidIdx = map.byCompact.paiddays;
    const startIdx = Math.max(
      map.byCompact.amttype ?? -1,
      map.byCompact.monthlyamt ?? -1,
      map.byCompact.designation ?? -1,
      map.byCompact.employeename ?? -1,
      map.byCompact.empcode ?? -1
    );
    const endIdx = paidIdx != null ? paidIdx : headers.length;
    const candidates = [];
    for (let i = startIdx + 1; i < endIdx; i += 1) {
      const compact = compactKey(headers[i]);
      if (NON_DAY_COMPACT.has(compact)) continue;
      let hits = 0;
      let seen = 0;
      for (const row of sampleRows.slice(0, 8)) {
        const v = row[i];
        if (v == null || String(v).trim() === '') continue;
        seen += 1;
        if (looksLikeAttendanceCode(v)) hits += 1;
      }
      if (seen > 0 && hits / seen >= 0.7) {
        candidates.push(i);
      }
    }
    // Keep longest consecutive run
    let best = [];
    let cur = [];
    for (const i of candidates) {
      if (cur.length === 0 || i === cur[cur.length - 1] + 1) cur.push(i);
      else {
        if (cur.length > best.length) best = cur;
        cur = [i];
      }
    }
    if (cur.length > best.length) best = cur;

    if (best.length >= 3 && monthHint) {
      const y = Number(String(monthHint).slice(0, 4));
      const m = Number(String(monthHint).slice(5, 7)) - 1;
      best.forEach((index, offset) => {
        const day = offset + 1;
        const d = new Date(Date.UTC(y, m, day));
        if (!Number.isNaN(d.getTime()) && d.getUTCMonth() === m) {
          map.dayCols.push({
            index,
            date: d.toISOString().slice(0, 10),
            header: String(headers[index] ?? day)
          });
        }
      });
    }
  }

  map.dayCols.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return map;
}

function numOrNull(v) {
  const s = String(v ?? '').trim();
  if (!s || s === '-') return null;
  const n = Number(s.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function strOrNull(v) {
  const s = String(v ?? '').trim();
  return s && s !== '-' ? s : null;
}

/** Canonical AMS employee statuses shown in the attendance grid. */
export const EMPLOYEE_STATUS_LABELS = [
  'Active',
  'New Joiner',
  'Abscond',
  'Inactive',
  'Resigned',
  'Termination'
];

const EMPLOYEE_STATUS_ALIASES = new Map([
  ['active', 'Active'],
  ['newjoiner', 'New Joiner'],
  ['newjoinee', 'New Joiner'],
  ['newjoin', 'New Joiner'],
  ['yettojoin', 'New Joiner'],
  ['abscond', 'Abscond'],
  ['absconded', 'Abscond'],
  ['absconder', 'Abscond'],
  ['inactive', 'Inactive'],
  ['inactve', 'Inactive'],
  ['resigned', 'Resigned'],
  ['resign', 'Resigned'],
  ['resignation', 'Resigned'],
  ['termination', 'Termination'],
  ['terminated', 'Termination'],
  ['terminate', 'Termination']
]);

/** Map raw CSV status text to one of the six canonical labels (or null). */
export function normalizeEmployeeStatus(raw) {
  const s = String(raw ?? '').trim();
  if (!s || s === '-' || s === '—') return null;
  const compact = s.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (EMPLOYEE_STATUS_ALIASES.has(compact)) return EMPLOYEE_STATUS_ALIASES.get(compact);
  // Exact label match ignoring case/spacing
  for (const label of EMPLOYEE_STATUS_LABELS) {
    if (compactKey(label) === compact) return label;
  }
  return null;
}

function looksLikeEmployeeStatus(raw) {
  return Boolean(normalizeEmployeeStatus(raw));
}

/**
 * Resolve Status column: named aliases first, then scan for status-like values,
 * then positional slot between DOJ/LWD and Amt. Type.
 */
function resolveStatusColumnIndex(headers, map, sampleRows = []) {
  const namedAliases = [
    'Status',
    'Employee Status',
    'Employment Status',
    'Emp Status',
    'Emp. Status',
    'Current Status',
    'Worker Status'
  ];
  for (const a of namedAliases) {
    const idx = map.byCompact[compactKey(a)];
    if (idx != null) return idx;
  }

  const dayIdx = new Set((map.dayCols ?? []).map((d) => d.index));
  let bestIdx = null;
  let bestScore = 0;
  for (let i = 0; i < headers.length; i += 1) {
    if (dayIdx.has(i)) continue;
    const compact = compactKey(headers[i]);
    if (compact && NON_DAY_COMPACT.has(compact) && !compact.includes('status')) continue;
    let hits = 0;
    let seen = 0;
    for (const row of sampleRows.slice(0, 20)) {
      const v = row[i];
      if (v == null || String(v).trim() === '') continue;
      seen += 1;
      if (looksLikeEmployeeStatus(v)) hits += 1;
    }
    if (seen >= 2 && hits / seen >= 0.5 && hits > bestScore) {
      bestScore = hits;
      bestIdx = i;
    }
  }
  if (bestIdx != null) return bestIdx;

  const left = Math.max(map.byCompact.lwd ?? -1, map.byCompact.doj ?? -1, map.byCompact.dateofjoining ?? -1);
  const right =
    map.byCompact.amttype ??
    map.byCompact.amounttype ??
    map.byCompact.monthlyamt ??
    map.byCompact.monthlyamount ??
    map.byCompact.ctc;
  if (left >= 0 && right != null && right === left + 2) {
    return left + 1;
  }
  return null;
}

function findHeaderRow(matrix) {
  for (let i = 0; i < matrix.length; i += 1) {
    const row = matrix[i] ?? [];
    const keys = row.map((c) => compactKey(c));
    const hasEmp = keys.some((k) => k === 'empcode' || k === 'employeecode');
    const hasName = keys.some((k) => k === 'employeename' || k === 'name');
    if (hasEmp && hasName) return i;
  }
  return -1;
}

function col(row, map, ...aliases) {
  for (const a of aliases) {
    const idx = map.byCompact[compactKey(a)];
    if (idx != null) return row[idx];
  }
  return undefined;
}

function firstOfMonthFromDate(isoDate) {
  if (!isoDate) return null;
  return `${String(isoDate).slice(0, 7)}-01`;
}

function parsePayrollMonth(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  // Apr-26 / April 2026 / 2026-04
  const m1 = s.match(/^([A-Za-z]{3,9})[-\s/]+(\d{2,4})$/);
  if (m1) {
    const mon = MONTH_MAP[m1[1].toLowerCase()] ?? MONTH_MAP[m1[1].toLowerCase().slice(0, 3)];
    let year = Number(m1[2]);
    if (year < 100) year += 2000;
    if (mon != null) return `${year}-${String(mon + 1).padStart(2, '0')}-01`;
  }
  const m2 = s.match(/^(\d{4})-(\d{2})$/);
  if (m2) return `${m2[1]}-${m2[2]}-01`;
  const parsed = Date.parse(s);
  if (!Number.isNaN(parsed)) {
    const d = new Date(parsed);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
  }
  return null;
}

function isFirstOfEveryMonthLabel(raw) {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/\s+/g, ' ');
  if (!s) return false;
  // "1st of E.M", "1st of EM", "1st of every month", "1 of every month"
  return (
    /^1(st)?\s*of\s*e\s*m$/.test(s) ||
    /^1(st)?\s*of\s*every\s*month$/.test(s) ||
    s === 'em' ||
    s === 'e m'
  );
}

/**
 * Coerce CSV values into YYYY-MM-DD for Postgres date columns.
 * Labels like "1st of E.M" become the first day of attendanceMonth (e.g. 2026-07-01).
 */
export function toSqlDate(raw, attendanceMonth = null) {
  const s = String(raw ?? '').trim();
  if (!s || s === '-') return null;

  const monthFallback = attendanceMonth ? firstOfMonthFromDate(attendanceMonth) : null;
  if (isFirstOfEveryMonthLabel(s)) {
    return monthFallback;
  }

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // DD-MM-YYYY or DD/MM/YYYY
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmy) {
    let year = Number(dmy[3]);
    if (year < 100) year += 2000;
    const day = Number(dmy[1]);
    const mon = Number(dmy[2]);
    if (mon >= 1 && mon <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  // 1-Apr-26 / 01 Apr 2026
  const fromHeader = parseDayHeaderToDate(s);
  if (fromHeader) return fromHeader;

  const fromPayroll = parsePayrollMonth(s);
  if (fromPayroll) return fromPayroll;

  const parsed = Date.parse(s);
  if (!Number.isNaN(parsed)) {
    const d = new Date(parsed);
    if (!Number.isNaN(d.getTime())) {
      return d.toISOString().slice(0, 10);
    }
  }

  return null;
}

/**
 * Parse AMS Project CSV buffer/text into sheet metadata + employee rows.
 * @param {string} text
 * @param {{ attendanceMonthHint?: string|null }} [options]
 * @returns {{ sheetMeta, rows: Array, errors: Array }}
 */
export function parseAmsAttendanceCsv(text, options = {}) {
  const monthHintIn = options.attendanceMonthHint
    ? firstOfMonthFromDate(options.attendanceMonthHint)
    : null;

  const parsed = Papa.parse(String(text ?? ''), {
    header: false,
    skipEmptyLines: false
  });
  const matrix = (parsed.data || []).map((r) => (Array.isArray(r) ? r : []));
  const headerIdx = findHeaderRow(matrix);
  if (headerIdx < 0) {
    return {
      sheetMeta: null,
      rows: [],
      errors: [{ error: 'Could not find header row with Emp Code and Employee Name.' }]
    };
  }

  const headers = matrix[headerIdx].map((c) => String(c ?? ''));
  // Strip UTF-8 BOM from first header if present
  if (headers[0]) headers[0] = headers[0].replace(/^\uFEFF/, '');

  const dataRows = matrix.slice(headerIdx + 1);

  // Peek payroll month from first data rows to help parse day headers like "1" or "1-Jul"
  let peekMonth = monthHintIn;
  const peekMap = buildColumnMap(headers, peekMonth, dataRows);
  if (!peekMonth) {
    for (const row of dataRows.slice(0, 5)) {
      const pm = parsePayrollMonth(col(row, peekMap, 'Payroll Month', 'Attendance Month'));
      if (pm) {
        peekMonth = pm;
        break;
      }
    }
  }

  const colMap = buildColumnMap(headers, peekMonth, dataRows);
  const statusColIdx = resolveStatusColumnIndex(headers, colMap, dataRows);
  const errors = [];
  if (colMap.dayCols.length === 0) {
    errors.push({
      error:
        'No day columns detected in the CSV header. Expected date headers like 1-Jul-26 (or day numbers 1–31 with Payroll Month set). Re-export the AMS sheet as CSV from Excel without changing the day headers.'
    });
  }

  const outRows = [];
  let sheetMeta = {
    attendance_month: peekMonth || monthHintIn,
    contract_code: null,
    entity: null,
    cycle_type: null,
    payroll_cycle: null,
    payroll_start_date: null,
    payroll_end_date: null,
    salary_payout_date: null,
    project_manager_name: null
  };

  for (let r = headerIdx + 1; r < matrix.length; r += 1) {
    const row = matrix[r] ?? [];
    const empCode = strOrNull(col(row, colMap, 'Emp Code', 'Employee Code', 'emp_code'));
    const amtType = strOrNull(col(row, colMap, 'Amt. Type', 'Amt Type', 'Amount Type'));
    const name = strOrNull(col(row, colMap, 'Employee Name', 'Name'));

    // Skip empty / placeholder trailing rows (no identity).
    // Rows with Emp Code are kept even when Amt. Type is blank so exported
    // templates (ctc_type often unset) still import all matching employees.
    if (!empCode && !name) continue;
    // Exported sheets append a column-totals footer; ignore it on re-import.
    if (!empCode && String(name).trim().toLowerCase() === 'total') continue;
    if (!empCode || empCode === '-') {
      errors.push({ row: r + 1, error: 'Missing Emp Code' });
      continue;
    }

    const dayMarks = [];
    for (const day of colMap.dayCols) {
      const rawCode = row[day.index];
      const normalized = normalizeAttendanceCode(rawCode);
      const rawStr = String(rawCode ?? '').trim().toUpperCase();
      if (rawStr === 'OC') {
        errors.push({
          row: r + 1,
          emp_code: empCode,
          error: `Day ${day.header}: code OC is not allowed; use NH (National Holiday) or FH (Festival Holiday).`
        });
        continue;
      }
      if (!rawStr || rawStr === '') {
        dayMarks.push({ mark_date: day.date, code: '-' });
        continue;
      }
      if (!normalized) {
        errors.push({
          row: r + 1,
          emp_code: empCode,
          error: `Day ${day.header}: invalid code "${rawStr}"`
        });
        continue;
      }
      dayMarks.push({ mark_date: day.date, code: normalized });
    }

    const payrollMonthRaw = col(row, colMap, 'Payroll Month', 'Attendance Month');
    if (!sheetMeta.attendance_month) {
      const fromPayroll = parsePayrollMonth(payrollMonthRaw);
      const fromDays = colMap.dayCols[0]?.date ? firstOfMonthFromDate(colMap.dayCols[0].date) : null;
      sheetMeta.attendance_month = fromPayroll || fromDays;
    }

    if (!sheetMeta.contract_code) {
      sheetMeta.contract_code = strOrNull(col(row, colMap, 'Contract Code'));
      sheetMeta.entity = strOrNull(col(row, colMap, 'Entity'));
      sheetMeta.cycle_type = strOrNull(col(row, colMap, 'Cycle Type'));
      sheetMeta.payroll_cycle = strOrNull(col(row, colMap, 'Payroll Cycle'));
      sheetMeta._payroll_start_raw = strOrNull(col(row, colMap, 'Payroll Start Date', 'Start Date'));
      sheetMeta._payroll_end_raw = strOrNull(col(row, colMap, 'Payroll End Date', 'End Date'));
      sheetMeta._salary_payout_raw = strOrNull(col(row, colMap, 'Salary Payout Date', 'Payout Date'));
      if (
        sheetMeta._salary_payout_raw &&
        isFirstOfEveryMonthLabel(sheetMeta._salary_payout_raw) &&
        !sheetMeta.payroll_cycle
      ) {
        sheetMeta.payroll_cycle = sheetMeta._salary_payout_raw;
      }
      sheetMeta.project_manager_name = strOrNull(
        col(row, colMap, 'Project Manager', 'Program Manager', 'PM Name')
      );
    }

    const leave_summary = {
      EL_taken: numOrNull(col(row, colMap, 'EL Taken', 'EL')),
      CL_taken: numOrNull(col(row, colMap, 'CL Taken', 'CL')),
      SL_taken: numOrNull(col(row, colMap, 'SL Taken', 'SL')),
      NH_taken: numOrNull(col(row, colMap, 'NH Taken', 'NH')),
      FH_taken: numOrNull(col(row, colMap, 'FH Taken', 'FH')),
      CO_taken: numOrNull(col(row, colMap, 'CO Taken', 'CO')),
      RH_taken: numOrNull(col(row, colMap, 'RH Taken', 'RH')),
      ML_taken: numOrNull(col(row, colMap, 'ML Taken', 'ML')),
      PL_taken: numOrNull(col(row, colMap, 'PL Taken', 'PL')),
      EL_left: numOrNull(col(row, colMap, 'EL Left')),
      CL_left: numOrNull(col(row, colMap, 'CL Left')),
      SL_left: numOrNull(col(row, colMap, 'SL Left')),
      NH_left: numOrNull(col(row, colMap, 'NH Left')),
      FH_left: numOrNull(col(row, colMap, 'FH Left')),
      CO_left: numOrNull(col(row, colMap, 'CO Left')),
      RH_left: numOrNull(col(row, colMap, 'RH Left')),
      ML_left: numOrNull(col(row, colMap, 'ML Left')),
      PL_left: numOrNull(col(row, colMap, 'PL Left'))
    };

    const legend_totals = computeLegendTotals(dayMarks.map((d) => d.code));

    const statusRaw =
      statusColIdx != null
        ? row[statusColIdx]
        : col(
            row,
            colMap,
            'Status',
            'Employee Status',
            'Employment Status',
            'Emp Status',
            'Emp. Status',
            'Current Status'
          );
    const statusNormalized = normalizeEmployeeStatus(statusRaw);
    const status_label = statusNormalized || strOrNull(statusRaw);

    outRows.push({
      emp_code: empCode,
      employee_name_snapshot: name,
      mobile: strOrNull(col(row, colMap, 'Mobile', 'Phone')),
      gender: strOrNull(col(row, colMap, 'Gender')),
      location: strOrNull(col(row, colMap, 'Location', 'City')),
      designation: strOrNull(col(row, colMap, 'Designation', 'Role')),
      doj: toSqlDate(col(row, colMap, 'DOJ', 'Date of Joining'), sheetMeta.attendance_month),
      lwd: toSqlDate(col(row, colMap, 'LWD', 'Last Working Day'), sheetMeta.attendance_month),
      status_label,
      amt_type: amtType && amtType !== '-' ? amtType : null,
      monthly_amt: numOrNull(col(row, colMap, 'Monthly Amt', 'Monthly Amount', 'CTC')),
      paid_days: numOrNull(col(row, colMap, 'Paid Days')),
      lop: numOrNull(col(row, colMap, 'LOP')),
      not_considered: numOrNull(col(row, colMap, 'Not Considered')),
      total_days: numOrNull(col(row, colMap, 'Total Days')),
      leave_summary,
      legend_totals,
      remarks: strOrNull(col(row, colMap, 'Remarks', 'Remark')),
      addon_incentive: numOrNull(
        col(row, colMap, 'Add-on Incentive', 'Add-on Incentives', 'Addon Incentive', 'Addon Incentives')
      ),
      arrear_days: numOrNull(
        col(row, colMap, 'Arrear Days', 'Arrear Day', 'Arrears Days', 'Arrears')
      ),
      day_marks: dayMarks
    });
  }

  if (!sheetMeta.attendance_month && colMap.dayCols[0]?.date) {
    sheetMeta.attendance_month = firstOfMonthFromDate(colMap.dayCols[0].date);
  }

  // Coerce date columns only after attendance_month is known ("1st of E.M" → e.g. 2026-07-01).
  sheetMeta.payroll_start_date = toSqlDate(
    sheetMeta._payroll_start_raw,
    sheetMeta.attendance_month
  );
  sheetMeta.payroll_end_date = toSqlDate(sheetMeta._payroll_end_raw, sheetMeta.attendance_month);
  sheetMeta.salary_payout_date = toSqlDate(
    sheetMeta._salary_payout_raw,
    sheetMeta.attendance_month
  );
  delete sheetMeta._payroll_start_raw;
  delete sheetMeta._payroll_end_raw;
  delete sheetMeta._salary_payout_raw;

  return { sheetMeta, rows: outRows, errors };
}
