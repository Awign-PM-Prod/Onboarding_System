import { Router } from 'express';
import multer from 'multer';
import { supabaseAdmin } from '../supabase.js';
import { parseAmsAttendanceCsv } from '../utils/amsAttendanceParser.js';
import {
  isValidAttendanceCode,
  normalizeAttendanceCode
} from '../utils/attendanceLegend.js';
import {
  fetchYtdTakenByEmployee,
  applyDefaultMarksForRow,
  loadClientPolicyForResponse,
  recalculateAllAttendanceSheetsForClient,
  recalculateForwardYtdForEmployees,
  recalculateRowSummary,
  recalculateSheetRows
} from '../utils/attendanceRecalc.js';
import { mergeYtdTaken } from '../utils/attendanceCalculator.js';
import { getPayrollPeriod, payrollCycleLabel } from '../utils/clientPolicy.js';
import { buildAttendanceExportCsv, exportFilename } from '../utils/attendanceExport.js';

const router = Router({ mergeParams: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

const SEND_ATTENDANCE_EMAIL_EDGE_FUNCTION =
  process.env.SEND_ATTENDANCE_EMAIL_EDGE_FUNCTION || 'send-attendance-email';
const FRONTEND_URL = String(process.env.FRONTEND_URL || 'http://localhost:8088').trim() || 'http://localhost:8088';

async function loadUserRole(userId) {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id, name, email, role')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function resolveClientAccess(req, clientId) {
  const user = await loadUserRole(req.user.id);
  if (!user) return { ok: false, status: 403, error: 'User profile not found' };

  const { data: client, error } = await supabaseAdmin
    .from('clients')
    .select('id, client_name, contract_code, program_manager_id, created_by')
    .eq('id', clientId)
    .maybeSingle();
  if (error) throw error;
  if (!client) return { ok: false, status: 404, error: 'Client not found' };

  const isPm = user.role === 'PROGRAM_MANAGER' && client.program_manager_id === user.id;
  const isPl = user.role === 'PAYROLL_LEAD' && client.created_by === user.id;
  if (!isPm && !isPl) {
    return { ok: false, status: 403, error: 'Not authorized for this client' };
  }

  req.user.role = user.role;
  req.user.profile = user;
  return { ok: true, client, user, isPm, isPl };
}

function formatMarkLabel(code) {
  return code ?? '(empty)';
}

function buildDayMarkChangeMessage(empCode, changes, maxLen = 500) {
  const parts = changes.map(({ markDate, before, after }) =>
    `${markDate} ${formatMarkLabel(before)}→${formatMarkLabel(after)}`
  );
  let message = `${empCode}: ${parts.join('; ')}`;
  if (message.length > maxLen) {
    const kept = [];
    let len = `${empCode}: `.length;
    for (const part of parts) {
      const next = kept.length ? `; ${part}` : part;
      if (len + next.length + 12 > maxLen) break;
      kept.push(part);
      len += next.length;
    }
    const remaining = parts.length - kept.length;
    message = `${empCode}: ${kept.join('; ')}${remaining > 0 ? `; …and ${remaining} more` : ''}`;
  }
  return message;
}

function buildRowFieldChangeMessage(empCode, beforeFields, rowUpdate) {
  const parts = [];
  if (beforeFields.addon_incentive !== rowUpdate.addon_incentive) {
    parts.push(`addon incentive ${formatMarkLabel(beforeFields.addon_incentive)}→${formatMarkLabel(rowUpdate.addon_incentive)}`);
  }
  if (beforeFields.remarks !== rowUpdate.remarks) {
    if (beforeFields.remarks === rowUpdate.remarks) {
      // no-op
    } else if (!beforeFields.remarks && rowUpdate.remarks) {
      parts.push('remarks added');
    } else if (beforeFields.remarks && !rowUpdate.remarks) {
      parts.push('remarks cleared');
    } else {
      parts.push('remarks updated');
    }
  }
  return parts.length ? `${empCode}: ${parts.join('; ')}` : `${empCode}: row fields updated`;
}

async function writeLog({
  sheetId,
  rowId = null,
  dayMarkId = null,
  action,
  actorUserId,
  actorRole,
  beforeJson = null,
  afterJson = null,
  message = null
}) {
  const { error } = await supabaseAdmin.from('attendance_activity_logs').insert({
    sheet_id: sheetId,
    row_id: rowId,
    day_mark_id: dayMarkId,
    action,
    actor_user_id: actorUserId,
    actor_role: actorRole,
    before_json: beforeJson,
    after_json: afterJson,
    message
  });
  if (error) throw error;
}

async function invokeAttendanceEmail({ toEmail, toName, subject, html, text }) {
  const supabaseUrl = String(process.env.SUPABASE_URL ?? '').trim();
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!supabaseUrl || !serviceRoleKey) {
    console.warn('[attendance-email] Missing Supabase env; skipping email send');
    return { skipped: true };
  }
  if (!toEmail) return { skipped: true, reason: 'no_recipient' };

  const endpoint = `${supabaseUrl}/functions/v1/${encodeURIComponent(SEND_ATTENDANCE_EMAIL_EDGE_FUNCTION)}`;
  try {
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        subject,
        recipients: [{ name: toName || '', email: toEmail, html, text }]
      })
    });
    const raw = await resp.text();
    let body = null;
    try {
      body = raw ? JSON.parse(raw) : null;
    } catch {
      body = null;
    }
    if (!resp.ok) {
      console.warn('[attendance-email] Edge failed', body?.error || resp.status);
      return { ok: false, error: body?.error || `Edge failed (${resp.status})` };
    }
    return { ok: true, body };
  } catch (err) {
    console.warn('[attendance-email] invoke error', err?.message || err);
    return { ok: false, error: err?.message || String(err) };
  }
}

function attendanceLink(clientId, role) {
  const base = FRONTEND_URL.replace(/\/+$/, '');
  if (role === 'PAYROLL_LEAD') {
    return `${base}/dashboard/client/${clientId}/attendance`;
  }
  return `${base}/pm-dashboard/client/${clientId}/attendance`;
}

async function fetchSheetBundle(sheetId) {
  const { data: sheet, error } = await supabaseAdmin
    .from('attendance_sheets')
    .select('*')
    .eq('id', sheetId)
    .maybeSingle();
  if (error) throw error;
  if (!sheet) return null;

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

  const { data: grants, error: gErr } = await supabaseAdmin
    .from('attendance_edit_grants')
    .select('user_id')
    .eq('sheet_id', sheetId);
  if (gErr) throw gErr;

  return {
    sheet,
    grant_user_ids: (grants ?? []).map((g) => g.user_id),
    rows: (rows ?? []).map((r) => ({
      ...r,
      day_marks: (marksByRow.get(r.id) ?? []).map((m) => ({
        ...m,
        mark_date: String(m.mark_date ?? '').slice(0, 10)
      }))
    }))
  };
}

