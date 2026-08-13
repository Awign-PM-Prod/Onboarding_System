import { supabaseAdmin } from '../supabase.js';
import { computeRowSummary, mergeYtdTaken, suggestDefaultMarks } from './attendanceCalculator.js';
import { parseIsoDate } from './attendanceLwd.js';
import {
  fetchClientPolicyBundle,
  fetchClientPolicyBundleForMonth,
  getPayrollPeriod,
  payrollCycleLabel
} from './clientPolicy.js';

function monthYm(dateOrYm) {
  const s = String(dateOrYm ?? '');
  if (/^\d{4}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 7);
  return null;
}

async function fetchSheetRowsWithMarks(sheetId) {
  const { data: rows, error: rowsErr } = await supabaseAdmin
    .from('attendance_rows')
    .select('*')
    .eq('sheet_id', sheetId)
    .order('employee_name_snapshot', { ascending: true });
  if (rowsErr) throw rowsErr;

  const rowIds = (rows ?? []).map((r) => r.id);
  let marks = [];
  if (rowIds.length) {
    const { data: dayMarks, error: dmErr } = await supabaseAdmin
      .from('attendance_day_marks')
      .select('*')
      .in('row_id', rowIds)
      .order('mark_date', { ascending: true });
    if (dmErr) throw dmErr;
    marks = dayMarks ?? [];
  }

  const marksByRow = new Map();
  for (const m of marks) {
    if (!marksByRow.has(m.row_id)) marksByRow.set(m.row_id, []);
    marksByRow.get(m.row_id).push(m);
  }

  return (rows ?? []).map((r) => ({
    ...r,
    day_marks: (marksByRow.get(r.id) ?? []).map((m) => ({
      ...m,
      mark_date: String(m.mark_date ?? '').slice(0, 10)
    }))
  }));
}

/**
 * Recalculate attendance sheets for a client after policy changes.
 * @param {string} clientId
 * @param {{ fromMonthYm?: string }} [options] - only sheets with attendance_month >= fromMonthYm
 */
export async function recalculateAllAttendanceSheetsForClient(clientId, options = {}) {
  const fromMonthDate = options.fromMonthYm ? monthYmToDate(options.fromMonthYm) : null;

  let query = supabaseAdmin
    .from('attendance_sheets')
    .select('id, attendance_month, payroll_cycle, payroll_start_date, payroll_end_date, updated_at')
    .eq('client_id', clientId)
    .order('attendance_month', { ascending: true });
  if (fromMonthDate) {
    query = query.gte('attendance_month', fromMonthDate);
  }
  const { data: sheets, error } = await query;
  if (error) throw error;
  if (!sheets?.length) return { sheets_recalculated: 0, sheet_ids: [] };

  const sheetIds = [];
  for (const sheet of sheets) {
    const rowsWithMarks = await fetchSheetRowsWithMarks(sheet.id);
    if (!rowsWithMarks.length) continue;

    const { payrollMeta, defaultMarksApplied } = await recalculateSheetRows(sheet, rowsWithMarks, clientId);
    const now = new Date().toISOString();
    const { error: upErr } = await supabaseAdmin
      .from('attendance_sheets')
      .update({
        payroll_cycle: payrollMeta.payroll_cycle,
        payroll_start_date: payrollMeta.payroll_start_date,
        payroll_end_date: payrollMeta.payroll_end_date,
        updated_at: now
      })
      .eq('id', sheet.id);
    if (upErr) throw upErr;

    const recalcMessage = defaultMarksApplied > 0
      ? `Recalculated after client policy update (${defaultMarksApplied} default week-off/holiday mark(s) applied)`
      : 'Recalculated after client policy update';

    try {
      await supabaseAdmin.from('attendance_activity_logs').insert({
        sheet_id: sheet.id,
        action: 'RECOMPUTE',
        actor_user_id: null,
        actor_role: 'SYSTEM',
        message: recalcMessage
      });
    } catch (logErr) {
      console.warn('[attendance-recalc] activity log insert skipped:', logErr?.message || logErr);
    }

    sheetIds.push(sheet.id);
  }

  return { sheets_recalculated: sheetIds.length, sheet_ids: sheetIds };
}

/**
 * Sum legend_totals from prior attendance rows in the same calendar year.
 * Returns Map<employee_id, ytd object>.
 */
