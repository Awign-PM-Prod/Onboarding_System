import { Router } from 'express';
import multer from 'multer';
import { supabaseAdmin } from '../supabase.js';
import { parseAmsAttendanceCsv } from '../utils/amsAttendanceParser.js';
import {
  computeLegendTotals,
  isValidAttendanceCode,
  normalizeAttendanceCode
} from '../utils/attendanceLegend.js';

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

  return {
    sheet,
    rows: (rows ?? []).map((r) => ({
      ...r,
      day_marks: (marksByRow.get(r.id) ?? []).map((m) => ({
        ...m,
        mark_date: String(m.mark_date ?? '').slice(0, 10)
      }))
    }))
  };
}

function assertUnlocked(sheet) {
  if (sheet?.locked) {
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
      return res.json({
        sheet: null,
        rows: [],
        client: access.client,
        role: access.user.role,
        can_edit: true,
        can_lock: access.isPl,
        can_unlock: access.isPl,
        can_request_edit: access.isPm
      });
    }

    const bundle = await fetchSheetBundle(sheet.id);
    const locked = Boolean(bundle.sheet.locked);
    res.json({
      ...bundle,
      client: access.client,
      role: access.user.role,
      can_edit: !locked,
      can_lock: access.isPl && !locked,
      can_unlock: access.isPl && locked,
      can_request_edit: access.isPm && locked
    });
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
    if (existing?.locked) {
      return res.status(423).json({ error: 'Attendance sheet is locked. Unlock it before uploading.' });
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
      remarks: row.remarks
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

    await writeLog({
      sheetId,
      action: 'UPLOAD',
      actorUserId: req.user.id,
      actorRole: access.user.role,
      afterJson: {
        imported: matched.length,
        skipped: skipped.length,
        day_marks: dayMarkPayloads.length,
        filename: req.file.originalname
      },
      message: `Uploaded ${matched.length} rows`
    });

    const bundle = await fetchSheetBundle(sheetId);
    res.status(skipped.length || allErrors.length ? 207 : 200).json({
      imported: matched.length,
      skipped: skipped.length,
      errors: [...allErrors, ...skipped],
      ...bundle,
      client: access.client,
      role: access.user.role,
      can_edit: !bundle.sheet.locked,
      can_lock: access.isPl && !bundle.sheet.locked,
      can_unlock: access.isPl && bundle.sheet.locked,
      can_request_edit: access.isPm && bundle.sheet.locked
    });
  } catch (err) {
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
        error: 'Invalid attendance code. Use NH/FH for holidays; OC is not allowed. A = Absent LOP.'
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
    assertUnlocked(sheet);

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

    const { data: allMarks, error: allErr } = await supabaseAdmin
      .from('attendance_day_marks')
      .select('code')
      .eq('row_id', row.id);
    if (allErr) throw allErr;
    const legend_totals = computeLegendTotals((allMarks ?? []).map((m) => m.code));

    const { error: totErr } = await supabaseAdmin
      .from('attendance_rows')
      .update({ legend_totals, updated_at: new Date().toISOString() })
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

    // reset to draft if was submitted
    if (sheet.status === 'SUBMITTED') {
      await supabaseAdmin
        .from('attendance_sheets')
        .update({ status: 'DRAFT', updated_at: new Date().toISOString() })
        .eq('id', sheet.id);
    }

    res.json({ ok: true, code, mark_date: markDate, legend_totals });
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
    assertUnlocked(sheet);

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
    const { data: updated, error: upErr } = await supabaseAdmin
      .from('attendance_sheets')
      .update({
        locked: true,
        locked_at: now,
        locked_by: req.user.id,
        ever_locked: true,
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
      message: 'Attendance locked by Payroll Lead'
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

// Unlock — PL only
router.post('/:sheetId/unlock', async (req, res, next) => {
  try {
    const clientId = req.params.clientId;
    const access = await resolveClientAccess(req, clientId);
    if (!access.ok) return res.status(access.status).json({ error: access.error });
    if (!access.isPl) return res.status(403).json({ error: 'Only Payroll Lead can unlock attendance.' });

    const { data: sheet, error } = await supabaseAdmin
      .from('attendance_sheets')
      .select('*')
      .eq('id', req.params.sheetId)
      .eq('client_id', clientId)
      .maybeSingle();
    if (error) throw error;
    if (!sheet) return res.status(404).json({ error: 'Sheet not found' });
    if (!sheet.locked) return res.status(400).json({ error: 'Sheet is not locked.' });

    const now = new Date().toISOString();
    const requestorId = sheet.unlock_requested_by || access.client.program_manager_id;

    const { data: updated, error: upErr } = await supabaseAdmin
      .from('attendance_sheets')
      .update({
        locked: false,
        locked_at: null,
        locked_by: null,
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
      message: 'Attendance unlocked by Payroll Lead'
    });

    if (requestorId) {
      const { data: pm } = await supabaseAdmin
        .from('users')
        .select('id, name, email')
        .eq('id', requestorId)
        .maybeSingle();
      if (pm?.email) {
        const link = attendanceLink(clientId, 'PROGRAM_MANAGER');
        await invokeAttendanceEmail({
          toEmail: pm.email,
          toName: pm.name,
          subject: `Edit access granted — ${access.client.client_name} attendance`,
          html: `<p>Hi ${pm.name || 'there'},</p><p>Payroll Lead unlocked attendance for <strong>${access.client.client_name}</strong>. You can edit and resubmit.</p><p><a href="${link}">Open attendance</a></p>`,
          text: `Edit access granted for ${access.client.client_name}. Open: ${link}`
        });
      }
    }

    res.json({ sheet: updated });
  } catch (err) {
    next(err);
  }
});

export default router;
