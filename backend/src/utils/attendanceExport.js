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

function baseEmployeeFields(row, sheet) {
  return {
    'Emp Code': row.emp_code ?? '',
    'Employee Name': row.employee_name_snapshot ?? '',
    Mobile: row.mobile ?? '',
    Gender: row.gender ?? '',
    Designation: row.designation ?? '',
    DOJ: row.doj ?? '',
    Status: row.status_label ?? '',
    'Amt. Type': row.amt_type ?? '',
    'Contract Code': sheet?.contract_code ?? '',
    Entity: sheet?.entity ?? '',
    'Cycle Type': sheet?.cycle_type ?? '',
    'Payroll Cycle': sheet?.payroll_cycle ?? '',
    'Payroll Month': formatPayrollMonth(sheet?.attendance_month)
  };
}

function buildDataRow(row, sheet, dayDates, { template = false } = {}) {
  const out = baseEmployeeFields(row, sheet);
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
  out.Remarks = template ? '' : (row.remarks ?? '');
  return out;
}

export function buildAttendanceExportCsv({ sheet, rows, type }) {
  const dayDates = collectDayDates(rows, sheet);
  const sortedRows = [...(rows ?? [])].sort((a, b) =>
    String(a.employee_name_snapshot ?? '').localeCompare(String(b.employee_name_snapshot ?? ''), undefined, {
      numeric: true,
      sensitivity: 'base'
    })
  );

  if (type === 'incentive') {
    const data = sortedRows.map((row) => ({
      'Emp Code': row.emp_code ?? '',
      'Employee Name': row.employee_name_snapshot ?? '',
      Designation: row.designation ?? '',
      'Paid Days': row.paid_days ?? '',
      LOP: row.lop ?? '',
      Incentive: row.incentive ?? '',
      'Add-on Incentive': row.addon_incentive ?? '',
      Remarks: row.remarks ?? ''
    }));
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
    return Papa.unparse(data);
  }

  const template = type === 'template';
  const data = sortedRows.map((row) => buildDataRow(row, sheet, dayDates, { template }));
  return Papa.unparse(data);
}

export function exportFilename(sheet, type) {
  const ym = String(sheet?.attendance_month ?? '').slice(0, 7) || 'attendance';
  const prefix = {
    data: 'attendance-data',
    template: 'attendance-template',
    incentive: 'attendance-incentive',
    leave: 'attendance-leave'
  }[type] || 'attendance-export';
  return `${prefix}-${ym}.csv`;
}