export async function fetchYtdTakenByEmployee(clientId, year, beforeMonthYm, employeeIds) {
  const ytdMap = new Map();
  if (!employeeIds.length) return ytdMap;

  const yearStart = `${year}-01-01`;
  const beforeMonth = String(beforeMonthYm ?? '').slice(0, 7);
  const beforeDate = beforeMonth ? `${beforeMonth}-01` : `${year + 1}-01-01`;

  const { data: sheets, error: sErr } = await supabaseAdmin
    .from('attendance_sheets')
    .select('id, attendance_month')
    .eq('client_id', clientId)
    .gte('attendance_month', yearStart)
    .lt('attendance_month', beforeDate);
  if (sErr) throw sErr;

  const sheetIds = (sheets ?? []).map((s) => s.id);
  if (!sheetIds.length) return ytdMap;

  const { data: rows, error: rErr } = await supabaseAdmin
    .from('attendance_rows')
    .select('employee_id, legend_totals')
    .in('sheet_id', sheetIds)
    .in('employee_id', employeeIds);
  if (rErr) throw rErr;

  const byEmployee = new Map();
  for (const row of rows ?? []) {
    if (!row.employee_id) continue;
    if (!byEmployee.has(row.employee_id)) byEmployee.set(row.employee_id, []);
    byEmployee.get(row.employee_id).push(row.legend_totals);
  }

  for (const empId of employeeIds) {
    ytdMap.set(empId, mergeYtdTaken(byEmployee.get(empId) ?? []));
  }
  return ytdMap;
}

/**
 * Insert default W/NH marks for empty cells from client policy. Never overwrites existing marks.
 * Mutates rowsWithMarks in place to include newly inserted marks.
 */
export async function applyDefaultMarksForRows(rowsWithMarks, policyBundle, monthYmVal) {
  if (!rowsWithMarks?.length || !monthYmVal) return 0;

  let applied = 0;
  for (const row of rowsWithMarks) {
    const employee = { doj: row.doj, lwd: row.lwd };
    const suggestions = suggestDefaultMarks(policyBundle, monthYmVal, row.day_marks ?? [], employee);
    if (!suggestions.length) continue;

    for (const s of suggestions) {
      const { error } = await supabaseAdmin.from('attendance_day_marks').insert({
        row_id: row.id,
        mark_date: s.mark_date,
        code: s.code
      });
      if (error) throw error;
      applied += 1;
      if (!row.day_marks) row.day_marks = [];
      row.day_marks.push({ mark_date: s.mark_date, code: s.code });
    }
  }
  return applied;
}

/**
 * Apply default W/NH marks for one row. Returns updated day marks array.
 */
export async function applyDefaultMarksForRow(rowId, dayMarks, policyBundle, monthYmVal, employee = null) {
  const suggestions = suggestDefaultMarks(policyBundle, monthYmVal, dayMarks ?? [], employee);
  const updated = [...(dayMarks ?? [])];
  for (const s of suggestions) {
    const { error } = await supabaseAdmin.from('attendance_day_marks').insert({
      row_id: rowId,
      mark_date: s.mark_date,
      code: s.code
    });
    if (error) throw error;
    updated.push({ mark_date: s.mark_date, code: s.code });
  }
  return updated;
}

/** Delete day marks after LWD on this sheet only. Mutates rowsWithMarks. */
export async function deleteMarksAfterLwdForRows(rowsWithMarks) {
  let deleted = 0;
  for (const row of rowsWithMarks ?? []) {
    const leave = parseIsoDate(row.lwd);
    if (!leave || !row.id) continue;
    const { data, error } = await supabaseAdmin
      .from('attendance_day_marks')
      .delete()
      .eq('row_id', row.id)
      .gt('mark_date', leave)
      .select('id');
    if (error) throw error;
    deleted += (data ?? []).length;
    if (Array.isArray(row.day_marks)) {
      row.day_marks = row.day_marks.filter((m) => {
        const d = parseIsoDate(m.mark_date);
        return !d || d <= leave;
      });
    }
  }
  return deleted;
}

export async function recalculateRowSummary({
  row,
  dayMarks,
  policyBundle,
  monthYm: monthYmParam,
  ytdTaken
}) {
  return computeRowSummary({
    dayMarks,
    policyBundle,
    employee: {
      designation: row.designation,
      gender: row.gender,
      doj: row.doj,
      lwd: row.lwd
    },
    monthYm: monthYmParam,
    ytdTaken: ytdTaken ?? mergeYtdTaken([])
  });
}

function monthYmToDate(monthYm) {
  const s = String(monthYm ?? '').trim();
  if (/^\d{4}-\d{2}$/.test(s)) return `${s}-01`;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return `${s.slice(0, 7)}-01`;
  return null;
}

/**
 * Recalculate employee rows in sheets after fromMonthYm (same calendar year) for YTD cascade.
 */
