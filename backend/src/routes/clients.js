import { Router } from 'express';
import { supabaseAdmin } from '../supabase.js';
import {
  fetchClientPolicyBundle,
  upsertClientPolicyBundle,
  validateAttendancePolicyPayload,
  validateHolidaysPayload,
  validateLeaveAllowancesPayload
} from '../utils/clientPolicy.js';
import { normalizeAttendancePolicy } from '../utils/clientPolicyCore.js';
import { recalculateAllAttendanceSheetsForClient } from '../utils/attendanceRecalc.js';
import { diffClientPolicyBundles, summarizePolicyChanges } from '../utils/clientPolicyDiff.js';

async function savePolicyWithAudit(clientId, body, actor) {
  const beforeBundle = await fetchClientPolicyBundle(clientId);
  const savedPolicy = await upsertClientPolicyBundle(clientId, body);
  const afterBundle = await fetchClientPolicyBundle(clientId);
  const policyChanges = diffClientPolicyBundles(beforeBundle, afterBundle);
  const message = summarizePolicyChanges(policyChanges);

  try {
    await supabaseAdmin.from('client_policy_change_logs').insert({
      client_id: clientId,
      actor_user_id: actor?.userId ?? null,
      actor_role: actor?.role ?? null,
      changes_json: policyChanges,
      message
    });
  } catch (logErr) {
    console.warn('[clients] policy change log insert skipped:', logErr?.message || logErr);
  }

  return { savedPolicy, policyChanges, afterBundle };
}

function mergeSavedPolicyResponse(full, savedPolicy) {
  return {
    ...full,
    attendance_policy: normalizeAttendancePolicy({
      ...(full.attendance_policy ?? {}),
      ...savedPolicy
    })
  };
}

const router = Router();

function emptyDashboardCounts() {
  return {
    onboarding_activations: 0,
    employees_submitted: 0,
    submission_pending: 0,
    pm_approved: 0,
    pm_rejected: 0,
    payroll_approved: 0,
    payroll_rejected: 0
  };
}

function applyDashboardCounts(target, employeeRow, formRow) {
  const submissionStatus = String(formRow?.submission_status ?? '').trim();
  const reviewStatus = String(formRow?.review_status ?? '').trim();
  const payrollReviewStatus = String(formRow?.payroll_review_status ?? '').trim();

  if (employeeRow?.onboarding_initiated) target.onboarding_activations += 1;
  if (submissionStatus === 'Submitted') target.employees_submitted += 1;
  else if (employeeRow?.onboarding_initiated) target.submission_pending += 1;

  if (reviewStatus === 'APPROVED') target.pm_approved += 1;
  if (reviewStatus === 'REJECTED') target.pm_rejected += 1;
  if (payrollReviewStatus === 'PAYROLL_APPROVED') target.payroll_approved += 1;
  if (payrollReviewStatus === 'PAYROLL_REJECTED') target.payroll_rejected += 1;
}

function validateClientPayload(body) {
  const errors = {};
  const required = [
    'client_name',
    'contract_code',
    'contract_start_date',
    'contract_end_date',
    'program_manager_id'
  ];
  for (const key of required) {
    if (body[key] === undefined || body[key] === null || body[key] === '') {
      errors[key] = 'required';
    }
  }
  if (typeof body.insurance_applicable !== 'boolean') {
    errors.insurance_applicable = 'must be boolean';
  }
  if (typeof body.require_license_upload !== 'boolean') {
    errors.require_license_upload = 'must be boolean';
  }
  if (typeof body.require_qualification_certificate_upload !== 'boolean') {
    errors.require_qualification_certificate_upload = 'must be boolean';
  }
  if (body.insurance_applicable === true) {
    if (!body.insurance_name || !String(body.insurance_name).trim()) {
      errors.insurance_name = 'required when insurance is applicable';
    }
  }
  if (body.contract_start_date && body.contract_end_date) {
    if (new Date(body.contract_end_date) < new Date(body.contract_start_date)) {
      errors.contract_end_date = 'must be on or after contract_start_date';
    }
  }
  let designations = [];
  if (!Array.isArray(body.designations)) {
    errors.designations = 'must be an array of strings';
  } else {
    designations = body.designations.map(d => String(d).trim()).filter(Boolean);
    if (designations.length === 0) {
      errors.designations = 'at least one designation required';
    }
  }

  validateAttendancePolicyPayload(body.attendance_policy, errors);
  if (designations.length) {
    validateLeaveAllowancesPayload(body.leave_allowances, designations, errors);
  }
  validateHolidaysPayload(body.holidays, errors);

  return errors;
}

