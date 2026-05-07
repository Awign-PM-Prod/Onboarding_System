import { Router } from 'express';
import { supabaseAdmin } from '../supabase.js';
import { requireRole } from '../middleware/requireRole.js';

const router = Router();

router.use(requireRole('PROGRAM_MANAGER'));

router.get('/', async (req, res, next) => {
  try {
    const { data: clients, error } = await supabaseAdmin
      .from('clients')
      .select('*')
      .eq('program_manager_id', req.user.id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    if (clients.length === 0) return res.json([]);

    const ids = clients.map(c => c.id);
    const { data: desigs, error: dErr } = await supabaseAdmin
      .from('designations')
      .select('client_id, name')
      .in('client_id', ids);
    if (dErr) throw dErr;

    const byClient = new Map();
    for (const d of desigs) {
      if (!byClient.has(d.client_id)) byClient.set(d.client_id, []);
      byClient.get(d.client_id).push(d.name);
    }

    res.json(clients.map(c => ({
      ...c,
      designations: byClient.get(c.id) ?? []
    })));
  } catch (err) {
    next(err);
  }
});

function emptyCounts() {
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

function applyCounts(target, employeeRow, formRow) {
  const next = target;
  if (employeeRow?.onboarding_initiated) next.onboarding_activations += 1;

  const submissionStatus = String(formRow?.submission_status ?? '').trim();
  const reviewStatus = String(formRow?.review_status ?? '').trim();
  const payrollReviewStatus = String(formRow?.payroll_review_status ?? '').trim();

  if (submissionStatus === 'Submitted') next.employees_submitted += 1;
  else if (employeeRow?.onboarding_initiated) next.submission_pending += 1;

  if (reviewStatus === 'APPROVED') next.pm_approved += 1;
  if (reviewStatus === 'REJECTED') next.pm_rejected += 1;
  if (reviewStatus === 'CORRECTION_REQUESTED') next.pm_correction_requested += 1;

  if (payrollReviewStatus === 'PAYROLL_APPROVED') next.payroll_approved += 1;
  if (payrollReviewStatus === 'PAYROLL_REJECTED') next.payroll_rejected += 1;
}

router.get('/dashboard-stats', async (req, res, next) => {
  try {
    const { data: clients, error: cErr } = await supabaseAdmin
      .from('clients')
      .select('id, client_name, contract_code')
      .eq('program_manager_id', req.user.id)
      .order('client_name', { ascending: true });
    if (cErr) throw cErr;

    const clientRows = clients ?? [];
    if (clientRows.length === 0) {
      return res.json({ totals: emptyCounts(), clients: [] });
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

    const byClient = new Map(clientRows.map((c) => [c.id, { ...emptyCounts(), client_id: c.id, client_name: c.client_name, contract_code: c.contract_code }]));
    const totals = emptyCounts();
    for (const employee of employeeRows) {
      const current = byClient.get(employee.client_id);
      if (!current) continue;
      const form = formMap.get(employee.id);
      applyCounts(current, employee, form);
      applyCounts(totals, employee, form);
    }

    return res.json({
      totals,
      clients: clientRows.map((c) => byClient.get(c.id))
    });
  } catch (err) {
    next(err);
  }
});

export default router;