export async function recalculateForwardYtdForEmployees(clientId, fromMonthYm, employeeIds) {
  const ids = [...new Set((employeeIds ?? []).filter(Boolean))];
  if (!ids.length || !fromMonthYm) return { sheets_updated: 0, row_ids: [] };

  const fromMonthDate = monthYmToDate(fromMonthYm);
  if (!fromMonthDate) return { sheets_updated: 0, row_ids: [] };

  const year = Number(fromMonthYm.slice(0, 4)) || new Date().getFullYear();
  const yearEnd = `${year}-12-01`;

  const { data: sheets, error: sErr } = await supabaseAdmin
    .from('attendance_sheets')
    .select('id, attendance_month')
    .eq('client_id', clientId)
    .gt('attendance_month', fromMonthDate)
    .gte('attendance_month', `${year}-01-01`)
    .lte('attendance_month', yearEnd)
    .order('attendance_month', { ascending: true });
  if (sErr) throw sErr;
  if (!sheets?.length) return { sheets_updated: 0, row_ids: [] };

  const updatedRowIds = [];
  for (const sheet of sheets) {
    const monthYmVal = monthYm(sheet.attendance_month);
    const policyBundle = await fetchClientPolicyBundleForMonth(clientId, monthYmVal);
    const rowsWithMarks = (await fetchSheetRowsWithMarks(sheet.id)).filter(
      (r) => r.employee_id && ids.includes(r.employee_id)
    );
    if (!rowsWithMarks.length) continue;

    const ytdMap = await fetchYtdTakenByEmployee(clientId, year, monthYmVal, ids);
    for (const row of rowsWithMarks) {
      const summary = await recalculateRowSummary({
        row,
        dayMarks: row.day_marks ?? [],
        policyBundle,
        monthYm: monthYmVal,
        ytdTaken: ytdMap.get(row.employee_id) ?? mergeYtdTaken([])
      });
      const { error: upErr } = await supabaseAdmin
        .from('attendance_rows')
        .update({
          paid_days: summary.paid_days,
          lop: summary.lop,
          not_considered: summary.not_considered,
          total_days: summary.total_days,
          legend_totals: summary.legend_totals,
          leave_summary: summary.leave_summary,
          incentive: summary.incentive,
          updated_at: new Date().toISOString()
        })
        .eq('id', row.id);
      if (upErr) throw upErr;
      updatedRowIds.push(row.id);
    }
  }

  return { sheets_updated: sheets.length, row_ids: updatedRowIds };
}

export async function recalculateSheetRows(sheet, rowsWithMarks, clientId) {
  const monthYmVal = monthYm(sheet.attendance_month);
  const policyBundle = await fetchClientPolicyBundleForMonth(clientId, monthYmVal);
  await deleteMarksAfterLwdForRows(rowsWithMarks);
  const defaultMarksApplied = await applyDefaultMarksForRows(rowsWithMarks, policyBundle, monthYmVal);
  const year = Number(monthYmVal?.slice(0, 4)) || new Date().getFullYear();
  const employeeIds = rowsWithMarks.map((r) => r.employee_id).filter(Boolean);
  const ytdMap = await fetchYtdTakenByEmployee(clientId, year, monthYmVal, employeeIds);

  const period = getPayrollPeriod(policyBundle.attendance_policy, monthYmVal);
  const payrollMeta = {
    payroll_cycle: payrollCycleLabel(policyBundle.attendance_policy),
    payroll_start_date: period.start,
    payroll_end_date: period.end
  };

  const updates = [];
  for (const row of rowsWithMarks) {
    const summary = await recalculateRowSummary({
      row,
      dayMarks: row.day_marks ?? [],
      policyBundle,
      monthYm: monthYmVal,
      ytdTaken: ytdMap.get(row.employee_id) ?? mergeYtdTaken([])
    });
    updates.push({
      id: row.id,
      paid_days: summary.paid_days,
      lop: summary.lop,
      not_considered: summary.not_considered,
      total_days: summary.total_days,
      legend_totals: summary.legend_totals,
      leave_summary: summary.leave_summary,
      incentive: summary.incentive,
      updated_at: new Date().toISOString()
    });
  }

  for (const u of updates) {
    const { id, ...fields } = u;
    const { error } = await supabaseAdmin.from('attendance_rows').update(fields).eq('id', id);
    if (error) throw error;
  }

  return { payrollMeta, policyBundle, defaultMarksApplied };
}

export async function loadClientPolicyForResponse(clientId, monthYm = null) {
  if (monthYm) return fetchClientPolicyBundleForMonth(clientId, monthYm);
  return fetchClientPolicyBundle(clientId);
}