function normalizedDesignations(input) {
  const seen = new Set();
  const out = [];
  for (const raw of input) {
    const name = String(raw).trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

async function syncClientDesignations(clientId, designationNames) {
  const { error: delErr } = await supabaseAdmin
    .from('designations')
    .delete()
    .eq('client_id', clientId);
  if (delErr) throw delErr;
  if (!designationNames.length) return;
  const rows = designationNames.map((name) => ({ client_id: clientId, name }));
  const { error: insErr } = await supabaseAdmin.from('designations').insert(rows);
  if (insErr) throw insErr;
}

async function fetchClientWithRelations(clientId) {
  const { data: client, error: clientErr } = await supabaseAdmin
    .from('clients')
    .select('*, program_manager:program_manager_id(id, name, email)')
    .eq('id', clientId)
    .single();
  if (clientErr) throw clientErr;

  const { data: designations, error: desigErr } = await supabaseAdmin
    .from('designations')
    .select('name')
    .eq('client_id', clientId)
    .order('created_at', { ascending: true });
  if (desigErr) throw desigErr;

  const policyBundle = await fetchClientPolicyBundle(clientId);

  return {
    ...client,
    program_manager_name: client.program_manager?.name ?? null,
    designations: designations.map(d => d.name),
    ...policyBundle
  };
}

router.get('/', async (req, res, next) => {
  try {
    const { data: clients, error } = await supabaseAdmin
      .from('clients')
      .select('*, program_manager:program_manager_id(id, name, email)')
      .eq('created_by', req.user.id)
      .order('created_at', { ascending: false });
    if (error) throw error;

    if (clients.length === 0) return res.json([]);

    const ids = clients.map(c => c.id);
    const { data: desigs, error: desigErr } = await supabaseAdmin
      .from('designations')
      .select('client_id, name')
      .in('client_id', ids);
    if (desigErr) throw desigErr;

    const byClient = new Map();
    for (const d of desigs) {
      if (!byClient.has(d.client_id)) byClient.set(d.client_id, []);
      byClient.get(d.client_id).push(d.name);
    }

    const policyBundles = await Promise.all(
      ids.map((id) => fetchClientPolicyBundle(id))
    );
    const policyByClient = new Map(ids.map((id, i) => [id, policyBundles[i]]));

    res.json(clients.map(c => ({
      ...c,
      program_manager_name: c.program_manager?.name ?? null,
      designations: byClient.get(c.id) ?? [],
      ...policyByClient.get(c.id)
    })));
  } catch (err) {
    next(err);
  }
});

router.get('/dashboard-stats', async (req, res, next) => {
  try {
    const { data: clients, error: cErr } = await supabaseAdmin
      .from('clients')
      .select('id, client_name, contract_code')
      .eq('created_by', req.user.id)
      .order('client_name', { ascending: true });
    if (cErr) throw cErr;

    const clientRows = clients ?? [];
    if (clientRows.length === 0) {
      return res.json({ totals: emptyDashboardCounts(), clients: [] });
    }

    const clientIds = clientRows.map((c) => c.id);
    const { data: employees, error: eErr } = await supabaseAdmin
      .from('employees')
      .select('id, client_id, onboarding_initiated')
      .in('client_id', clientIds);
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

    const byClient = new Map(
      clientRows.map((c) => [
        c.id,
        {
          ...emptyDashboardCounts(),
          client_id: c.id,
          client_name: c.client_name,
          contract_code: c.contract_code
        }
      ])
    );
    const totals = emptyDashboardCounts();
    for (const employee of employeeRows) {
      const current = byClient.get(employee.client_id);
      if (!current) continue;
      const form = formMap.get(employee.id);
      applyDashboardCounts(current, employee, form);
      applyDashboardCounts(totals, employee, form);
    }

    return res.json({
      totals,
      clients: clientRows.map((c) => byClient.get(c.id))
    });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const errors = validateClientPayload(req.body || {});
    if (Object.keys(errors).length) {
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }

    const { data: pm, error: pmErr } = await supabaseAdmin
      .from('users')
      .select('id, role')
      .eq('id', req.body.program_manager_id)
      .maybeSingle();
    if (pmErr) throw pmErr;
    if (!pm || pm.role !== 'PROGRAM_MANAGER') {
      return res.status(400).json({ error: 'Invalid program_manager_id' });
    }

    const insertPayload = {
      client_name: req.body.client_name.trim(),
      contract_code: req.body.contract_code.trim(),
      contract_start_date: req.body.contract_start_date,
      contract_end_date: req.body.contract_end_date,
      program_manager_id: req.body.program_manager_id,
      insurance_applicable: req.body.insurance_applicable,
      insurance_name: req.body.insurance_applicable ? req.body.insurance_name.trim() : null,
      require_license_upload: req.body.require_license_upload,
      require_qualification_certificate_upload: req.body.require_qualification_certificate_upload,
      created_by: req.user.id
    };

    const { data: created, error: insertErr } = await supabaseAdmin
      .from('clients')
      .insert(insertPayload)
      .select()
      .single();
    if (insertErr) {
      if (insertErr.code === '23505') {
        return res.status(409).json({ error: 'contract_code already exists' });
      }
      throw insertErr;
    }

    const designations = normalizedDesignations(req.body.designations);
    if (designations.length) {
      const rows = designations.map(name => ({ client_id: created.id, name }));
      const { error: desigErr } = await supabaseAdmin.from('designations').insert(rows);
      if (desigErr) {
        await supabaseAdmin.from('clients').delete().eq('id', created.id);
        throw desigErr;
      }
    }

    try {
      await upsertClientPolicyBundle(created.id, req.body);
    } catch (policyErr) {
      await supabaseAdmin.from('clients').delete().eq('id', created.id);
      throw policyErr;
    }

    const full = await fetchClientWithRelations(created.id);
    res.status(201).json(full);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const { data: existing, error: findErr } = await supabaseAdmin
      .from('clients')
      .select('id, created_by')
      .eq('id', id)
      .maybeSingle();
    if (findErr) throw findErr;
    if (!existing || existing.created_by !== req.user.id) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const errors = validateClientPayload(req.body || {});
    if (Object.keys(errors).length) {
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }

    const { data: pm, error: pmErr } = await supabaseAdmin
      .from('users')
      .select('id, role')
      .eq('id', req.body.program_manager_id)
      .maybeSingle();
    if (pmErr) throw pmErr;
    if (!pm || pm.role !== 'PROGRAM_MANAGER') {
      return res.status(400).json({ error: 'Invalid program_manager_id' });
    }

    const updatePayload = {
      client_name: req.body.client_name.trim(),
      contract_code: req.body.contract_code.trim(),
      contract_start_date: req.body.contract_start_date,
      contract_end_date: req.body.contract_end_date,
      program_manager_id: req.body.program_manager_id,
      insurance_applicable: req.body.insurance_applicable,
      insurance_name: req.body.insurance_applicable ? req.body.insurance_name.trim() : null,
      require_license_upload: req.body.require_license_upload,
      require_qualification_certificate_upload: req.body.require_qualification_certificate_upload,
    };

    const { error: updateErr } = await supabaseAdmin
      .from('clients')
      .update(updatePayload)
      .eq('id', id);
    if (updateErr) {
      if (updateErr.code === '23505') {
        return res.status(409).json({ error: 'contract_code already exists' });
      }
      throw updateErr;
    }

    const { error: delErr } = await supabaseAdmin
      .from('designations')
      .delete()
      .eq('client_id', id);
    if (delErr) throw delErr;

    const designations = normalizedDesignations(req.body.designations);
    if (designations.length) {
      const rows = designations.map(name => ({ client_id: id, name }));
      const { error: insErr } = await supabaseAdmin.from('designations').insert(rows);
      if (insErr) throw insErr;
    }

    const { savedPolicy, policyChanges } = await savePolicyWithAudit(id, req.body, {
      userId: req.user.id,
      role: 'PAYROLL_LEAD'
    });

    let attendanceRecalc = { sheets_recalculated: 0, sheet_ids: [], recalc_error: null };
    try {
      attendanceRecalc = await recalculateAllAttendanceSheetsForClient(id);
    } catch (recalcErr) {
      console.error('[clients] attendance recalc after policy save failed:', recalcErr?.message || recalcErr);
      attendanceRecalc = {
        sheets_recalculated: 0,
        sheet_ids: [],
        recalc_error: recalcErr?.message || String(recalcErr)
      };
    }

    const full = mergeSavedPolicyResponse(await fetchClientWithRelations(id), savedPolicy);
    res.json({
      ...full,
      policy_changes: policyChanges,
      attendance_recalculated: attendanceRecalc.sheets_recalculated,
      attendance_recalc_error: attendanceRecalc.recalc_error
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { data: existing, error: findErr } = await supabaseAdmin
      .from('clients')
      .select('id, created_by')
      .eq('id', id)
      .maybeSingle();
    if (findErr) throw findErr;
    if (!existing || existing.created_by !== req.user.id) {
      return res.status(404).json({ error: 'Client not found' });
    }
    const full = await fetchClientWithRelations(id);
    res.json(full);
  } catch (err) {
    next(err);
  }
});

router.get('/:id/policy-changes', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { data: existing, error: findErr } = await supabaseAdmin
      .from('clients')
      .select('id, created_by')
      .eq('id', id)
      .maybeSingle();
    if (findErr) throw findErr;
    if (!existing || existing.created_by !== req.user.id) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const { data: rows, error } = await supabaseAdmin
      .from('client_policy_change_logs')
      .select('*')
      .eq('client_id', id)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;

    const actorIds = new Set((rows ?? []).map((r) => r.actor_user_id).filter(Boolean));
    let nameById = new Map();
    if (actorIds.size) {
      const { data: users, error: uErr } = await supabaseAdmin
        .from('users')
        .select('id, name, email')
        .in('id', Array.from(actorIds));
      if (uErr) throw uErr;
      nameById = new Map((users ?? []).map((u) => [u.id, u]));
    }

    res.json((rows ?? []).map((row) => ({
      ...row,
      actor_name: nameById.get(row.actor_user_id)?.name ?? null,
      actor_email: nameById.get(row.actor_user_id)?.email ?? null
    })));
  } catch (err) {
    next(err);
  }
});

router.put('/:id/policy', async (req, res, next) => {
  try {
    const { id } = req.params;

    const { data: existing, error: findErr } = await supabaseAdmin
      .from('clients')
      .select('id, created_by')
      .eq('id', id)
      .maybeSingle();
    if (findErr) throw findErr;
    if (!existing || existing.created_by !== req.user.id) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const { data: designations, error: desigErr } = await supabaseAdmin
      .from('designations')
      .select('name')
      .eq('client_id', id)
      .order('created_at', { ascending: true });
    if (desigErr) throw desigErr;
    let designationNames = (designations ?? []).map((d) => d.name);
    if (Array.isArray(req.body?.designations)) {
      designationNames = normalizedDesignations(req.body.designations);
      if (!designationNames.length) {
        return res.status(400).json({ error: 'Validation failed', details: { designations: 'at least one required' } });
      }
      await syncClientDesignations(id, designationNames);
    }

    const errors = {};
    validateAttendancePolicyPayload(req.body?.attendance_policy, errors);
    if (designationNames.length) {
      validateLeaveAllowancesPayload(req.body?.leave_allowances, designationNames, errors);
    }
    validateHolidaysPayload(req.body?.holidays, errors);
    if (Object.keys(errors).length) {
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }

    const { savedPolicy, policyChanges } = await savePolicyWithAudit(id, req.body, {
      userId: req.user.id,
      role: 'PAYROLL_LEAD'
    });

    let attendanceRecalc = { sheets_recalculated: 0, sheet_ids: [], recalc_error: null };
    try {
      attendanceRecalc = await recalculateAllAttendanceSheetsForClient(id);
    } catch (recalcErr) {
      console.error('[clients] attendance recalc after policy save failed:', recalcErr?.message || recalcErr);
      attendanceRecalc = {
        sheets_recalculated: 0,
        sheet_ids: [],
        recalc_error: recalcErr?.message || String(recalcErr)
      };
    }

    const full = mergeSavedPolicyResponse(await fetchClientWithRelations(id), savedPolicy);
    res.json({
      ...full,
      policy_changes: policyChanges,
      attendance_recalculated: attendanceRecalc.sheets_recalculated,
      attendance_recalc_error: attendanceRecalc.recalc_error
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/pm-transfers', async (req, res, next) => {
  try {
    const { id } = req.params;

    const { data: existing, error: findErr } = await supabaseAdmin
      .from('clients')
      .select('id, created_by')
      .eq('id', id)
      .maybeSingle();
    if (findErr) throw findErr;
    if (!existing || existing.created_by !== req.user.id) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const { data: rows, error } = await supabaseAdmin
      .from('client_pm_transfers')
      .select('*')
      .eq('client_id', id)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;

    const userIds = new Set();
    for (const row of rows ?? []) {
      if (row.from_program_manager_id) userIds.add(row.from_program_manager_id);
      if (row.to_program_manager_id) userIds.add(row.to_program_manager_id);
      if (row.transferred_by) userIds.add(row.transferred_by);
    }

    let nameById = new Map();
    if (userIds.size) {
      const { data: users, error: uErr } = await supabaseAdmin
        .from('users')
        .select('id, name, email')
        .in('id', Array.from(userIds));
      if (uErr) throw uErr;
      nameById = new Map((users ?? []).map((u) => [u.id, u]));
    }

    res.json((rows ?? []).map((row) => ({
      ...row,
      from_program_manager_name: nameById.get(row.from_program_manager_id)?.name ?? null,
      to_program_manager_name: nameById.get(row.to_program_manager_id)?.name ?? null,
      transferred_by_name: nameById.get(row.transferred_by)?.name ?? null
    })));
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/program-manager', async (req, res, next) => {
  try {
    const { id } = req.params;
    const programManagerId = req.body?.program_manager_id;
    const reason = String(req.body?.reason ?? '').trim() || null;

    if (!programManagerId) {
      return res.status(400).json({ error: 'program_manager_id is required' });
    }

    const { data: existing, error: findErr } = await supabaseAdmin
      .from('clients')
      .select('id, created_by, program_manager_id')
      .eq('id', id)
      .maybeSingle();
    if (findErr) throw findErr;
    if (!existing || existing.created_by !== req.user.id) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const { data: pm, error: pmErr } = await supabaseAdmin
      .from('users')
      .select('id, role, name')
      .eq('id', programManagerId)
      .maybeSingle();
    if (pmErr) throw pmErr;
    if (!pm || pm.role !== 'PROGRAM_MANAGER') {
      return res.status(400).json({ error: 'Invalid program_manager_id' });
    }

    if (existing.program_manager_id === programManagerId) {
      const full = await fetchClientWithRelations(id);
      return res.json(full);
    }

    const { error: updateErr } = await supabaseAdmin
      .from('clients')
      .update({ program_manager_id: programManagerId })
      .eq('id', id);
    if (updateErr) throw updateErr;

    const { error: logErr } = await supabaseAdmin.from('client_pm_transfers').insert({
      client_id: id,
      from_program_manager_id: existing.program_manager_id,
      to_program_manager_id: programManagerId,
      transferred_by: req.user.id,
      reason
    });
    if (logErr) throw logErr;

    const full = await fetchClientWithRelations(id);
    res.json(full);
  } catch (err) {
    next(err);
  }
});

export default router;