async function clearEditGrants(sheetId) {
  const { error } = await supabaseAdmin.from('attendance_edit_grants').delete().eq('sheet_id', sheetId);
  if (error) throw error;
}

async function loadEligiblePms(client) {
  if (!client?.program_manager_id) return [];
  const { data: pm, error } = await supabaseAdmin
    .from('users')
    .select('id, name, email, role')
    .eq('id', client.program_manager_id)
    .maybeSingle();
  if (error) throw error;
  if (!pm) return [];
  return [
    {
      id: pm.id,
      name: pm.name || '',
      email: pm.email || '',
      role_label: 'Program Manager'
    }
  ];
}

function sheetEditScope(sheet) {
  return String(sheet?.edit_scope || 'NONE').toUpperCase();
}

function canUserEditSheet(sheet, access, grantUserIds = []) {
  if (!sheet || sheet.locked) return false;
  if (access.isPl) return true;
  if (!access.isPm) return false;
  const scope = sheetEditScope(sheet);
  if (scope === 'ALL_PMS') return true;
  if (scope === 'SHARED') {
    return (grantUserIds ?? []).includes(access.user.id);
  }
  return false; // PL_ONLY or NONE
}

function buildCapabilities(sheet, access, grantUserIds = []) {
  const locked = Boolean(sheet?.locked);
  const fullyLocked = locked && sheetEditScope(sheet) === 'NONE';
  const canEdit = canUserEditSheet(sheet, access, grantUserIds);
  return {
    can_edit: canEdit,
    can_lock: access.isPl && !locked,
    can_unlock: access.isPl && fullyLocked,
    can_request_edit: access.isPm && locked && !canEdit
  };
}

function assertCanEdit(sheet, access, grantUserIds = []) {
  if (!canUserEditSheet(sheet, access, grantUserIds)) {
    const err = new Error('Attendance sheet is locked. Unlock it before editing.');
    err.status = 423;
    throw err;
  }
}

function monthParamToDate(month) {
  const s = String(month ?? '').trim();
  if (/^\d{4}-\d{2}$/.test(s)) return `${s}-01`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s.slice(0, 7)}-01`;
  return null;
}

function monthYm(dateOrYm) {
  const s = String(dateOrYm ?? '');
  if (/^\d{4}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 7);
  return null;
}

function formatMonthLabel(dateOrYm) {
  const ym = monthYm(dateOrYm);
  if (!ym) return String(dateOrYm ?? '');
  const d = new Date(`${ym}-01T00:00:00Z`);
  return d.toLocaleString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

// GET /api/clients/:clientId/attendance?month=YYYY-MM
router.get('/', async (req, res, next) => {
  try {
    const clientId = req.params.clientId;
    const access = await resolveClientAccess(req, clientId);
    if (!access.ok) return res.status(access.status).json({ error: access.error });

    const monthDate = monthParamToDate(req.query.month);
    if (!monthDate) {
      return res.status(400).json({ error: 'month query param required (YYYY-MM)' });
    }

    const { data: sheet, error } = await supabaseAdmin
      .from('attendance_sheets')
      .select('*')
      .eq('client_id', clientId)
      .eq('attendance_month', monthDate)
      .maybeSingle();
    if (error) throw error;

    if (!sheet) {
      const eligiblePms = await loadEligiblePms(access.client);
      const client_policy = await loadClientPolicyForResponse(clientId, monthDate.slice(0, 7));
      return res.json({
        sheet: null,
        rows: [],
        client: access.client,
        client_policy,
        role: access.user.role,
        eligible_pms: eligiblePms,
        grant_user_ids: [],
        can_edit: true,
        can_lock: access.isPl,
        can_unlock: false,
        can_request_edit: false
      });
    }

    const bundle = await fetchSheetBundle(sheet.id);
    const caps = buildCapabilities(bundle.sheet, access, bundle.grant_user_ids);
    const eligiblePms = await loadEligiblePms(access.client);
    const client_policy = await loadClientPolicyForResponse(clientId, monthYm(sheet.attendance_month));
    res.json({
      ...bundle,
      client: access.client,
      client_policy,
      role: access.user.role,
      eligible_pms: eligiblePms,
      ...caps
    });
  } catch (err) {
    next(err);
  }
});

// POST recompute all sheets for client (e.g. after policy change)
router.post('/recompute-all', async (req, res, next) => {
  try {
    const clientId = req.params.clientId;
    const access = await resolveClientAccess(req, clientId);
    if (!access.ok) return res.status(access.status).json({ error: access.error });

    const result = await recalculateAllAttendanceSheetsForClient(clientId);
    res.json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
});

// GET export template for a month before any sheet has been uploaded
router.get('/export', async (req, res, next) => {
  try {
    const clientId = req.params.clientId;
    const access = await resolveClientAccess(req, clientId);
    if (!access.ok) return res.status(access.status).json({ error: access.error });

    const type = String(req.query.type ?? 'template').toLowerCase();
    if (type !== 'template') {
      return res.status(400).json({ error: 'Only template export is available before CSV upload' });
    }

    const monthDate = monthParamToDate(req.query.month);
    if (!monthDate) {
      return res.status(400).json({ error: 'month query param required (YYYY-MM)' });
    }

    const { data: existingSheet, error: sheetErr } = await supabaseAdmin
      .from('attendance_sheets')
      .select('id')
      .eq('client_id', clientId)
      .eq('attendance_month', monthDate)
      .maybeSingle();
    if (sheetErr) throw sheetErr;
    if (existingSheet?.id) {
      return res.status(400).json({
        error: 'Attendance sheet already exists for this month. Use sheet export instead.'
      });
    }

    const { data: employees, error: empErr } = await supabaseAdmin
      .from('employees')
      .select('id, emp_code, name, mobile, designation, date_of_joining, ctc_type')
      .eq('client_id', clientId)
      .not('emp_code', 'is', null)
      .order('name', { ascending: true });
    if (empErr) throw empErr;

    const client_policy = await loadClientPolicyForResponse(clientId);
    const monthYmVal = monthYm(monthDate);
    const period = getPayrollPeriod(client_policy?.attendance_policy, monthYmVal);

    const sheet = {
      attendance_month: monthDate,
      contract_code: access.client.contract_code,
      payroll_cycle: payrollCycleLabel(client_policy?.attendance_policy),
      payroll_start_date: period?.start ?? null,
      payroll_end_date: period?.end ?? null
    };

    const rows = (employees ?? []).map((emp) => ({
      emp_code: String(emp.emp_code ?? '').trim(),
      employee_name_snapshot: emp.name ?? '',
      mobile: emp.mobile ?? '',
      designation: emp.designation ?? '',
      doj: emp.date_of_joining ?? null,
      amt_type: emp.ctc_type ?? '',
      day_marks: [],
      legend_totals: {},
      leave_summary: {}
    }));

    if (!rows.length) {
      rows.push({
        emp_code: '',
        employee_name_snapshot: '',
        mobile: '',
        designation: '',
        doj: null,
        amt_type: '',
        day_marks: [],
        legend_totals: {},
        leave_summary: {}
      });
    }

    const csv = buildAttendanceExportCsv({ sheet, rows, type: 'template' });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${exportFilename(sheet, 'template')}"`);
    return res.send(csv);
  } catch (err) {
    next(err);
  }
});

