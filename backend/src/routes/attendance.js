import { Router } from 'express';
import multer from 'multer';
import { supabaseAdmin } from '../supabase.js';
import { parseAmsAttendanceCsv, normalizeEmployeeStatus } from '../utils/amsAttendanceParser.js';
import { parseIncentiveBulkCsv } from '../utils/incentiveBulkParser.js';
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
import {
  applyLwdToDayMarks,
  exitCodeFromStatus,
  formatLwdSkipMessage,
  isAfterLwd,
  isExitCode,
  isExitStatus,
  isLwdBeforeSheetMonth,
  isLwdDate,
  isLwdInMonth,
  parseIsoDate,
  statusFromExitCode
} from '../utils/attendanceLwd.js';
import { getPayrollPeriod, payrollCycleLabel } from '../utils/clientPolicy.js';
import { logOrgActivityFromReq } from '../utils/orgActivityLog.js';
import {
  buildAttendanceExportCsv,
  exportFilename
} from '../utils/attendanceExport.js';
import { canAccessClientAsLead, loadUserRole } from '../utils/roleAccess.js';
import { invokeResendEmail } from '../utils/sendEmail.js';

const router = Router({ mergeParams: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

const FRONTEND_URL = String(process.env.FRONTEND_URL || 'http://localhost:8088').trim() || 'http://localhost:8088';

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
  const isPl = canAccessClientAsLead(user, client);
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

function formatMarkDate(markDate) {
  const raw = String(markDate ?? '').slice(0, 10);
  const [y, m, d] = raw.split('-').map(Number);
  if (!y || !m || !d) return raw || '—';
  try {
    return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  } catch {
    return raw;
  }
}

function buildDayMarkChangeMessage(empCode, changes, maxLen = 500) {
  const parts = changes.map(({ markDate, before, after }) =>
    `${formatMarkDate(markDate)}: ${formatMarkLabel(before)} to ${formatMarkLabel(after)}`
  );
  let message = `Emp ${empCode} · ${parts.join('; ')}`;
  if (message.length > maxLen) {
    const kept = [];
    let len = `Emp ${empCode} · `.length;
    for (const part of parts) {
      const next = kept.length ? `; ${part}` : part;
      if (len + next.length + 12 > maxLen) break;
      kept.push(part);
      len += next.length;
    }
    const remaining = parts.length - kept.length;
    message = `Emp ${empCode} · ${kept.join('; ')}${remaining > 0 ? `; …and ${remaining} more` : ''}`;
  }
  return message;
}

function buildRowFieldChangeMessage(empCode, beforeFields, rowUpdate) {
  const parts = [];
  if (beforeFields.lwd !== rowUpdate.lwd && ('lwd' in rowUpdate)) {
    parts.push(`LWD ${formatMarkLabel(beforeFields.lwd)}→${formatMarkLabel(rowUpdate.lwd)}`);
  }
  if (beforeFields.status_label !== rowUpdate.status_label) {
    parts.push(
      `status ${formatMarkLabel(beforeFields.status_label)}→${formatMarkLabel(rowUpdate.status_label)}`
    );
  }
  if (beforeFields.addon_incentive !== rowUpdate.addon_incentive) {
    parts.push(`addon incentive ${formatMarkLabel(beforeFields.addon_incentive)}→${formatMarkLabel(rowUpdate.addon_incentive)}`);
  }
  if (beforeFields.arrear_days !== rowUpdate.arrear_days) {
    parts.push(`arrear days ${formatMarkLabel(beforeFields.arrear_days)}→${formatMarkLabel(rowUpdate.arrear_days)}`);
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

async function fetchExitedEmployeesBeforeMonth(clientId, monthDate) {
  const start = parseIsoDate(monthDate) || (String(monthDate ?? '').slice(0, 7) ? `${String(monthDate).slice(0, 7)}-01` : null);
  const map = new Map();
  if (!start) return map;

  const { data: sheets, error: sErr } = await supabaseAdmin
    .from('attendance_sheets')
    .select('id')
    .eq('client_id', clientId)
    .lt('attendance_month', start);
  if (sErr) throw sErr;
  const sheetIds = (sheets ?? []).map((s) => s.id);
  if (!sheetIds.length) return map;

  const { data: rows, error: rErr } = await supabaseAdmin
    .from('attendance_rows')
    .select('emp_code, employee_name_snapshot, lwd, status_label')
    .in('sheet_id', sheetIds)
    .not('lwd', 'is', null)
    .lt('lwd', start);
  if (rErr) throw rErr;

  for (const row of rows ?? []) {
    const code = String(row.emp_code ?? '').trim();
    const lwd = parseIsoDate(row.lwd);
    if (!code || !lwd) continue;
    const existing = map.get(code);
    if (!existing || lwd > existing.lwd) {
      map.set(code, {
        emp_code: code,
        employee_name: row.employee_name_snapshot ?? null,
        lwd,
        status_label: row.status_label ?? null
      });
    }
  }
  return map;
}

async function deleteEmpCodesFromSheet(sheetId, empCodes) {
  const codes = [
    ...new Set((empCodes ?? []).map((c) => String(c ?? '').trim()).filter(Boolean))
  ];
  if (!sheetId || !codes.length) return [];

  const removed = [];
  const DELETE_CHUNK = 200;
  for (let i = 0; i < codes.length; i += DELETE_CHUNK) {
    const chunk = codes.slice(i, i + DELETE_CHUNK);
    const { data, error } = await supabaseAdmin
      .from('attendance_rows')
      .delete()
      .eq('sheet_id', sheetId)
      .in('emp_code', chunk)
      .select('id, emp_code, employee_name_snapshot, lwd, status_label');
    if (error) throw error;
    removed.push(...(data ?? []));
  }
  return removed;
}

/**
 * After LWD is set on an earlier month, drop that emp from unlocked later-month sheets.
 */
async function removeEmployeesFromLaterSheets({
  clientId,
  exits,
  actorUserId = null,
  actorRole = null
}) {
  const byCode = new Map();
  for (const e of exits ?? []) {
    const code = String(e?.emp_code ?? '').trim();
    const lwd = parseIsoDate(e?.lwd);
    if (!code || !lwd) continue;
    const prev = byCode.get(code);
    if (!prev || lwd > prev.lwd) {
      byCode.set(code, {
        emp_code: code,
        lwd,
        status_label: e.status_label ?? null
      });
    }
  }
  if (!byCode.size) return { sheetsTouched: 0, removedCount: 0 };

  const earliestLwd = [...byCode.values()].reduce(
    (min, e) => (e.lwd < min ? e.lwd : min),
    '9999-12-31'
  );

  const { data: sheets, error } = await supabaseAdmin
    .from('attendance_sheets')
    .select('id, attendance_month, locked')
    .eq('client_id', clientId)
    .gt('attendance_month', earliestLwd)
    .eq('locked', false);
  if (error) throw error;

  let sheetsTouched = 0;
  let removedCount = 0;
  for (const sheet of sheets ?? []) {
    const codesToRemove = [...byCode.values()]
      .filter((exit) => isLwdBeforeSheetMonth(exit.lwd, sheet.attendance_month))
      .map((exit) => exit.emp_code);
    if (!codesToRemove.length) continue;

    const removed = await deleteEmpCodesFromSheet(sheet.id, codesToRemove);
    if (!removed.length) continue;
    sheetsTouched += 1;
    removedCount += removed.length;

    if (actorUserId) {
      await writeLog({
        sheetId: sheet.id,
        action: 'ROW_FIELD_CHANGE',
        actorUserId,
        actorRole,
        beforeJson: { removed_rows: removed },
        afterJson: null,
        message: removed
          .map((r) => {
            const exit = byCode.get(String(r.emp_code).trim());
            return `${r.emp_code}: ${formatLwdSkipMessage(
              exit?.lwd || r.lwd,
              exit?.status_label || r.status_label
            )}`;
          })
          .join('; ')
      });
    }
  }
  return { sheetsTouched, removedCount };
}

/**
 * Drop rows that exited before this sheet month (prior-sheet LWD or stale row LWD).
 * Skips locked sheets.
 */
async function pruneExitedEmployeesFromSheet({
  clientId,
  sheet,
  actorUserId = null,
  actorRole = null
}) {
  if (!sheet?.id || sheet.locked) return { removedCount: 0 };

  const exited = await fetchExitedEmployeesBeforeMonth(clientId, sheet.attendance_month);
  const { data: rows, error } = await supabaseAdmin
    .from('attendance_rows')
    .select('id, emp_code, lwd, status_label, employee_name_snapshot')
    .eq('sheet_id', sheet.id);
  if (error) throw error;

  const codesToRemove = [];
  const reasonByCode = new Map();
  for (const row of rows ?? []) {
    const code = String(row.emp_code ?? '').trim();
    if (!code) continue;
    const prior = exited.get(code);
    if (prior) {
      codesToRemove.push(code);
      reasonByCode.set(code, prior);
      continue;
    }
    if (isLwdBeforeSheetMonth(row.lwd, sheet.attendance_month)) {
      codesToRemove.push(code);
      reasonByCode.set(code, {
        lwd: parseIsoDate(row.lwd),
        status_label: row.status_label ?? null
      });
    }
  }
  if (!codesToRemove.length) return { removedCount: 0 };

  const removed = await deleteEmpCodesFromSheet(sheet.id, codesToRemove);
  if (removed.length && actorUserId) {
    await writeLog({
      sheetId: sheet.id,
      action: 'ROW_FIELD_CHANGE',
      actorUserId,
      actorRole,
      beforeJson: { removed_rows: removed },
      afterJson: null,
      message: removed
        .map((r) => {
          const reason = reasonByCode.get(String(r.emp_code).trim());
          return `${r.emp_code}: ${formatLwdSkipMessage(
            reason?.lwd || r.lwd,
            reason?.status_label || r.status_label
          )}`;
        })
        .join('; ')
    });
  }
  return { removedCount: removed.length };
}

async function listMissingEmployeesForSheet(clientId, sheetId) {
  const { data: allClientEmployees, error: allEmpErr } = await supabaseAdmin
    .from('employees')
    .select('emp_code, name')
    .eq('client_id', clientId)
    .not('emp_code', 'is', null);
  if (allEmpErr) throw allEmpErr;
  const { data: sheetMeta, error: sheetErr } = await supabaseAdmin
    .from('attendance_sheets')
    .select('attendance_month')
    .eq('id', sheetId)
    .maybeSingle();
  if (sheetErr) throw sheetErr;
  const exited = await fetchExitedEmployeesBeforeMonth(clientId, sheetMeta?.attendance_month);
  const { data: sheetRowCodes, error: rowCodeErr } = await supabaseAdmin
    .from('attendance_rows')
    .select('emp_code')
    .eq('sheet_id', sheetId);
  if (rowCodeErr) throw rowCodeErr;
  const sheetCodeSet = new Set(
    (sheetRowCodes ?? []).map((r) => String(r.emp_code ?? '').trim()).filter(Boolean)
  );
  return (allClientEmployees ?? [])
    .filter((e) => {
      const code = String(e.emp_code ?? '').trim();
      return code && !sheetCodeSet.has(code) && !exited.has(code);
    })
    .map((e) => ({ emp_code: e.emp_code, employee_name: e.name ?? null }));
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
  return invokeResendEmail({
    toEmail,
    toName,
    subject,
    html,
    text,
    logLabel: 'attendance-email'
  });
}

function attendanceLink(clientId, role) {
  const base = FRONTEND_URL.replace(/\/+$/, '');
  if (role === 'SUPER_ADMIN') {
    return `${base}/super-admin/client/${clientId}/attendance`;
  }
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

    await pruneExitedEmployeesFromSheet({
      clientId,
      sheet,
      actorUserId: req.user.id,
      actorRole: access.user.role
    });

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

    // One sample employee only — template is a format reference, not a full roster.
    const exited = await fetchExitedEmployeesBeforeMonth(clientId, monthDate);
    const { data: employees, error: empErr } = await supabaseAdmin
      .from('employees')
      .select('id, emp_code, name, mobile, designation, date_of_joining, ctc_type')
      .eq('client_id', clientId)
      .not('emp_code', 'is', null)
      .order('name', { ascending: true })
      .limit(50);
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

    const sampleEmp = (employees ?? []).find((e) => {
      const code = String(e.emp_code ?? '').trim();
      return code && !exited.has(code);
    }) ?? null;
    const rows = [
      sampleEmp
        ? {
            emp_code: String(sampleEmp.emp_code ?? '').trim(),
            employee_name_snapshot: sampleEmp.name ?? '',
            mobile: sampleEmp.mobile ?? '',
            designation: sampleEmp.designation ?? '',
            doj: sampleEmp.date_of_joining ?? null,
            amt_type: String(sampleEmp.ctc_type ?? '').trim() || 'MONTHLY',
            day_marks: [],
            legend_totals: {},
            leave_summary: {}
          }
        : {
            emp_code: '',
            employee_name_snapshot: '',
            mobile: '',
            designation: '',
            doj: null,
            amt_type: '',
            day_marks: [],
            legend_totals: {},
            leave_summary: {}
          }
    ];

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
    const exited = await fetchExitedEmployeesBeforeMonth(clientId, attendanceMonth);

    const matched = [];
    const skipped = [];
    const allErrors = [...(errorsToUse ?? [])];

    for (const row of rowsToUse) {
      const emp = empByCode.get(row.emp_code);
      if (!emp) {
        skipped.push({
          emp_code: row.emp_code,
          employee_name: row.employee_name_snapshot ?? null,
          error: 'No matching employee emp_code on this client'
        });
        continue;
      }
      const priorExit = exited.get(row.emp_code);
      if (priorExit || isLwdBeforeSheetMonth(row.lwd, attendanceMonth)) {
        const lwd = priorExit?.lwd || row.lwd;
        const status = priorExit?.status_label || row.status_label;
        skipped.push({
          emp_code: row.emp_code,
          employee_name: row.employee_name_snapshot ?? emp.name ?? null,
          error: formatLwdSkipMessage(lwd, status)
        });
        continue;
      }
      matched.push({ ...row, employee_id: emp.id });
    }

    if (matched.length === 0) {
      return res.status(400).json({
        error:
          skipped.length > 0
            ? 'No employees from this CSV were added to the sheet.'
            : 'No CSV rows matched employees on this client. Ensure emp_code values exist (e.g. T016394). Sheet was not changed.',
        details: [...(errorsToUse ?? []), ...skipped]
      });
    }

    const now = new Date().toISOString();
    let sheetId = existing?.id;

    if (existing) {
      // Merge: replace only rows for emp_codes present in this CSV; keep rows from
      // earlier uploads so delayed client submissions can be added file by file.
      const matchedCodes = [...new Set(matched.map((r) => r.emp_code))];
      const lwdSkipCodes = [...new Set(
        skipped
          .filter((s) => /not included after LWD month/i.test(String(s.error ?? '')))
          .map((s) => s.emp_code)
          .filter(Boolean)
      )];
      const deleteCodes = [...new Set([...matchedCodes, ...lwdSkipCodes])];
      const DELETE_CHUNK = 200;
      for (let i = 0; i < deleteCodes.length; i += DELETE_CHUNK) {
        const { error: delErr } = await supabaseAdmin
          .from('attendance_rows')
          .delete()
          .eq('sheet_id', existing.id)
          .in('emp_code', deleteCodes.slice(i, i + DELETE_CHUNK));
        if (delErr) throw delErr;
      }

      const { data: updated, error: upErr } = await supabaseAdmin
        .from('attendance_sheets')
        .update({
          status: 'DRAFT',
          contract_code: metaToUse?.contract_code ?? existing.contract_code,
          entity: metaToUse?.entity ?? existing.entity,
          cycle_type: metaToUse?.cycle_type ?? existing.cycle_type,
          payroll_cycle: metaToUse?.payroll_cycle ?? existing.payroll_cycle,
          payroll_start_date: metaToUse?.payroll_start_date ?? existing.payroll_start_date,
          payroll_end_date: metaToUse?.payroll_end_date ?? existing.payroll_end_date,
          salary_payout_date: metaToUse?.salary_payout_date ?? existing.salary_payout_date,
          project_manager_name: metaToUse?.project_manager_name ?? existing.project_manager_name,
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
      addon_incentive: row.addon_incentive,
      arrear_days: row.arrear_days
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

    const lwdExitsFromUpload = matched
      .filter((row) => parseIsoDate(row.lwd))
      .map((row) => ({
        emp_code: row.emp_code,
        lwd: row.lwd,
        status_label: row.status_label
      }));
    if (lwdExitsFromUpload.length) {
      await removeEmployeesFromLaterSheets({
        clientId,
        exits: lwdExitsFromUpload,
        actorUserId: req.user.id,
        actorRole: access.user.role
      });
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

    // Employees on this client (with an emp_code) that still have no row on the
    // sheet after this upload — i.e. missing from the uploaded CSV data.
    const missingFromCsv = await listMissingEmployeesForSheet(clientId, sheetId);

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
        missing_from_csv: missingFromCsv.length,
        day_marks: dayMarkPayloads.length,
        default_marks_applied: defaultMarksApplied,
        filename: req.file.originalname
      },
      message: uploadMessage
    });

    await logOrgActivityFromReq(req, {
      action: 'ATTENDANCE_UPLOAD',
      entityType: 'attendance_sheet',
      entityId: sheetId,
      clientId,
      summary: `Attendance upload for ${access.client?.client_name || clientId}: ${uploadMessage}`,
      metadata: { imported: matched.length, sheet_id: sheetId }
    });

    const bundle = await fetchSheetBundle(sheetId);
    const caps = buildCapabilities(bundle.sheet, access, bundle.grant_user_ids);
    const eligiblePms = await loadEligiblePms(access.client);
    const client_policy = await loadClientPolicyForResponse(clientId);
    res.status(skipped.length || allErrors.length || missingFromCsv.length ? 207 : 200).json({
      imported: matched.length,
      skipped: skipped.length,
      errors: [...allErrors, ...skipped],
      missing_from_csv: missingFromCsv,
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

// POST upload incentives (add-on) CSV into an existing sheet
router.post('/:sheetId/upload-incentives', upload.single('file'), async (req, res, next) => {
  try {
    const clientId = req.params.clientId;
    const access = await resolveClientAccess(req, clientId);
    if (!access.ok) return res.status(access.status).json({ error: access.error });

    if (!req.file?.buffer) {
      return res.status(400).json({ error: 'CSV file is required' });
    }

    const { data: sheet, error } = await supabaseAdmin
      .from('attendance_sheets')
      .select('*')
      .eq('id', req.params.sheetId)
      .eq('client_id', clientId)
      .maybeSingle();
    if (error) throw error;
    if (!sheet) return res.status(404).json({ error: 'Sheet not found' });

    const { data: grantsForUpload } = await supabaseAdmin
      .from('attendance_edit_grants')
      .select('user_id')
      .eq('sheet_id', sheet.id);
    assertCanEdit(
      sheet,
      access,
      (grantsForUpload ?? []).map((g) => g.user_id)
    );

    const text = req.file.buffer.toString('utf8');
    const { rows: parsedRows, errors: parseErrors } = parseIncentiveBulkCsv(text);
    if (!parsedRows.length) {
      return res.status(400).json({
        error: parseErrors.length
          ? 'Could not parse incentives CSV'
          : 'No incentive rows found. Include Emp Code and Add-on Incentive columns.',
        details: parseErrors
      });
    }

    const { data: sheetRows, error: rowsErr } = await supabaseAdmin
      .from('attendance_rows')
      .select('id, emp_code, employee_name_snapshot, addon_incentive, remarks')
      .eq('sheet_id', sheet.id);
    if (rowsErr) throw rowsErr;

    const rowByCode = new Map(
      (sheetRows ?? []).map((r) => [String(r.emp_code ?? '').trim().toLowerCase(), r])
    );

    let updated = 0;
    const skipped = [];
    const allErrors = [...(parseErrors ?? [])];

    for (const item of parsedRows) {
      const codeKey = String(item.emp_code ?? '').trim().toLowerCase();
      const existing = rowByCode.get(codeKey);
      if (!existing) {
        skipped.push({
          emp_code: item.emp_code,
          employee_name: item.employee_name,
          error: 'Emp Code not found on this attendance sheet'
        });
        continue;
      }

      const rowUpdate = {
        addon_incentive: item.addon_incentive,
        updated_at: new Date().toISOString()
      };
      if (item.remarks !== undefined) {
        rowUpdate.remarks = item.remarks;
      }

      const beforeFields = {
        addon_incentive: existing.addon_incentive,
        remarks: existing.remarks
      };

      const { error: upErr } = await supabaseAdmin
        .from('attendance_rows')
        .update(rowUpdate)
        .eq('id', existing.id);
      if (upErr) throw upErr;

      updated += 1;
      await writeLog({
        sheetId: sheet.id,
        rowId: existing.id,
        action: 'ROW_FIELD_CHANGE',
        actorUserId: req.user.id,
        actorRole: access.user.role,
        beforeJson: beforeFields,
        afterJson: {
          addon_incentive: rowUpdate.addon_incentive,
          remarks: rowUpdate.remarks !== undefined ? rowUpdate.remarks : existing.remarks
        },
        message: buildRowFieldChangeMessage(existing.emp_code, beforeFields, {
          addon_incentive: rowUpdate.addon_incentive,
          remarks: rowUpdate.remarks !== undefined ? rowUpdate.remarks : existing.remarks
        })
      });
    }

    await writeLog({
      sheetId: sheet.id,
      action: 'UPLOAD',
      actorUserId: req.user.id,
      actorRole: access.user.role,
      afterJson: {
        type: 'incentives',
        updated,
        skipped: skipped.length,
        filename: req.file.originalname
      },
      message: `Uploaded incentives for ${updated} row(s)`
    });

    const bundle = await fetchSheetBundle(sheet.id);
    const caps = buildCapabilities(bundle.sheet, access, bundle.grant_user_ids);
    const eligiblePms = await loadEligiblePms(access.client);
    const client_policy = await loadClientPolicyForResponse(
      clientId,
      monthYm(sheet.attendance_month)
    );

    res.status(skipped.length || allErrors.length ? 207 : 200).json({
      imported: updated,
      skipped: skipped.length,
      errors: [...allErrors, ...skipped],
      missing_from_csv: [],
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
    const allowed = new Set(['data', 'template', 'incentive', 'leave', 'missing', 'warnings']);
    if (!allowed.has(type)) {
      return res.status(400).json({
        error: 'type must be data, template, incentive, leave, missing, or warnings'
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

    const bundle = await fetchSheetBundle(sheet.id);
    let missing = [];
    if (type === 'missing' || type === 'warnings') {
      missing = await listMissingEmployeesForSheet(clientId, sheet.id);
    }
    const csv = buildAttendanceExportCsv({
      sheet: bundle.sheet,
      rows: bundle.rows,
      type,
      missing,
      warnings: []
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
    const lwdExitsToCascade = [];

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
        status_label: row.status_label,
        incentive: row.incentive,
        addon_incentive: row.addon_incentive,
        arrear_days: row.arrear_days,
        remarks: row.remarks,
        lwd: row.lwd
      };
      const dayMarkChanges = [];

      let effectiveLwd = parseIsoDate(row.lwd);
      if (change.lwd !== undefined) {
        if (change.lwd === null || change.lwd === '') {
          effectiveLwd = null;
        } else {
          const parsed = parseIsoDate(change.lwd);
          if (!parsed) {
            const err = new Error('LWD must be a valid date (YYYY-MM-DD).');
            err.status = 400;
            throw err;
          }
          effectiveLwd = parsed;
        }
      }

      if (Array.isArray(change.day_marks)) {
        for (const dm of change.day_marks) {
          const markDate = String(dm?.mark_date ?? '').slice(0, 10);
          const code = normalizeAttendanceCode(dm?.code);
          if (!markDate || !code || !isValidAttendanceCode(code)) continue;
          if (effectiveLwd && isAfterLwd(markDate, effectiveLwd)) continue;

          const { data: existingMark, error: mErr } = await supabaseAdmin
            .from('attendance_day_marks')
            .select('*')
            .eq('row_id', row.id)
            .eq('mark_date', markDate)
            .maybeSingle();
          if (mErr) throw mErr;

          const beforeCode = existingMark?.code ?? null;
          if (String(beforeCode ?? '').toUpperCase() !== String(code ?? '').toUpperCase()) {
            dayMarkChanges.push({ markDate, before: beforeCode, after: code });
          }

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
      if (change.lwd !== undefined) {
        rowUpdate.lwd = effectiveLwd;
      }
      if (change.status_label !== undefined) {
        const raw = change.status_label;
        if (raw === null || raw === '') {
          rowUpdate.status_label = null;
        } else {
          const normalized = normalizeEmployeeStatus(raw);
          if (normalized) rowUpdate.status_label = normalized;
        }
      }
      if (change.addon_incentive !== undefined) {
        const n = change.addon_incentive === null || change.addon_incentive === ''
          ? null
          : Number(change.addon_incentive);
        rowUpdate.addon_incentive = Number.isFinite(n) ? n : null;
      }
      if (change.arrear_days !== undefined) {
        const n = change.arrear_days === null || change.arrear_days === ''
          ? null
          : Number(change.arrear_days);
        rowUpdate.arrear_days = Number.isFinite(n) ? n : null;
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

      const pendingStatus = 'status_label' in rowUpdate ? rowUpdate.status_label : row.status_label;
      if (effectiveLwd && isLwdInMonth(effectiveLwd, monthYmVal)) {
        const lwdMark = (allMarks ?? []).find((m) => parseIsoDate(m.mark_date) === effectiveLwd);
        const exitFromCell = isExitCode(lwdMark?.code) ? String(lwdMark.code).toUpperCase() : null;
        const exitFromStatus = exitCodeFromStatus(pendingStatus) || exitCodeFromStatus(row.status_label);
        const exitCode = exitFromCell || exitFromStatus;
        if (!exitCode) {
          const err = new Error('LWD date must be AB, R, or T (Abscond, Resigned, or Termination).');
          err.status = 400;
          throw err;
        }
        if (pendingStatus && !isExitStatus(pendingStatus) && pendingStatus !== statusFromExitCode(exitCode)) {
          const err = new Error('When LWD is set, Status must be Abscond, Resigned, or Termination.');
          err.status = 400;
          throw err;
        }
        rowUpdate.status_label = statusFromExitCode(exitCode);
        const nextMarks = applyLwdToDayMarks(allMarks ?? [], effectiveLwd, exitCode);
        const lwdDay = nextMarks.find((m) => parseIsoDate(m.mark_date) === effectiveLwd);
        if (lwdDay) {
          const existingLwd = (allMarks ?? []).find((m) => parseIsoDate(m.mark_date) === effectiveLwd);
          if (existingLwd) {
            if (String(existingLwd.code ?? '').toUpperCase() !== exitCode) {
              dayMarkChanges.push({
                markDate: effectiveLwd,
                before: existingLwd.code,
                after: exitCode
              });
            }
            const { error: uErr } = await supabaseAdmin
              .from('attendance_day_marks')
              .update({ code: exitCode })
              .eq('row_id', row.id)
              .eq('mark_date', effectiveLwd);
            if (uErr) throw uErr;
          } else {
            dayMarkChanges.push({ markDate: effectiveLwd, before: null, after: exitCode });
            const { error: cErr } = await supabaseAdmin
              .from('attendance_day_marks')
              .insert({ row_id: row.id, mark_date: effectiveLwd, code: exitCode });
            if (cErr) throw cErr;
          }
        }
      } else if (effectiveLwd && pendingStatus && !isExitStatus(pendingStatus)) {
        const err = new Error('When LWD is set, Status must be Abscond, Resigned, or Termination.');
        err.status = 400;
        throw err;
      }

      if (effectiveLwd) {
        const { error: delErr } = await supabaseAdmin
          .from('attendance_day_marks')
          .delete()
          .eq('row_id', row.id)
          .gt('mark_date', effectiveLwd);
        if (delErr) throw delErr;
      }

      ({ data: allMarks, error: allErr } = await supabaseAdmin
        .from('attendance_day_marks')
        .select('mark_date, code')
        .eq('row_id', row.id));
      if (allErr) throw allErr;

      const rowForCalc = { ...row, lwd: effectiveLwd, status_label: rowUpdate.status_label ?? pendingStatus };
      allMarks = await applyDefaultMarksForRow(
        row.id,
        allMarks ?? [],
        client_policy,
        monthYmVal,
        { doj: row.doj, lwd: effectiveLwd }
      );

      const ytdMap = row.employee_id
        ? await fetchYtdTakenByEmployee(clientId, year, monthYmVal, [row.employee_id])
        : new Map();
      const summary = await recalculateRowSummary({
        row: rowForCalc,
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

      if (
        'lwd' in rowUpdate
        && rowUpdate.lwd
        && parseIsoDate(beforeFields.lwd) !== parseIsoDate(rowUpdate.lwd)
      ) {
        lwdExitsToCascade.push({
          emp_code: row.emp_code,
          lwd: rowUpdate.lwd,
          status_label: rowUpdate.status_label ?? pendingStatus ?? row.status_label
        });
      }

      const fieldChanged =
        ('lwd' in rowUpdate && beforeFields.lwd !== rowUpdate.lwd)
        || ('status_label' in rowUpdate && beforeFields.status_label !== rowUpdate.status_label)
        || (change.addon_incentive !== undefined && beforeFields.addon_incentive !== rowUpdate.addon_incentive)
        || (change.arrear_days !== undefined && beforeFields.arrear_days !== rowUpdate.arrear_days)
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
        const afterFields = {
          lwd: 'lwd' in rowUpdate ? rowUpdate.lwd : beforeFields.lwd,
          status_label: 'status_label' in rowUpdate
            ? rowUpdate.status_label
            : beforeFields.status_label,
          addon_incentive: rowUpdate.addon_incentive !== undefined
            ? rowUpdate.addon_incentive
            : beforeFields.addon_incentive,
          arrear_days: rowUpdate.arrear_days !== undefined
            ? rowUpdate.arrear_days
            : beforeFields.arrear_days,
          remarks: rowUpdate.remarks !== undefined ? rowUpdate.remarks : beforeFields.remarks
        };
        await writeLog({
          sheetId: sheet.id,
          rowId: row.id,
          action: 'ROW_FIELD_CHANGE',
          actorUserId: req.user.id,
          actorRole: access.user.role,
          beforeJson: beforeFields,
          afterJson: afterFields,
          message: buildRowFieldChangeMessage(row.emp_code, beforeFields, afterFields)
        });
      }

      if (row.employee_id) affectedEmployeeIds.push(row.employee_id);
    }

    if (affectedEmployeeIds.length) {
      await recalculateForwardYtdForEmployees(clientId, monthYmVal, affectedEmployeeIds);
    }

    if (lwdExitsToCascade.length) {
      await removeEmployeesFromLaterSheets({
        clientId,
        exits: lwdExitsToCascade,
        actorUserId: req.user.id,
        actorRole: access.user.role
      });
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

    if (isAfterLwd(markDate, row.lwd)) {
      return res.status(400).json({ error: 'Cannot mark attendance after last working date.' });
    }
    if (isLwdDate(markDate, row.lwd) && !isExitCode(code)) {
      return res.status(400).json({
        error: 'LWD date must be AB, R, or T (Abscond, Resigned, or Termination).'
      });
    }

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
      monthYmVal,
      { doj: row.doj, lwd: row.lwd }
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

    const rowPatch = {
      paid_days: summary.paid_days,
      lop: summary.lop,
      not_considered: summary.not_considered,
      total_days: summary.total_days,
      legend_totals: summary.legend_totals,
      leave_summary: summary.leave_summary,
      incentive: summary.incentive,
      updated_at: new Date().toISOString()
    };
    if (isLwdDate(markDate, row.lwd) && isExitCode(code)) {
      rowPatch.status_label = statusFromExitCode(code);
    }
    const { error: totErr } = await supabaseAdmin
      .from('attendance_rows')
      .update(rowPatch)
      .eq('id', row.id);
    if (totErr) throw totErr;

    const beforeCode = before?.code ?? null;
    if (String(beforeCode ?? '').toUpperCase() !== String(code ?? '').toUpperCase()) {
      await writeLog({
        sheetId: sheet.id,
        rowId: row.id,
        dayMarkId,
        action: 'CELL_CHANGE',
        actorUserId: req.user.id,
        actorRole: access.user.role,
        beforeJson: before,
        afterJson: { code, mark_date: markDate },
        message: `Emp ${row.emp_code} · ${formatMarkDate(markDate)}: ${formatMarkLabel(beforeCode)} to ${formatMarkLabel(code)}`
      });
    }

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

    await pruneExitedEmployeesFromSheet({
      clientId,
      sheet,
      actorUserId: req.user.id,
      actorRole: access.user.role
    });

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
    const isResubmit = wasSubmitted || Boolean(sheet.submitted_at) || Boolean(sheet.ever_locked);
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

    await writeLog({
      sheetId: sheet.id,
      action: isResubmit ? 'RESUBMIT' : 'SUBMIT',
      actorUserId: req.user.id,
      actorRole: access.user.role,
      message: isResubmit ? 'Attendance resubmitted' : 'Attendance submitted'
    });

    await logOrgActivityFromReq(req, {
      action: 'ATTENDANCE_SUBMIT',
      entityType: 'attendance_sheet',
      entityId: sheet.id,
      clientId,
      summary: `${isResubmit ? 'Resubmitted' : 'Submitted'} attendance for ${access.client?.client_name || clientId}`,
      metadata: { sheet_id: sheet.id, resubmit: Boolean(isResubmit) }
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

// Undo submit — revert SUBMITTED → DRAFT (unlocked sheets only)
router.post('/:sheetId/unsubmit', async (req, res, next) => {
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
    if (sheet.locked) {
      return res.status(400).json({ error: 'Locked attendance cannot be unsubmitted. Unlock first.' });
    }
    if (sheet.status !== 'SUBMITTED') {
      return res.status(400).json({ error: 'Attendance is not submitted.' });
    }

    const { data: grantsForUnsubmit } = await supabaseAdmin
      .from('attendance_edit_grants')
      .select('user_id')
      .eq('sheet_id', sheet.id);
    assertCanEdit(
      sheet,
      access,
      (grantsForUnsubmit ?? []).map((g) => g.user_id)
    );

    const now = new Date().toISOString();
    const { data: updated, error: upErr } = await supabaseAdmin
      .from('attendance_sheets')
      .update({
        status: 'DRAFT',
        submitted_at: null,
        submitted_by: null,
        updated_at: now
      })
      .eq('id', sheet.id)
      .select()
      .single();
    if (upErr) throw upErr;

    try {
      await writeLog({
        sheetId: sheet.id,
        action: 'UNSUBMIT',
        actorUserId: req.user.id,
        actorRole: access.user.role,
        message: 'Attendance submission undone'
      });
    } catch (logErr) {
      // Older DBs may lack UNSUBMIT in attendance_activity_logs_action_check.
      // Undo must still succeed; apply migration 20260730150000_attendance_unsubmit_action.sql.
      console.warn('attendance unsubmit log skipped:', logErr?.message || logErr);
    }

    await logOrgActivityFromReq(req, {
      action: 'ATTENDANCE_UNSUBMIT',
      entityType: 'attendance_sheet',
      entityId: sheet.id,
      clientId,
      summary: `Unsubmitted attendance for ${access.client?.client_name || clientId}`,
      metadata: { sheet_id: sheet.id }
    });

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
