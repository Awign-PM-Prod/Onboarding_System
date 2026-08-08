import { Router } from 'express';
import { supabaseAdmin } from '../supabase.js';
import { requireRole } from '../middleware/requireRole.js';
import { INDIAN_STATES, normalizeIndianState } from '../utils/indianStates.js';
import { logOrgActivityFromReq } from '../utils/orgActivityLog.js';
import { SKILL_LEVELS, WAGE_ZONES, normalizeSkillLevel, normalizeWageZone } from '../utils/wageConfig.js';
import { runRemainingTaskDigest } from '../jobs/remainingTaskDigest.js';

const router = Router();

router.use(requireRole('SUPER_ADMIN'));

const ESIC_MONTHLY_LIMIT = 43900;

function effectiveMonthlyCTC(ctcType, ctcValue) {
  if (ctcValue == null) return null;
  const v = Number(ctcValue);
  if (!isFinite(v)) return null;
  if (String(ctcType).toUpperCase() === 'ANNUAL') return v / 12;
  return v;
}

function emptyPipelineCounts() {
  return {
    onboarding_activations: 0,
    employees_submitted: 0,
    submission_pending: 0,
    pm_approved: 0,
    pm_rejected: 0,
    pm_correction_requested: 0,
    payroll_approved: 0,
    payroll_rejected: 0
  };
}

function emptyComplianceCounts() {
  return {
    form_submitted: 0,
    with_uan: 0,
    without_uan: 0,
    with_esic_under_limit: 0,
    without_esic_under_limit: 0,
    outside_esic_limit: 0
  };
}

function applyPipelineCounts(target, employeeRow, formRow) {
  if (employeeRow?.onboarding_initiated) target.onboarding_activations += 1;

  const submissionStatus = String(formRow?.submission_status ?? '').trim();
  const reviewStatus = String(formRow?.review_status ?? '').trim();
  const payrollReviewStatus = String(formRow?.payroll_review_status ?? '').trim();

  if (submissionStatus === 'Submitted') target.employees_submitted += 1;
  else if (employeeRow?.onboarding_initiated) target.submission_pending += 1;

  if (reviewStatus === 'APPROVED') target.pm_approved += 1;
  if (reviewStatus === 'REJECTED') target.pm_rejected += 1;
  if (reviewStatus === 'CORRECTION_REQUESTED') target.pm_correction_requested += 1;

  if (payrollReviewStatus === 'PAYROLL_APPROVED') target.payroll_approved += 1;
  if (payrollReviewStatus === 'PAYROLL_REJECTED') target.payroll_rejected += 1;
}

function csvEscape(value) {
  const s = value == null ? '' : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(headers, rows) {
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(','));
  }
  return `${lines.join('\n')}\n`;
}

