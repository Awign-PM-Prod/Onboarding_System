import Papa from 'papaparse';

const LEGEND_TOTAL_CODES = [
  'P', 'W', 'NH', 'FH', 'P-NH', 'P-FH', 'HD',
  'EL', 'SL', 'CL', 'PL', 'ML', 'RH', 'CO', 'A', 'R', 'T', '-'
];

const LEAVE_SUMMARY_KEYS = ['EL', 'CL', 'SL', 'NH', 'FH', 'CO', 'RH', 'ML', 'PL'];

function formatDayHeader(isoDate) {
  const d = new Date(`${String(isoDate).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return String(isoDate ?? '');
  const day = d.getUTCDate();
  const mon = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  const yr = String(d.getUTCFullYear()).slice(-2);
  return `${day}-${mon}-${yr}`;
}

function formatPayrollMonth(attendanceMonth) {
  const s = String(attendanceMonth ?? '').slice(0, 10);
  if (!s) return '';
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return s;
  const mon = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  const yr = String(d.getUTCFullYear()).slice(-2);
  return `${mon}-${yr}`;
}

function collectDayDates(rows, sheet) {
  const set = new Set();
  for (const row of rows ?? []) {
    for (const m of row.day_marks ?? []) {
      const key = String(m.mark_date ?? '').slice(0, 10);
      if (key) set.add(key);
    }
  }
  if (set.size > 0) return Array.from(set).sort();

  const ym = String(sheet?.attendance_month ?? '').slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(ym)) return [];
  const year = Number(ym.slice(0, 4));
  const mon = Number(ym.slice(5, 7));
  const last = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  const out = [];
  for (let day = 1; day <= last; day += 1) {
    out.push(`${year}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
  }
  return out;
}

function markCodeForRow(row, isoDate, template = false) {
  if (template) return '';
  const marks = row.day_marks ?? [];
  const exact = marks.find((m) => String(m.mark_date).slice(0, 10) === isoDate);
  return exact?.code ?? '';
}

function formatLeaveCell(colKey, row) {
  const ls = row.leave_summary ?? {};
  const takenKey = `${colKey}_taken`;
  const leftKey = `${colKey}_left`;
  const annualKey = `${colKey}_annual`;
  const taken = ls[takenKey];
  const left = ls[leftKey];
  const annual = ls[annualKey];
  if (colKey === 'NH' || colKey === 'FH') {
    const allowed = ls[`${colKey}_allowed`];
    if (allowed != null && taken != null) return `${taken}/${allowed}`;
    if (left != null && taken != null) return `${taken}/${Number(taken) + Number(left)}`;
    return '';
  }
  if (annual != null) return `(${taken ?? 0}/${annual})`;
  if (taken == null && left == null) return '';
  const total = Number(taken ?? 0) + Number(left ?? 0);
  return `(${taken ?? 0}/${total})`;
}

function baseEmployeeFields(row, sheet, { template = false } = {}) {
  const amtType = String(row.amt_type ?? '').trim();
  return {
    'Emp Code': row.emp_code ?? '',
    'Employee Name': row.employee_name_snapshot ?? '',
    Mobile: row.mobile ?? '',
    Gender: row.gender ?? '',
    Designation: row.designation ?? '',
    DOJ: row.doj ?? '',
    Status: row.status_label ?? '',
    // Template exports need a non-blank Amt. Type so re-import keeps every employee row.
    'Amt. Type': amtType || (template && String(row.emp_code ?? '').trim() ? 'MONTHLY' : ''),
    'Contract Code': sheet?.contract_code ?? '',
    Entity: sheet?.entity ?? '',
    'Cycle Type': sheet?.cycle_type ?? '',
    'Payroll Cycle': sheet?.payroll_cycle ?? '',
    'Payroll Month': formatPayrollMonth(sheet?.attendance_month)
  };
}