// GET logs
router.get('/:sheetId/logs', async (req, res, next) => {
  try {
    const clientId = req.params.clientId;
    const access = await resolveClientAccess(req, clientId);
    if (!access.ok) return res.status(access.status).json({ error: access.error });

    const { data: sheet, error } = await supabaseAdmin
      .from('attendance_sheets')
      .select('id, client_id')
      .eq('id', req.params.sheetId)
      .eq('client_id', clientId)
      .maybeSingle();
    if (error) throw error;
    if (!sheet) return res.status(404).json({ error: 'Sheet not found' });

    const { data: logs, error: logErr } = await supabaseAdmin
      .from('attendance_activity_logs')
      .select('*')
      .eq('sheet_id', sheet.id)
      .order('created_at', { ascending: false })
      .limit(200);
    if (logErr) throw logErr;

    const actorIds = Array.from(
      new Set((logs ?? []).map((l) => l.actor_user_id).filter(Boolean))
    );
    let nameById = new Map();
    if (actorIds.length) {
      const { data: users, error: uErr } = await supabaseAdmin
        .from('users')
        .select('id, name, email')
        .in('id', actorIds);
      if (uErr) throw uErr;
      nameById = new Map((users ?? []).map((u) => [u.id, u]));
    }

    res.json(
      (logs ?? []).map((l) => ({
        ...l,
        actor_name: nameById.get(l.actor_user_id)?.name ?? null,
        actor_email: nameById.get(l.actor_user_id)?.email ?? null
      }))
    );
  } catch (err) {
    next(err);
  }
});