// GET /api/super-admin/dashboard-stats
router.get('/dashboard-stats', async (req, res, next) => {
  try {
    const { data: clients, error: cErr } = await supabaseAdmin
      .from('clients')
      .select('id, client_name, contract_code')
      .order('client_name', { ascending: true });
    if (cErr) throw cErr;

    const clientRows = clients ?? [];
    const totals = emptyPipelineCounts();
    const compliance = emptyComplianceCounts();
    let totalEmployees = 0;
    let totalOnboarded = 0;
    let totalDropout = 0;

    if (clientRows.length === 0) {
      return res.json({
        totals: {
          ...totals,
          clients: 0,
          employees: 0,
          total_onboarded: 0,
          total_dropout: 0,
          active_employees: 0
        },
        compliance,
        clients: []
      });
    }

    const clientIds = clientRows.map((c) => c.id);
    const { data: employees, error: eErr } = await supabaseAdmin
      .from('employees')
      .select(
        'id, client_id, onboarding_initiated, joining_status, ctc_type, ctc_value, payroll_pf_uan_number, payroll_esic_number'
      )
      .in('client_id', clientIds);
    if (eErr) throw eErr;

    const employeeRows = employees ?? [];
    totalEmployees = employeeRows.length;
    const employeeIds = employeeRows.map((e) => e.id);
    const formMap = new Map();
    if (employeeIds.length > 0) {
      const { data: forms, error: fErr } = await supabaseAdmin
        .from('job_app_form')
        .select('employee_id, submission_status, review_status, payroll_review_status')
        .in('employee_id', employeeIds);
      if (fErr) throw fErr;
      for (const form of forms ?? []) {
        formMap.set(form.employee_id, form);
      }
    }

    const byClient = new Map(
      clientRows.map((c) => [
        c.id,
        {
          ...emptyPipelineCounts(),
          client_id: c.id,
          client_name: c.client_name,
          contract_code: c.contract_code,
          employee_count: 0,
          total_onboarded: 0,
          total_dropout: 0,
          active_employees: 0
        }
      ])
    );

    for (const employee of employeeRows) {
      const current = byClient.get(employee.client_id);
      if (!current) continue;
      current.employee_count += 1;
      const form = formMap.get(employee.id);
      applyPipelineCounts(current, employee, form);
      applyPipelineCounts(totals, employee, form);

      if (form?.submission_status === 'Submitted') compliance.form_submitted += 1;

      const monthlyCTC = effectiveMonthlyCTC(employee.ctc_type, employee.ctc_value);
      if (monthlyCTC !== null) {
        const hasUan =
          typeof employee.payroll_pf_uan_number === 'string' &&
          employee.payroll_pf_uan_number.trim() !== '';
        if (hasUan) compliance.with_uan += 1;
        else compliance.without_uan += 1;

        const hasEsic =
          typeof employee.payroll_esic_number === 'string' &&
          employee.payroll_esic_number.trim() !== '';
        if (monthlyCTC <= ESIC_MONTHLY_LIMIT) {
          if (hasEsic) compliance.with_esic_under_limit += 1;
          else compliance.without_esic_under_limit += 1;
        } else {
          compliance.outside_esic_limit += 1;
        }
      }

      if (form?.payroll_review_status === 'PAYROLL_APPROVED') {
        totalOnboarded += 1;
        current.total_onboarded += 1;
        const js = employee.joining_status;
        if (js === 'NOT_JOINED' || js === 'JOINED_ABSCONDED') {
          totalDropout += 1;
          current.total_dropout += 1;
        }
      }
      current.active_employees = current.total_onboarded - current.total_dropout;
    }

    return res.json({
      totals: {
        ...totals,
        clients: clientRows.length,
        employees: totalEmployees,
        total_onboarded: totalOnboarded,
        total_dropout: totalDropout,
        active_employees: totalOnboarded - totalDropout
      },
      compliance,
      clients: clientRows.map((c) => byClient.get(c.id))
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/super-admin/clients
router.get('/clients', async (req, res, next) => {
  try {
    const { data: clients, error } = await supabaseAdmin
      .from('clients')
      .select(
        'id, client_name, contract_code, state, entity, created_at, program_manager:program_manager_id(id, name, email), creator:created_by(id, name, email)'
      )
      .order('created_at', { ascending: false });
    if (error) throw error;

    const clientRows = clients ?? [];
    if (clientRows.length === 0) return res.json([]);

    const ids = clientRows.map((c) => c.id);
    const { data: employees, error: eErr } = await supabaseAdmin
      .from('employees')
      .select('client_id')
      .in('client_id', ids);
    if (eErr) throw eErr;

    const countByClient = new Map();
    for (const e of employees ?? []) {
      countByClient.set(e.client_id, (countByClient.get(e.client_id) ?? 0) + 1);
    }

    res.json(
      clientRows.map((c) => ({
        id: c.id,
        client_name: c.client_name,
        contract_code: c.contract_code,
        state: c.state,
        entity: c.entity,
        created_at: c.created_at,
        program_manager_name: c.program_manager?.name ?? null,
        program_manager_email: c.program_manager?.email ?? null,
        payroll_lead_name: c.creator?.name ?? null,
        payroll_lead_email: c.creator?.email ?? null,
        employee_count: countByClient.get(c.id) ?? 0
      }))
    );
  } catch (err) {
    next(err);
  }
});

// GET /api/super-admin/clients/:id/employees
router.get('/clients/:id/employees', async (req, res, next) => {
  try {
    const clientId = req.params.id;
    const { data: client, error: cErr } = await supabaseAdmin
      .from('clients')
      .select(
        'id, client_name, contract_code, state, entity, program_manager:program_manager_id(id, name, email), creator:created_by(id, name, email)'
      )
      .eq('id', clientId)
      .maybeSingle();
    if (cErr) throw cErr;
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const { data: employees, error: eErr } = await supabaseAdmin
      .from('employees')
      .select(
        'id, emp_code, name, mobile, email, onboarding_status, onboarding_initiated, pay_type, ctc_type, ctc_value, state, designation, date_of_joining, joining_status, created_at'
      )
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });
    if (eErr) throw eErr;

    const employeeRows = employees ?? [];
    const employeeIds = employeeRows.map((e) => e.id);
    const formMap = new Map();
    if (employeeIds.length > 0) {
      const { data: forms, error: fErr } = await supabaseAdmin
        .from('job_app_form')
        .select('employee_id, submission_status, review_status, payroll_review_status')
        .in('employee_id', employeeIds);
      if (fErr) throw fErr;
      for (const form of forms ?? []) {
        formMap.set(form.employee_id, form);
      }
    }

    res.json({
      client: {
        id: client.id,
        client_name: client.client_name,
        contract_code: client.contract_code,
        state: client.state,
        entity: client.entity,
        program_manager_name: client.program_manager?.name ?? null,
        payroll_lead_name: client.creator?.name ?? null
      },
      employees: employeeRows.map((e) => {
        const form = formMap.get(e.id);
        return {
          ...e,
          form_submission_status: form?.submission_status ?? null,
          form_review_status: form?.review_status ?? null,
          form_payroll_review_status: form?.payroll_review_status ?? null
        };
      })
    });
  } catch (err) {
    next(err);
  }
});

const MASTER_REPORT_HEADERS = [
  'client_name',
  'contract_code',
  'client_state',
  'payroll_lead',
  'program_manager',
  'emp_code',
  'employee_name',
  'mobile',
  'email',
  'onboarding_status',
  'form_submission_status',
  'pm_review_status',
  'payroll_review_status',
  'pay_type',
  'ctc_type',
  'ctc_value',
  'employee_state',
  'designation',
  'date_of_joining',
  'joining_status'
];

// GET /api/super-admin/master-report?client_id=
router.get('/master-report', async (req, res, next) => {
  try {
    const filterClientId = String(req.query.client_id ?? '').trim() || null;

    let clientQuery = supabaseAdmin
      .from('clients')
      .select(
        'id, client_name, contract_code, state, program_manager:program_manager_id(name), creator:created_by(name)'
      )
      .order('client_name', { ascending: true });
    if (filterClientId) clientQuery = clientQuery.eq('id', filterClientId);

    const { data: clients, error: cErr } = await clientQuery;
    if (cErr) throw cErr;

    const clientRows = clients ?? [];
    if (clientRows.length === 0) {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="master-report.csv"');
      return res.send(toCsv(MASTER_REPORT_HEADERS, []));
    }

    const clientIds = clientRows.map((c) => c.id);
    const clientMap = new Map(clientRows.map((c) => [c.id, c]));

    const { data: employees, error: eErr } = await supabaseAdmin
      .from('employees')
      .select(
        'id, client_id, emp_code, name, mobile, email, onboarding_status, pay_type, ctc_type, ctc_value, state, designation, date_of_joining, joining_status'
      )
      .in('client_id', clientIds)
      .order('created_at', { ascending: false });
    if (eErr) throw eErr;

    const employeeRows = employees ?? [];
    const employeeIds = employeeRows.map((e) => e.id);
    const formMap = new Map();
    if (employeeIds.length > 0) {
      const { data: forms, error: fErr } = await supabaseAdmin
        .from('job_app_form')
        .select('employee_id, submission_status, review_status, payroll_review_status')
        .in('employee_id', employeeIds);
      if (fErr) throw fErr;
      for (const form of forms ?? []) {
        formMap.set(form.employee_id, form);
      }
    }

    const rows = employeeRows.map((e) => {
      const client = clientMap.get(e.client_id);
      const form = formMap.get(e.id);
      return {
        client_name: client?.client_name ?? '',
        contract_code: client?.contract_code ?? '',
        client_state: client?.state ?? '',
        payroll_lead: client?.creator?.name ?? '',
        program_manager: client?.program_manager?.name ?? '',
        emp_code: e.emp_code ?? '',
        employee_name: e.name ?? '',
        mobile: e.mobile ?? '',
        email: e.email ?? '',
        onboarding_status: e.onboarding_status ?? '',
        form_submission_status: form?.submission_status ?? '',
        pm_review_status: form?.review_status ?? '',
        payroll_review_status: form?.payroll_review_status ?? '',
        pay_type: e.pay_type ?? '',
        ctc_type: e.ctc_type ?? '',
        ctc_value: e.ctc_value ?? '',
        employee_state: e.state ?? '',
        designation: e.designation ?? '',
        date_of_joining: e.date_of_joining ?? '',
        joining_status: e.joining_status ?? ''
      };
    });

    const filename = filterClientId
      ? `master-report-${filterClientId.slice(0, 8)}.csv`
      : 'master-report-all-clients.csv';

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(toCsv(MASTER_REPORT_HEADERS, rows));
  } catch (err) {
    next(err);
  }
});

// GET /api/super-admin/activity
router.get('/activity', async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const cursor = String(req.query.cursor ?? '').trim() || null;
    const clientId = String(req.query.client_id ?? '').trim() || null;
    const action = String(req.query.action ?? '').trim() || null;
    const actorRole = String(req.query.actor_role ?? '').trim() || null;

    let query = supabaseAdmin
      .from('org_activity_logs')
      .select(
        'id, created_at, actor_user_id, actor_role, actor_name, action, entity_type, entity_id, client_id, summary, metadata'
      )
      .order('created_at', { ascending: false })
      .limit(limit + 1);

    if (cursor) query = query.lt('created_at', cursor);
    if (clientId) query = query.eq('client_id', clientId);
    if (action) query = query.eq('action', action);
    if (actorRole) query = query.eq('actor_role', actorRole);

    const { data, error } = await query;
    if (error) throw error;

    const rows = data ?? [];
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.created_at ?? null : null;

    // Attach client names for display
    const clientIds = [...new Set(items.map((r) => r.client_id).filter(Boolean))];
    const clientNameById = new Map();
    if (clientIds.length > 0) {
      const { data: clients, error: cErr } = await supabaseAdmin
        .from('clients')
        .select('id, client_name')
        .in('id', clientIds);
      if (cErr) throw cErr;
      for (const c of clients ?? []) clientNameById.set(c.id, c.client_name);
    }

    res.json({
      items: items.map((row) => ({
        ...row,
        client_name: row.client_id ? clientNameById.get(row.client_id) ?? null : null
      })),
      next_cursor: nextCursor
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/super-admin/salary-minimums — full state × zone × skill matrix
router.get('/salary-minimums', async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('state_wage_minimums')
      .select('state, zone, skill_level, min_monthly_ctc, updated_by, updated_at');
    if (error) throw error;

    const byKey = new Map(
      (data ?? []).map((r) => [`${r.state}|${r.zone}|${r.skill_level}`, r])
    );
    const rows = [];
    for (const state of INDIAN_STATES) {
      for (const zone of WAGE_ZONES) {
        for (const skill_level of SKILL_LEVELS) {
          const existing = byKey.get(`${state}|${zone}|${skill_level}`);
          rows.push({
            state,
            zone,
            skill_level,
            min_monthly_ctc: existing ? Number(existing.min_monthly_ctc) : null,
            updated_by: existing?.updated_by ?? null,
            updated_at: existing?.updated_at ?? null
          });
        }
      }
    }

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// PUT /api/super-admin/salary-minimums — body: { items: [{ state, zone, skill_level, min_monthly_ctc }] }
router.put('/salary-minimums', async (req, res, next) => {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : null;
    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'items array is required' });
    }

    const upserts = [];
    const errors = [];
    for (const item of items) {
      const state = normalizeIndianState(item?.state);
      if (!state) {
        errors.push(`Invalid state: ${item?.state}`);
        continue;
      }
      const zone = normalizeWageZone(item?.zone);
      if (!zone) {
        errors.push(`Invalid zone for ${state}: ${item?.zone}`);
        continue;
      }
      const skill_level = normalizeSkillLevel(item?.skill_level);
      if (!skill_level) {
        errors.push(`Invalid skill_level for ${state}/${zone}: ${item?.skill_level}`);
        continue;
      }
      const min = Number(item?.min_monthly_ctc);
      if (!Number.isFinite(min) || min < 0) {
        errors.push(`Invalid min_monthly_ctc for ${state}/${zone}/${skill_level}`);
        continue;
      }
      upserts.push({
        state,
        zone,
        skill_level,
        min_monthly_ctc: min,
        updated_by: req.user.id,
        updated_at: new Date().toISOString()
      });
    }

    if (errors.length) {
      return res.status(400).json({ error: errors.join('; ') });
    }

    const { data, error } = await supabaseAdmin
      .from('state_wage_minimums')
      .upsert(upserts, { onConflict: 'state,zone,skill_level' })
      .select('state, zone, skill_level, min_monthly_ctc, updated_by, updated_at');
    if (error) throw error;

    await logOrgActivityFromReq(req, {
      action: 'SALARY_MINIMUMS_UPDATED',
      entityType: 'state_wage_minimums',
      summary: `Updated wage minimums for ${upserts.length} cell(s)`,
      metadata: {
        items: upserts.map((u) => ({
          state: u.state,
          zone: u.zone,
          skill_level: u.skill_level,
          min_monthly_ctc: u.min_monthly_ctc
        }))
      }
    });

    res.json(data ?? []);
  } catch (err) {
    next(err);
  }
});

async function listPmAndPlUsers() {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id, name, email, role')
    .in('role', ['PROGRAM_MANAGER', 'PAYROLL_LEAD']);
  if (error) throw error;

  const roleOrder = { PROGRAM_MANAGER: 0, PAYROLL_LEAD: 1 };
  return (data ?? []).slice().sort((a, b) => {
    const ro = (roleOrder[a.role] ?? 9) - (roleOrder[b.role] ?? 9);
    if (ro !== 0) return ro;
    return String(a.name || '').localeCompare(String(b.name || ''));
  });
}

// GET /api/super-admin/staff-users
router.get('/staff-users', async (_req, res, next) => {
  try {
    res.json(await listPmAndPlUsers());
  } catch (err) {
    next(err);
  }
});

// GET /api/super-admin/digest-recipients
router.get('/digest-recipients', async (_req, res, next) => {
  try {
    res.json(await listPmAndPlUsers());
  } catch (err) {
    next(err);
  }
});

// POST /api/super-admin/users/:userId/password
router.post('/users/:userId/password', async (req, res, next) => {
  try {
    const userId = String(req.params.userId ?? '').trim();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const confirmPassword =
      typeof req.body?.confirmPassword === 'string' ? req.body.confirmPassword : null;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required.' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }
    if (confirmPassword !== null && password !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match.' });
    }

    const { data: profile, error: profileErr } = await supabaseAdmin
      .from('users')
      .select('id, name, email, role')
      .eq('id', userId)
      .maybeSingle();
    if (profileErr) throw profileErr;
    if (!profile) {
      return res.status(404).json({ error: 'User not found.' });
    }
    if (!['PROGRAM_MANAGER', 'PAYROLL_LEAD'].includes(profile.role)) {
      return res.status(403).json({
        error: 'Password reset is only allowed for Program Managers and Payroll Leads.'
      });
    }

    const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password
    });
    if (authErr) {
      return res.status(400).json({ error: authErr.message || 'Could not update password.' });
    }

    await logOrgActivityFromReq(req, {
      action: 'PASSWORD_RESET',
      entityType: 'users',
      entityId: userId,
      summary: `Reset password for ${profile.name || profile.email} (${profile.role})`,
      metadata: {
        target_user_id: userId,
        target_email: profile.email,
        target_role: profile.role
      }
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/super-admin/remaining-task-digest
router.post('/remaining-task-digest', async (req, res, next) => {
  try {
    const scope = String(req.body?.scope ?? '').trim().toLowerCase();
    const role = String(req.body?.role ?? '').trim().toUpperCase();
    const userId = String(req.body?.userId ?? '').trim();

    if (!['all', 'role', 'user'].includes(scope)) {
      return res.status(400).json({ error: 'scope must be all, role, or user.' });
    }
    if (scope === 'role' && !['PROGRAM_MANAGER', 'PAYROLL_LEAD'].includes(role)) {
      return res.status(400).json({ error: 'role must be PROGRAM_MANAGER or PAYROLL_LEAD.' });
    }
    if (scope === 'user' && !userId) {
      return res.status(400).json({ error: 'userId is required when scope is user.' });
    }

    let userIds;
    if (scope === 'all') {
      userIds = undefined;
    } else if (scope === 'role') {
      const { data, error } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('role', role);
      if (error) throw error;
      userIds = (data ?? []).map((r) => r.id);
    } else {
      const { data, error } = await supabaseAdmin
        .from('users')
        .select('id, role')
        .eq('id', userId)
        .maybeSingle();
      if (error) throw error;
      if (!data || !['PROGRAM_MANAGER', 'PAYROLL_LEAD'].includes(data.role)) {
        return res.status(400).json({ error: 'userId must be a Program Manager or Payroll Lead.' });
      }
      userIds = [data.id];
    }

    const summary = await runRemainingTaskDigest(
      userIds === undefined ? {} : { userIds }
    );

    await logOrgActivityFromReq(req, {
      action: 'REMAINING_TASK_DIGEST_TRIGGERED',
      entityType: 'users',
      summary: `Triggered remaining-task digests (scope=${scope}${scope === 'role' ? `, role=${role}` : ''}${scope === 'user' ? `, user=${userId}` : ''}): sent=${summary.sent}, skipped=${summary.skipped}, failed=${summary.failed}`,
      metadata: {
        scope,
        role: scope === 'role' ? role : null,
        userId: scope === 'user' ? userId : null,
        sent: summary.sent,
        skipped: summary.skipped,
        failed: summary.failed
      }
    });

    res.json({ ok: true, ...summary });
  } catch (err) {
    next(err);
  }
});

export default router;