function buildDataRow(row, sheet, dayDates, { template = false } = {}) {
  const out = baseEmployeeFields(row, sheet, { template });
  for (const d of dayDates) {
    out[formatDayHeader(d)] = markCodeForRow(row, d, template);
  }
  for (const code of LEGEND_TOTAL_CODES) {
    out[code] = template ? '' : Number(row.legend_totals?.[code] ?? 0);
  }
  out['Paid Days'] = template ? '' : (row.paid_days ?? '');
  out['LOP'] = template ? '' : (row.lop ?? '');
  out['Not Considered'] = template ? '' : (row.not_considered ?? '');
  for (const key of LEAVE_SUMMARY_KEYS) {
    out[key] = template ? '' : formatLeaveCell(key, row);
  }
  out.Incentive = template ? '' : (row.incentive ?? '');
  out['Add-on Incentive'] = template ? '' : (row.addon_incentive ?? '');
  out['Arrear Days'] = template ? '' : (row.arrear_days ?? '');
  out.Remarks = template ? '' : (row.remarks ?? '');
  return out;
}

function roundTotal(n) {
  const rounded = Math.round(Number(n || 0) * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function buildTotalsRow(rows, sheet, dayDates) {
  const out = baseEmployeeFields({}, sheet);
  out['Emp Code'] = '';
  out['Employee Name'] = 'Total';
  for (const d of dayDates) {
    out[formatDayHeader(d)] = '';
  }

  const legend = Object.fromEntries(LEGEND_TOTAL_CODES.map((code) => [code, 0]));
  let paidDays = 0;
  let lop = 0;
  let notConsidered = 0;
  let incentive = 0;
  let addonIncentive = 0;
  let arrearDays = 0;
  const leaveTaken = Object.fromEntries(LEAVE_SUMMARY_KEYS.map((key) => [key, 0]));

  for (const row of rows ?? []) {
    paidDays += Number(row.paid_days ?? 0);
    lop += Number(row.lop ?? 0);
    notConsidered += Number(row.not_considered ?? 0);
    incentive += Number(row.incentive ?? 0);
    addonIncentive += Number(row.addon_incentive ?? 0);
    arrearDays += Number(row.arrear_days ?? 0);
    for (const code of LEGEND_TOTAL_CODES) {
      legend[code] += Number(row.legend_totals?.[code] ?? 0);
    }
    for (const key of LEAVE_SUMMARY_KEYS) {
      leaveTaken[key] += Number(row.leave_summary?.[`${key}_taken`] ?? 0);
    }
  }

  for (const code of LEGEND_TOTAL_CODES) {
    out[code] = roundTotal(legend[code]);
  }
  out['Paid Days'] = roundTotal(paidDays);
  out.LOP = roundTotal(lop);
  out['Not Considered'] = roundTotal(notConsidered);
  for (const key of LEAVE_SUMMARY_KEYS) {
    out[key] = roundTotal(leaveTaken[key]);
  }
  out.Incentive = roundTotal(incentive);
  out['Add-on Incentive'] = roundTotal(addonIncentive);
  out['Arrear Days'] = roundTotal(arrearDays);
  out.Remarks = '';
  return out;
}

export function buildMissingWarningExportCsv({ missing = [], warnings = [] } = {}) {
  const data = [];
  for (const err of warnings ?? []) {
    data.push({
      Category: 'Warning',
      'Emp Code': err?.emp_code || (err?.row != null ? `Row ${err.row}` : ''),
      'Employee Name': err?.employee_name ?? '',
      Reason: err?.error || (Array.isArray(err?.errors) ? err.errors.join('; ') : 'Skipped')
    });
  }
  for (const emp of missing ?? []) {
    data.push({
      Category: 'Missing',
      'Emp Code': emp?.emp_code ?? '',
      'Employee Name': emp?.employee_name ?? emp?.name ?? '',
      Reason: 'No attendance row on sheet / missing from uploaded CSV'
    });
  }
  if (data.length === 0) {
    data.push({
      Category: '',
      'Emp Code': '',
      'Employee Name': '',
      Reason: 'No missing or warning rows'
    });
  }
  return Papa.unparse(data);
}

export function buildAttendanceExportCsv({ sheet, rows, type, missing = [], warnings = [] }) {
  const dayDates = collectDayDates(rows, sheet);
  const sortedRows = [...(rows ?? [])].sort((a, b) =>
    String(a.employee_name_snapshot ?? '').localeCompare(String(b.employee_name_snapshot ?? ''), undefined, {
      numeric: true,
      sensitivity: 'base'
    })
  );

  if (type === 'missing' || type === 'warnings') {
    return buildMissingWarningExportCsv({ missing, warnings });
  }

  if (type === 'incentive') {
    const data = sortedRows.map((row) => ({
      'Emp Code': row.emp_code ?? '',
      'Employee Name': row.employee_name_snapshot ?? '',
      Designation: row.designation ?? '',
      'Paid Days': row.paid_days ?? '',
      LOP: row.lop ?? '',
      Incentive: row.incentive ?? '',
      'Add-on Incentive': row.addon_incentive ?? '',
      'Arrear Days': row.arrear_days ?? '',
      Remarks: row.remarks ?? ''
    }));
    if (sortedRows.length > 0) {
      let paidDays = 0;
      let lop = 0;
      let incentive = 0;
      let addonIncentive = 0;
      let arrearDays = 0;
      for (const row of sortedRows) {
        paidDays += Number(row.paid_days ?? 0);
        lop += Number(row.lop ?? 0);
        incentive += Number(row.incentive ?? 0);
        addonIncentive += Number(row.addon_incentive ?? 0);
        arrearDays += Number(row.arrear_days ?? 0);
      }
      data.push({
        'Emp Code': '',
        'Employee Name': 'Total',
        Designation: '',
        'Paid Days': roundTotal(paidDays),
        LOP: roundTotal(lop),
        Incentive: roundTotal(incentive),
        'Add-on Incentive': roundTotal(addonIncentive),
        'Arrear Days': roundTotal(arrearDays),
        Remarks: ''
      });
    }
    return Papa.unparse(data);
  }

  if (type === 'leave') {
    const data = sortedRows.map((row) => {
      const out = {
        'Emp Code': row.emp_code ?? '',
        'Employee Name': row.employee_name_snapshot ?? '',
        Designation: row.designation ?? '',
        'Paid Days': row.paid_days ?? '',
        LOP: row.lop ?? ''
      };
      for (const key of LEAVE_SUMMARY_KEYS) {
        out[key] = formatLeaveCell(key, row);
      }
      out.Remarks = row.remarks ?? '';
      return out;
    });
    if (sortedRows.length > 0) {
      let paidDays = 0;
      let lop = 0;
      const leaveTaken = Object.fromEntries(LEAVE_SUMMARY_KEYS.map((key) => [key, 0]));
      for (const row of sortedRows) {
        paidDays += Number(row.paid_days ?? 0);
        lop += Number(row.lop ?? 0);
        for (const key of LEAVE_SUMMARY_KEYS) {
          leaveTaken[key] += Number(row.leave_summary?.[`${key}_taken`] ?? 0);
        }
      }
      const totalRow = {
        'Emp Code': '',
        'Employee Name': 'Total',
        Designation: '',
        'Paid Days': roundTotal(paidDays),
        LOP: roundTotal(lop)
      };
      for (const key of LEAVE_SUMMARY_KEYS) {
        totalRow[key] = roundTotal(leaveTaken[key]);
      }
      totalRow.Remarks = '';
      data.push(totalRow);
    }
    return Papa.unparse(data);
  }

  const template = type === 'template';
  // Template is a format reference only — one sample employee row, blank day cells.
  const rowsForExport = template
    ? (sortedRows.length ? [sortedRows[0]] : [])
    : sortedRows;
  const data = rowsForExport.map((row) => buildDataRow(row, sheet, dayDates, { template }));
  if (!template && sortedRows.length > 0) {
    data.push(buildTotalsRow(sortedRows, sheet, dayDates));
  }
  return Papa.unparse(data);
}

export function exportFilename(sheet, type) {
  const ym = String(sheet?.attendance_month ?? '').slice(0, 7) || 'attendance';
  const prefix = {
    data: 'attendance-data',
    template: 'attendance-template',
    incentive: 'attendance-incentive',
    leave: 'attendance-leave',
    missing: 'attendance-missing-warning',
    warnings: 'attendance-missing-warning'
  }[type] || 'attendance-export';
  return `${prefix}-${ym}.csv`;
}