// POST upload
router.post('/upload', upload.single('file'), async (req, res, next) => {
  try {
    const clientId = req.params.clientId;
    const access = await resolveClientAccess(req, clientId);
    if (!access.ok) return res.status(access.status).json({ error: access.error });

    if (!req.file) return res.status(400).json({ error: 'CSV file required' });
    const selectedMonth = monthParamToDate(req.body?.month || req.query?.month);
    if (!selectedMonth) {
      return res.status(400).json({
        error: 'Attendance month is required. Select a month, then upload the matching CSV.'
      });
    }

    const text = req.file.buffer.toString('utf8');
    // Parse without month hint first so CSV day headers / Payroll Month are authoritative.
    const { sheetMeta, rows: parsedRows, errors: parseErrors } = parseAmsAttendanceCsv(text, {
      attendanceMonthHint: null
    });

    let csvMonth = monthParamToDate(sheetMeta?.attendance_month);
    const dayMarkCountPreliminary = parsedRows.reduce((n, r) => n + (r.day_marks?.length || 0), 0);
    let rowsToUse = parsedRows;
    let metaToUse = sheetMeta;
    let errorsToUse = parseErrors;

    if (csvMonth && monthYm(csvMonth) !== monthYm(selectedMonth)) {
      return res.status(400).json({
        error: `This CSV is for ${formatMonthLabel(csvMonth)}, but ${formatMonthLabel(selectedMonth)} is selected. Change Attendance Month to ${formatMonthLabel(csvMonth)} (or upload the CSV for ${formatMonthLabel(selectedMonth)}). Upload was not saved.`,
        csv_month: monthYm(csvMonth),
        selected_month: monthYm(selectedMonth)
      });
    }

    // Bare day numbers (1…31) need the selected month as a parse hint.
    if (dayMarkCountPreliminary === 0) {
      const hinted = parseAmsAttendanceCsv(text, { attendanceMonthHint: selectedMonth });
      rowsToUse = hinted.rows;
      metaToUse = hinted.sheetMeta;
      errorsToUse = hinted.errors;
      csvMonth = monthParamToDate(metaToUse?.attendance_month);
      if (csvMonth && monthYm(csvMonth) !== monthYm(selectedMonth)) {
        return res.status(400).json({
          error: `This CSV is for ${formatMonthLabel(csvMonth)}, but ${formatMonthLabel(selectedMonth)} is selected. Change Attendance Month to ${formatMonthLabel(csvMonth)} (or upload the CSV for ${formatMonthLabel(selectedMonth)}). Upload was not saved.`,
          csv_month: monthYm(csvMonth),
          selected_month: monthYm(selectedMonth)
        });
      }
    }

    const attendanceMonth = selectedMonth;
    const dayMarkCount = rowsToUse.reduce((n, r) => n + (r.day_marks?.length || 0), 0);
    if (rowsToUse.length > 0 && dayMarkCount === 0) {
      return res.status(400).json({
        error:
          'No day columns detected in the CSV. Use date headers like 1-Jul-26 (or 1…31 with Payroll Month). Existing employee rows were not replaced.',
        details: errorsToUse
      });
    }

    const { data: existing, error: exErr } = await supabaseAdmin
      .from('attendance_sheets')
      .select('*')
      .eq('client_id', clientId)
      .eq('attendance_month', attendanceMonth)
      .maybeSingle();
    if (exErr) throw exErr;
    if (existing) {
      const existingBundle = await fetchSheetBundle(existing.id);
      if (!canUserEditSheet(existing, access, existingBundle?.grant_user_ids ?? [])) {
        return res.status(423).json({ error: 'Attendance sheet is locked. Unlock it before uploading.' });
      }
    }

    const empCodes = rowsToUse.map((r) => r.emp_code);
    const { data: employees, error: empErr } = await supabaseAdmin
      .from('employees')
      .select('id, emp_code, name, mobile')
      .eq('client_id', clientId)
      .in('emp_code', empCodes.length ? empCodes : ['__none__']);
    if (empErr) throw empErr;
    const empByCode = new Map((employees ?? []).map((e) => [String(e.emp_code).trim(), e]));

    const matched = [];
    const skipped = [];
    const allErrors = [...(errorsToUse ?? [])];

    for (const row of rowsToUse) {
      const emp = empByCode.get(row.emp_code);
      if (!emp) {
        skipped.push({ emp_code: row.emp_code, error: 'No matching employee emp_code on this client' });
        continue;
      }
      matched.push({ ...row, employee_id: emp.id });
    }

    if (matched.length === 0) {
      return res.status(400).json({
        error:
          'No CSV rows matched employees on this client. Ensure emp_code values exist (e.g. T016394). Sheet was not changed.',
        details: [...(errorsToUse ?? []), ...skipped]
      });
    }

    const now = new Date().toISOString();
    let sheetId = existing?.id;

    if (existing) {
      // replace rows
      const { error: delErr } = await supabaseAdmin
        .from('attendance_rows')
        .delete()
        .eq('sheet_id', existing.id);
      if (delErr) throw delErr;

      const { data: updated, error: upErr } = await supabaseAdmin
        .from('attendance_sheets')
        .update({
          status: 'DRAFT',
          contract_code: metaToUse?.contract_code,
          entity: metaToUse?.entity,
          cycle_type: metaToUse?.cycle_type,
          payroll_cycle: metaToUse?.payroll_cycle,
          payroll_start_date: metaToUse?.payroll_start_date,
          payroll_end_date: metaToUse?.payroll_end_date,
          salary_payout_date: metaToUse?.salary_payout_date,
          project_manager_name: metaToUse?.project_manager_name,
          source_filename: req.file.originalname || null,
          uploaded_by: req.user.id,
          uploaded_at: now,
          updated_at: now,
          unlock_request_status: existing.unlock_request_status === 'PENDING'
            ? 'PENDING'
            : existing.unlock_request_status
        })
        .eq('id', existing.id)
        .select()
        .single();
      if (upErr) throw upErr;
      sheetId = updated.id;
    } else {
      const { data: created, error: crErr } = await supabaseAdmin
        .from('attendance_sheets')
        .insert({
          client_id: clientId,
          attendance_month: attendanceMonth,
          status: 'DRAFT',
          locked: false,
          ever_locked: false,
          unlock_request_status: 'NONE',
          edit_scope: 'ALL_PMS',
          contract_code: metaToUse?.contract_code,
          entity: metaToUse?.entity,
          cycle_type: metaToUse?.cycle_type,
          payroll_cycle: metaToUse?.payroll_cycle,
          payroll_start_date: metaToUse?.payroll_start_date,
          payroll_end_date: metaToUse?.payroll_end_date,
          salary_payout_date: metaToUse?.salary_payout_date,
          project_manager_name: metaToUse?.project_manager_name,
          source_filename: req.file.originalname || null,
          uploaded_by: req.user.id,
          uploaded_at: now
        })
        .select()
        .single();
      if (crErr) throw crErr;
      sheetId = created.id;
    }

    // Batch insert rows (avoid N+1 round-trips that time out the browser at 15s)
    const rowPayloads = matched.map((row) => ({
      sheet_id: sheetId,
      employee_id: row.employee_id,
      emp_code: row.emp_code,
      employee_name_snapshot: row.employee_name_snapshot,
      mobile: row.mobile,
      gender: row.gender,
      location: row.location,
      designation: row.designation,
      doj: row.doj,
      lwd: row.lwd,
      status_label: row.status_label,
      amt_type: row.amt_type,
      monthly_amt: row.monthly_amt,
      paid_days: row.paid_days,
      lop: row.lop,
      not_considered: row.not_considered,
      total_days: row.total_days,
      legend_totals: row.legend_totals,
      leave_summary: row.leave_summary,
      remarks: row.remarks,
      addon_incentive: row.addon_incentive
    }));

    let insertedRows = [];
    if (rowPayloads.length) {
      const { data, error: rowErr } = await supabaseAdmin
        .from('attendance_rows')
        .insert(rowPayloads)
        .select('id, emp_code');
      if (rowErr) throw rowErr;
      insertedRows = data ?? [];
    }

    const rowIdByEmpCode = new Map(insertedRows.map((r) => [r.emp_code, r.id]));
    const dayMarkPayloads = [];
    for (const row of matched) {
      const rowId = rowIdByEmpCode.get(row.emp_code);
      if (!rowId || !row.day_marks?.length) continue;
      for (const d of row.day_marks) {
        dayMarkPayloads.push({
          row_id: rowId,
          mark_date: d.mark_date,
          code: d.code
        });
      }
    }

    // Insert day marks in chunks (PostgREST payload limits)
    const CHUNK = 500;
    for (let i = 0; i < dayMarkPayloads.length; i += CHUNK) {
      const chunk = dayMarkPayloads.slice(i, i + CHUNK);
      const { error: dmErr } = await supabaseAdmin.from('attendance_day_marks').insert(chunk);
      if (dmErr) throw dmErr;
    }

    const bundleBeforeRecalc = await fetchSheetBundle(sheetId);
    const { payrollMeta, defaultMarksApplied } = await recalculateSheetRows(
      bundleBeforeRecalc.sheet,
      bundleBeforeRecalc.rows,
      clientId
    );

    const sheetMetaUpdate = {
      payroll_cycle: metaToUse?.payroll_cycle || payrollMeta.payroll_cycle,
      payroll_start_date: metaToUse?.payroll_start_date || payrollMeta.payroll_start_date,
      payroll_end_date: metaToUse?.payroll_end_date || payrollMeta.payroll_end_date,
      updated_at: new Date().toISOString()
    };
    await supabaseAdmin.from('attendance_sheets').update(sheetMetaUpdate).eq('id', sheetId);

    const uploadMessage = defaultMarksApplied > 0
      ? `Uploaded ${matched.length} rows (${defaultMarksApplied} default week-off/holiday mark(s) applied)`
      : `Uploaded ${matched.length} rows`;

    await writeLog({
      sheetId,
      action: 'UPLOAD',
      actorUserId: req.user.id,
      actorRole: access.user.role,
      afterJson: {
        imported: matched.length,
        skipped: skipped.length,
        day_marks: dayMarkPayloads.length,
        default_marks_applied: defaultMarksApplied,
        filename: req.file.originalname
      },
      message: uploadMessage
    });

    const bundle = await fetchSheetBundle(sheetId);
    const caps = buildCapabilities(bundle.sheet, access, bundle.grant_user_ids);
    const eligiblePms = await loadEligiblePms(access.client);
    const client_policy = await loadClientPolicyForResponse(clientId);
    res.status(skipped.length || allErrors.length ? 207 : 200).json({
      imported: matched.length,
      skipped: skipped.length,
      errors: [...allErrors, ...skipped],
      ...bundle,
      client: access.client,
      client_policy,
      role: access.user.role,
      eligible_pms: eligiblePms,
      ...caps
    });
  } catch (err) {
    next(err);
  }
});

// GET export CSV
router.get('/:sheetId/export', async (req, res, next) => {
  try {
    const clientId = req.params.clientId;
    const access = await resolveClientAccess(req, clientId);
    if (!access.ok) return res.status(access.status).json({ error: access.error });

    const type = String(req.query.type ?? 'data').toLowerCase();
    const allowed = new Set(['data', 'template', 'incentive', 'leave']);
    if (!allowed.has(type)) {
      return res.status(400).json({ error: 'type must be data, template, incentive, or leave' });
    }

    const { data: sheet, error } = await supabaseAdmin
      .from('attendance_sheets')
      .select('*')
      .eq('id', req.params.sheetId)
      .eq('client_id', clientId)
      .maybeSingle();
    if (error) throw error;
    if (!sheet) return res.status(404).json({ error: 'Sheet not found' });

    const bundle = await fetchSheetBundle(sheet.id);
    const csv = buildAttendanceExportCsv({
      sheet: bundle.sheet,
      rows: bundle.rows,
      type
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${exportFilename(sheet, type)}"`);
    return res.send(csv);
  } catch (err) {
    next(err);
  }
});

// PATCH batch save row changes (day marks, incentive, remarks)
router.patch('/:sheetId/rows', async (req, res, next) => {
  try {
    const clientId = req.params.clientId;
    const access = await resolveClientAccess(req, clientId);
    if (!access.ok) return res.status(access.status).json({ error: access.error });

    const changes = req.body?.rows;
    if (!Array.isArray(changes) || changes.length === 0) {
      return res.status(400).json({ error: 'rows array is required' });
    }

    const { data: sheet, error } = await supabaseAdmin
      .from('attendance_sheets')
      .select('*')
      .eq('id', req.params.sheetId)
      .eq('client_id', clientId)
      .maybeSingle();
    if (error) throw error;
    if (!sheet) return res.status(404).json({ error: 'Sheet not found' });

    const { data: grantsForPatch } = await supabaseAdmin
      .from('attendance_edit_grants')
      .select('user_id')
      .eq('sheet_id', sheet.id);
    assertCanEdit(
      sheet,
      access,
      (grantsForPatch ?? []).map((g) => g.user_id)
    );

    const monthYmVal = monthYm(sheet.attendance_month);
    const client_policy = await loadClientPolicyForResponse(clientId, monthYmVal);
    const year = Number(monthYmVal?.slice(0, 4)) || new Date().getFullYear();
    const affectedEmployeeIds = [];

    for (const change of changes) {
      const rowId = change?.row_id;
      if (!rowId) continue;

      const { data: row, error: rowErr } = await supabaseAdmin
        .from('attendance_rows')
        .select('*')
        .eq('id', rowId)
        .eq('sheet_id', sheet.id)
        .maybeSingle();
      if (rowErr) throw rowErr;
      if (!row) continue;

      const beforeFields = {
        incentive: row.incentive,
        addon_incentive: row.addon_incentive,
        remarks: row.remarks
      };
      const dayMarkChanges = [];

      if (Array.isArray(change.day_marks)) {
        for (const dm of change.day_marks) {
          const markDate = String(dm?.mark_date ?? '').slice(0, 10);
          const code = normalizeAttendanceCode(dm?.code);
          if (!markDate || !code || !isValidAttendanceCode(code)) continue;

          const { data: existingMark, error: mErr } = await supabaseAdmin
            .from('attendance_day_marks')
            .select('*')
            .eq('row_id', row.id)
            .eq('mark_date', markDate)
            .maybeSingle();
          if (mErr) throw mErr;

          const beforeCode = existingMark?.code ?? null;
          dayMarkChanges.push({ markDate, before: beforeCode, after: code });

          if (existingMark) {
            const { error: uErr } = await supabaseAdmin
              .from('attendance_day_marks')
              .update({ code })
              .eq('id', existingMark.id);
            if (uErr) throw uErr;
          } else {
            const { error: cErr } = await supabaseAdmin
              .from('attendance_day_marks')
              .insert({ row_id: row.id, mark_date: markDate, code });
            if (cErr) throw cErr;
          }
        }
      }

      const rowUpdate = { updated_at: new Date().toISOString() };
      if (change.addon_incentive !== undefined) {
        const n = change.addon_incentive === null || change.addon_incentive === ''
          ? null
          : Number(change.addon_incentive);
        rowUpdate.addon_incentive = Number.isFinite(n) ? n : null;
      }
      if (change.remarks !== undefined) {
        const s = String(change.remarks ?? '').trim();
        rowUpdate.remarks = s || null;
      }

      let { data: allMarks, error: allErr } = await supabaseAdmin
        .from('attendance_day_marks')
        .select('mark_date, code')
        .eq('row_id', row.id);
      if (allErr) throw allErr;

      allMarks = await applyDefaultMarksForRow(
        row.id,
        allMarks ?? [],
        client_policy,
        monthYmVal
      );

      const ytdMap = row.employee_id
        ? await fetchYtdTakenByEmployee(clientId, year, monthYmVal, [row.employee_id])
        : new Map();
      const summary = await recalculateRowSummary({
        row,
        dayMarks: allMarks ?? [],
        policyBundle: client_policy,
        monthYm: monthYmVal,
        ytdTaken: ytdMap.get(row.employee_id) ?? mergeYtdTaken([])
      });

      Object.assign(rowUpdate, {
        paid_days: summary.paid_days,
        lop: summary.lop,
        not_considered: summary.not_considered,
        total_days: summary.total_days,
        legend_totals: summary.legend_totals,
        leave_summary: summary.leave_summary,
        incentive: summary.incentive
      });

      const { error: totErr } = await supabaseAdmin
        .from('attendance_rows')
        .update(rowUpdate)
        .eq('id', row.id);
      if (totErr) throw totErr;

      const fieldChanged =
        (change.addon_incentive !== undefined && beforeFields.addon_incentive !== rowUpdate.addon_incentive)
        || (change.remarks !== undefined && beforeFields.remarks !== rowUpdate.remarks);

      if (dayMarkChanges.length) {
        await writeLog({
          sheetId: sheet.id,
          rowId: row.id,
          action: 'CELL_CHANGE',
          actorUserId: req.user.id,
          actorRole: access.user.role,
          beforeJson: { day_marks: dayMarkChanges.map((c) => ({ mark_date: c.markDate, code: c.before })) },
          afterJson: { day_marks: dayMarkChanges.map((c) => ({ mark_date: c.markDate, code: c.after })) },
          message: buildDayMarkChangeMessage(row.emp_code, dayMarkChanges)
        });
      }
      if (fieldChanged) {
        await writeLog({
          sheetId: sheet.id,
          rowId: row.id,
          action: 'ROW_FIELD_CHANGE',
          actorUserId: req.user.id,
          actorRole: access.user.role,
          beforeJson: beforeFields,
          afterJson: {
            addon_incentive: rowUpdate.addon_incentive,
            remarks: rowUpdate.remarks
          },
          message: buildRowFieldChangeMessage(row.emp_code, beforeFields, rowUpdate)
        });
      }

      if (row.employee_id) affectedEmployeeIds.push(row.employee_id);
    }

    if (affectedEmployeeIds.length) {
      await recalculateForwardYtdForEmployees(clientId, monthYmVal, affectedEmployeeIds);
    }

    if (sheet.status === 'SUBMITTED') {
      await supabaseAdmin
        .from('attendance_sheets')
        .update({ status: 'DRAFT', updated_at: new Date().toISOString() })
        .eq('id', sheet.id);
    }

    const bundle = await fetchSheetBundle(sheet.id);
    const caps = buildCapabilities(bundle.sheet, access, bundle.grant_user_ids);
    const eligiblePms = await loadEligiblePms(access.client);
    res.json({
      ok: true,
      ...bundle,
      client: access.client,
      client_policy,
      role: access.user.role,
      eligible_pms: eligiblePms,
      ...caps
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

// PATCH day cell
router.patch('/:sheetId/rows/:rowId/days/:date', async (req, res, next) => {
  try {
    const clientId = req.params.clientId;
    const access = await resolveClientAccess(req, clientId);
    if (!access.ok) return res.status(access.status).json({ error: access.error });

    const code = normalizeAttendanceCode(req.body?.code);
    if (!code || !isValidAttendanceCode(code)) {
      return res.status(400).json({
        error: 'Invalid attendance code. Use NH/FH for holidays or P-NH/P-FH for present on holiday; OC is not allowed. A = Absent LOP.'
      });
    }

    const { data: sheet, error } = await supabaseAdmin
      .from('attendance_sheets')
      .select('*')
      .eq('id', req.params.sheetId)
      .eq('client_id', clientId)
      .maybeSingle();
    if (error) throw error;
    if (!sheet) return res.status(404).json({ error: 'Sheet not found' });
    const { data: grantsForPatch } = await supabaseAdmin
      .from('attendance_edit_grants')
      .select('user_id')
      .eq('sheet_id', sheet.id);
    assertCanEdit(
      sheet,
      access,
      (grantsForPatch ?? []).map((g) => g.user_id)
    );

    const markDate = String(req.params.date).slice(0, 10);

    const { data: row, error: rowErr } = await supabaseAdmin
      .from('attendance_rows')
      .select('*')
      .eq('id', req.params.rowId)
      .eq('sheet_id', sheet.id)
      .maybeSingle();
    if (rowErr) throw rowErr;
    if (!row) return res.status(404).json({ error: 'Row not found' });

    const { data: existingMark, error: mErr } = await supabaseAdmin
      .from('attendance_day_marks')
      .select('*')
      .eq('row_id', row.id)
      .eq('mark_date', markDate)
      .maybeSingle();
    if (mErr) throw mErr;

    const before = existingMark ? { code: existingMark.code, mark_date: markDate } : null;
    let dayMarkId = existingMark?.id;

    if (existingMark) {
      const { data: updated, error: uErr } = await supabaseAdmin
        .from('attendance_day_marks')
        .update({ code })
        .eq('id', existingMark.id)
        .select()
        .single();
      if (uErr) throw uErr;
      dayMarkId = updated.id;
    } else {
      const { data: created, error: cErr } = await supabaseAdmin
        .from('attendance_day_marks')
        .insert({ row_id: row.id, mark_date: markDate, code })
        .select()
        .single();
      if (cErr) throw cErr;
      dayMarkId = created.id;
    }

    let { data: allMarks, error: allErr } = await supabaseAdmin
      .from('attendance_day_marks')
      .select('mark_date, code')
      .eq('row_id', row.id);
    if (allErr) throw allErr;

    const monthYmVal = monthYm(sheet.attendance_month);
    const client_policy = await loadClientPolicyForResponse(clientId, monthYmVal);
    allMarks = await applyDefaultMarksForRow(
      row.id,
      allMarks ?? [],
      client_policy,
      monthYmVal
    );

    const year = Number(monthYmVal?.slice(0, 4)) || new Date().getFullYear();
    const ytdMap = row.employee_id
      ? await fetchYtdTakenByEmployee(clientId, year, monthYmVal, [row.employee_id])
      : new Map();
    const summary = await recalculateRowSummary({
      row,
      dayMarks: allMarks ?? [],
      policyBundle: client_policy,
      monthYm: monthYmVal,
      ytdTaken: ytdMap.get(row.employee_id) ?? mergeYtdTaken([])
    });

    const { error: totErr } = await supabaseAdmin
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
    if (totErr) throw totErr;

    await writeLog({
      sheetId: sheet.id,
      rowId: row.id,
      dayMarkId,
      action: 'CELL_CHANGE',
      actorUserId: req.user.id,
      actorRole: access.user.role,
      beforeJson: before,
      afterJson: { code, mark_date: markDate },
      message: `${row.emp_code} ${markDate}: ${before?.code ?? '(empty)'} → ${code}`
    });

    if (row.employee_id) {
      await recalculateForwardYtdForEmployees(clientId, monthYmVal, [row.employee_id]);
    }

    // reset to draft if was submitted
    if (sheet.status === 'SUBMITTED') {
      await supabaseAdmin
        .from('attendance_sheets')
        .update({ status: 'DRAFT', updated_at: new Date().toISOString() })
        .eq('id', sheet.id);
    }

    res.json({
      ok: true,
      row_id: row.id,
      code,
      mark_date: markDate,
      addon_incentive: row.addon_incentive,
      remarks: row.remarks,
      legend_totals: summary.legend_totals,
      paid_days: summary.paid_days,
      lop: summary.lop,
      not_considered: summary.not_considered,
      total_days: summary.total_days,
      leave_summary: summary.leave_summary,
      incentive: summary.incentive
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

// POST recompute all row summaries from client policy
router.post('/:sheetId/recompute', async (req, res, next) => {
  try {
    const clientId = req.params.clientId;
    const access = await resolveClientAccess(req, clientId);
    if (!access.ok) return res.status(access.status).json({ error: access.error });

    const { data: sheet, error } = await supabaseAdmin
      .from('attendance_sheets')
      .select('*')
      .eq('id', req.params.sheetId)
      .eq('client_id', clientId)
      .maybeSingle();
    if (error) throw error;
    if (!sheet) return res.status(404).json({ error: 'Sheet not found' });

    const { data: grants } = await supabaseAdmin
      .from('attendance_edit_grants')
      .select('user_id')
      .eq('sheet_id', sheet.id);
    assertCanEdit(sheet, access, (grants ?? []).map((g) => g.user_id));

    const bundle = await fetchSheetBundle(sheet.id);
    const { payrollMeta, defaultMarksApplied } = await recalculateSheetRows(bundle.sheet, bundle.rows, clientId);

    await supabaseAdmin
      .from('attendance_sheets')
      .update({
        payroll_cycle: payrollMeta.payroll_cycle,
        payroll_start_date: payrollMeta.payroll_start_date,
        payroll_end_date: payrollMeta.payroll_end_date,
        updated_at: new Date().toISOString()
      })
      .eq('id', sheet.id);

    const recomputeMessage = defaultMarksApplied > 0
      ? `Recalculated attendance summaries from client policy (${defaultMarksApplied} default week-off/holiday mark(s) applied)`
      : 'Recalculated attendance summaries from client policy';

    await writeLog({
      sheetId: sheet.id,
      action: 'RECOMPUTE',
      actorUserId: req.user.id,
      actorRole: access.user.role,
      message: recomputeMessage
    });

    const updated = await fetchSheetBundle(sheet.id);
    const caps = buildCapabilities(updated.sheet, access, updated.grant_user_ids);
    const client_policy = await loadClientPolicyForResponse(clientId);
    res.json({
      ok: true,
      ...updated,
      client: access.client,
      client_policy,
      role: access.user.role,
      ...caps
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

// Submit / resubmit
router.post('/:sheetId/submit', async (req, res, next) => {
  try {
    const clientId = req.params.clientId;
    const access = await resolveClientAccess(req, clientId);
    if (!access.ok) return res.status(access.status).json({ error: access.error });

    const { data: sheet, error } = await supabaseAdmin
      .from('attendance_sheets')
      .select('*')
      .eq('id', req.params.sheetId)
      .eq('client_id', clientId)
      .maybeSingle();
    if (error) throw error;
    if (!sheet) return res.status(404).json({ error: 'Sheet not found' });
    const { data: grantsForSubmit } = await supabaseAdmin
      .from('attendance_edit_grants')
      .select('user_id')
      .eq('sheet_id', sheet.id);
    assertCanEdit(
      sheet,
      access,
      (grantsForSubmit ?? []).map((g) => g.user_id)
    );

    const wasSubmitted = sheet.status === 'SUBMITTED';
    const now = new Date().toISOString();
    const { data: updated, error: upErr } = await supabaseAdmin
      .from('attendance_sheets')
      .update({
        status: 'SUBMITTED',
        submitted_at: now,
        submitted_by: req.user.id,
        updated_at: now
      })
      .eq('id', sheet.id)
      .select()
      .single();
    if (upErr) throw upErr;

    const action = wasSubmitted ? 'RESUBMIT' : 'SUBMIT';
    await writeLog({
      sheetId: sheet.id,
      action: sheet.ever_locked && !wasSubmitted ? 'RESUBMIT' : action,
      actorUserId: req.user.id,
      actorRole: access.user.role,
      message:
        wasSubmitted || sheet.ever_locked
          ? 'Attendance resubmitted'
          : 'Attendance submitted'
    });

    // Email PL when submit/resubmit after prior lock (PM actor)
    if (sheet.ever_locked && access.isPm) {
      const { data: pl } = await supabaseAdmin
        .from('users')
        .select('id, name, email')
        .eq('id', access.client.created_by)
        .maybeSingle();
      if (pl?.email) {
        const link = attendanceLink(clientId, 'PAYROLL_LEAD');
        await invokeAttendanceEmail({
          toEmail: pl.email,
          toName: pl.name,
          subject: `Attendance resubmitted — ${access.client.client_name}`,
          html: `<p>Hi ${pl.name || 'there'},</p><p>${access.user.name || 'Program Manager'} resubmitted attendance for <strong>${access.client.client_name}</strong> after unlock.</p><p><a href="${link}">Open attendance</a></p>`,
          text: `Attendance resubmitted for ${access.client.client_name}. Open: ${link}`
        });
      }
    }

    res.json({ sheet: updated });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

// Lock — PL only
router.post('/:sheetId/lock', async (req, res, next) => {
  try {
    const clientId = req.params.clientId;
    const access = await resolveClientAccess(req, clientId);
    if (!access.ok) return res.status(access.status).json({ error: access.error });
    if (!access.isPl) return res.status(403).json({ error: 'Only Payroll Lead can lock attendance.' });

    const { data: sheet, error } = await supabaseAdmin
      .from('attendance_sheets')
      .select('*')
      .eq('id', req.params.sheetId)
      .eq('client_id', clientId)
      .maybeSingle();
    if (error) throw error;
    if (!sheet) return res.status(404).json({ error: 'Sheet not found' });
    if (sheet.locked) return res.status(400).json({ error: 'Sheet is already locked.' });

    const now = new Date().toISOString();
    await clearEditGrants(sheet.id);
    const { data: updated, error: upErr } = await supabaseAdmin
      .from('attendance_sheets')
      .update({
        status: 'SUBMITTED',
        locked: true,
        locked_at: now,
        locked_by: req.user.id,
        ever_locked: true,
        edit_scope: 'NONE',
        unlock_request_status: 'NONE',
        unlock_requested_at: null,
        unlock_requested_by: null,
        updated_at: now
      })
      .eq('id', sheet.id)
      .select()
      .single();
    if (upErr) throw upErr;

    await writeLog({
      sheetId: sheet.id,
      action: 'LOCK',
      actorUserId: req.user.id,
      actorRole: access.user.role,
      message: 'Attendance locked by Payroll Lead; edit grants cleared'
    });

    res.json({ sheet: updated });
  } catch (err) {
    next(err);
  }
});

// Request edit — PM only
router.post('/:sheetId/request-edit', async (req, res, next) => {
  try {
    const clientId = req.params.clientId;
    const access = await resolveClientAccess(req, clientId);
    if (!access.ok) return res.status(access.status).json({ error: access.error });
    if (!access.isPm) {
      return res.status(403).json({ error: 'Only Program Manager can request edit access.' });
    }

    const { data: sheet, error } = await supabaseAdmin
      .from('attendance_sheets')
      .select('*')
      .eq('id', req.params.sheetId)
      .eq('client_id', clientId)
      .maybeSingle();
    if (error) throw error;
    if (!sheet) return res.status(404).json({ error: 'Sheet not found' });
    if (!sheet.locked) return res.status(400).json({ error: 'Sheet is not locked.' });
    if (sheet.unlock_request_status === 'PENDING') {
      return res.status(400).json({ error: 'Edit access request is already pending.' });
    }

    const now = new Date().toISOString();
    const { data: updated, error: upErr } = await supabaseAdmin
      .from('attendance_sheets')
      .update({
        unlock_request_status: 'PENDING',
        unlock_requested_at: now,
        unlock_requested_by: req.user.id,
        updated_at: now
      })
      .eq('id', sheet.id)
      .select()
      .single();
    if (upErr) throw upErr;

    await writeLog({
      sheetId: sheet.id,
      action: 'REQUEST_EDIT',
      actorUserId: req.user.id,
      actorRole: access.user.role,
      message: 'PM requested edit access'
    });

    const { data: pl } = await supabaseAdmin
      .from('users')
      .select('id, name, email')
      .eq('id', access.client.created_by)
      .maybeSingle();
    if (pl?.email) {
      const link = attendanceLink(clientId, 'PAYROLL_LEAD');
      await invokeAttendanceEmail({
        toEmail: pl.email,
        toName: pl.name,
        subject: `Edit access requested — ${access.client.client_name} attendance`,
        html: `<p>Hi ${pl.name || 'there'},</p><p>${access.user.name || 'Program Manager'} requested edit access for locked attendance on <strong>${access.client.client_name}</strong>.</p><p><a href="${link}">Review and unlock</a></p>`,
        text: `Edit access requested for ${access.client.client_name}. Open: ${link}`
      });
    }

    res.json({ sheet: updated });
  } catch (err) {
    next(err);
  }
});

// Unlock — PL only, scoped
router.post('/:sheetId/unlock', async (req, res, next) => {
  try {
    const clientId = req.params.clientId;
    const access = await resolveClientAccess(req, clientId);
    if (!access.ok) return res.status(access.status).json({ error: access.error });
    if (!access.isPl) return res.status(403).json({ error: 'Only Payroll Lead can unlock attendance.' });

    const rawScope = String(req.body?.scope ?? '').trim().toUpperCase();
    const scopeMap = {
      PL_ONLY: 'PL_ONLY',
      ONLY_ME: 'PL_ONLY',
      ALL_PMS: 'ALL_PMS',
      EVERYONE: 'ALL_PMS',
      SHARED: 'SHARED',
      SHARE: 'SHARED'
    };
    const editScope = scopeMap[rawScope];
    if (!editScope) {
      return res.status(400).json({
        error: 'scope is required: PL_ONLY | ALL_PMS | SHARED'
      });
    }

    const { data: sheet, error } = await supabaseAdmin
      .from('attendance_sheets')
      .select('*')
      .eq('id', req.params.sheetId)
      .eq('client_id', clientId)
      .maybeSingle();
    if (error) throw error;
    if (!sheet) return res.status(404).json({ error: 'Sheet not found' });
    if (!sheet.locked || sheetEditScope(sheet) !== 'NONE') {
      return res.status(400).json({ error: 'Sheet is not fully locked.' });
    }

    const eligible = await loadEligiblePms(access.client);
    const eligibleIds = new Set(eligible.map((p) => p.id));
    let grantIds = [];

    if (editScope === 'SHARED') {
      const incoming = Array.isArray(req.body?.user_ids)
        ? req.body.user_ids
        : Array.isArray(req.body?.userIds)
          ? req.body.userIds
          : [];
      grantIds = [...new Set(incoming.map((id) => String(id || '').trim()).filter(Boolean))];
      if (!grantIds.length) {
        return res.status(400).json({ error: 'user_ids required for SHARED unlock.' });
      }
      for (const id of grantIds) {
        if (!eligibleIds.has(id)) {
          return res.status(400).json({
            error: 'One or more selected users are not Program Managers for this client.'
          });
        }
      }
    } else if (editScope === 'ALL_PMS') {
      grantIds = [...eligibleIds];
    }

    const now = new Date().toISOString();
    await clearEditGrants(sheet.id);

    if (editScope === 'SHARED' && grantIds.length) {
      const { error: gInsErr } = await supabaseAdmin.from('attendance_edit_grants').insert(
        grantIds.map((user_id) => ({ sheet_id: sheet.id, user_id }))
      );
      if (gInsErr) throw gInsErr;
    }

    const { data: updated, error: upErr } = await supabaseAdmin
      .from('attendance_sheets')
      .update({
        status: 'DRAFT',
        locked: false,
        locked_at: null,
        locked_by: null,
        edit_scope: editScope,
        unlock_request_status: 'GRANTED',
        updated_at: now
      })
      .eq('id', sheet.id)
      .select()
      .single();
    if (upErr) throw upErr;

    await writeLog({
      sheetId: sheet.id,
      action: 'UNLOCK',
      actorUserId: req.user.id,
      actorRole: access.user.role,
      afterJson: { edit_scope: editScope, user_ids: grantIds },
      message: `Attendance unlocked (${editScope}) by Payroll Lead`
    });

    // Email PM(s) when they receive edit access
    if (editScope === 'ALL_PMS' || editScope === 'SHARED') {
      const notifyIds =
        editScope === 'ALL_PMS'
          ? [...eligibleIds]
          : grantIds;
      if (notifyIds.length) {
        const { data: pms } = await supabaseAdmin
          .from('users')
          .select('id, name, email')
          .in('id', notifyIds);
        const link = attendanceLink(clientId, 'PROGRAM_MANAGER');
        for (const pm of pms ?? []) {
          if (!pm?.email) continue;
          await invokeAttendanceEmail({
            toEmail: pm.email,
            toName: pm.name,
            subject: `Edit access granted — ${access.client.client_name} attendance`,
            html: `<p>Hi ${pm.name || 'there'},</p><p>Payroll Lead granted you edit access for attendance on <strong>${access.client.client_name}</strong>. You can edit and resubmit.</p><p><a href="${link}">Open attendance</a></p>`,
            text: `Edit access granted for ${access.client.client_name}. Open: ${link}`
          });
        }
      }
    }

    const bundle = await fetchSheetBundle(sheet.id);
    const caps = buildCapabilities(updated, access, bundle.grant_user_ids);
    res.json({ sheet: updated, grant_user_ids: bundle.grant_user_ids, ...caps });
  } catch (err) {
    next(err);
  }
});

export default router;
