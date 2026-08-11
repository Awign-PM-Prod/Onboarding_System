import { Router } from 'express';
import { supabaseAdmin } from '../supabase.js';
import { requireRole } from '../middleware/requireRole.js';
import { classifyDojReminderBucket, todayDateInIST } from '../utils/workingDays.js';

const router = Router();

router.use(requireRole('PROGRAM_MANAGER'));

const PM_DECIDED = new Set(['APPROVED', 'REJECTED', 'CORRECTION_REQUESTED']);

const PRIMARY_REMARK_FIELDS = [
  ['PL_REJECTED', 'pl_rejected'],
  ['AWAITING_PM_REVIEW', 'awaiting_pm_review'],
  ['DATE_JOINING_EXTENDED', 'date_joining_extended'],
  ['JOINING_OVERDUE', 'joining_overdue'],
  ['CORRECTION_REQUESTED', 'correction_requested'],
  ['PENDING_ONBOARDING', 'pending_onboarding'],
];

function emptyActionCounts() {
  return {
    pending_onboarding: 0,
    pl_rejected: 0,
    date_joining_extended: 0,
    awaiting_pm_review: 0,
    correction_requested: 0,
    joining_overdue: 0,
    joining_due: 0,
  };
}

function openChangeCount(counts) {
  return (
    counts.pending_onboarding +
    counts.pl_rejected +
    counts.date_joining_extended +
    counts.awaiting_pm_review +
    counts.correction_requested +
    counts.joining_overdue +
    counts.joining_due
  );
}

function primaryRemarkFromCounts(counts) {
  for (const [remark, field] of PRIMARY_REMARK_FIELDS) {
    if ((counts[field] ?? 0) > 0) return remark;
  }
  return null;
}

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
    const [
      { data: desigs, error: dErr },
      { data: employees, error: eErr },
      { data: dojExtendPending, error: dojErr },
    ] = await Promise.all([
      supabaseAdmin
        .from('designations')
        .select('client_id, name, skill_level')
        .in('client_id', ids),
      supabaseAdmin
        .from('employees')
        .select(
          'id, client_id, onboarding_initiated, onboarding_status, date_of_joining, joining_status, doj_extend_unlock'
        )
        .in('client_id', ids),
      supabaseAdmin
        .from('doj_extend_requests')
        .select('employee_id, client_id')
        .in('client_id', ids)
        .eq('status', 'PENDING'),
    ]);
    if (dErr) throw dErr;
    if (eErr) throw eErr;
    if (dojErr) throw dojErr;

    const byClient = new Map();
    for (const d of desigs ?? []) {
      if (!byClient.has(d.client_id)) byClient.set(d.client_id, []);
      byClient.get(d.client_id).push({
        name: d.name,
        skill_level: d.skill_level || 'UNSKILLED'
      });
    }

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

    const pendingDojEmployeeIds = new Set(
      (dojExtendPending ?? []).map((r) => r.employee_id)
    );

    const actionByClient = new Map(ids.map((id) => [id, emptyActionCounts()]));
    const today = todayDateInIST();

    for (const emp of employeeRows) {
      const counts = actionByClient.get(emp.client_id);
      if (!counts) continue;

      const form = formMap.get(emp.id);
      const submissionStatus = String(form?.submission_status ?? '').trim();
      const reviewStatus = String(form?.review_status ?? '').trim().toUpperCase();
      const payrollReviewStatus = String(form?.payroll_review_status ?? '').trim();
      const onboardingStatus = String(emp.onboarding_status ?? '').trim().toUpperCase();

      if (!emp.onboarding_initiated || onboardingStatus === 'ROLE_ASSIGNED') {
        counts.pending_onboarding += 1;
      }
      if (reviewStatus === 'APPROVED' && payrollReviewStatus === 'PAYROLL_REJECTED') {
        counts.pl_rejected += 1;
      }
      if (
        pendingDojEmployeeIds.has(emp.id) ||
        Boolean(emp.doj_extend_unlock)
      ) {
        counts.date_joining_extended += 1;
      }
      if (submissionStatus === 'Submitted' && !PM_DECIDED.has(reviewStatus)) {
        counts.awaiting_pm_review += 1;
      }
      if (reviewStatus === 'CORRECTION_REQUESTED') {
        counts.correction_requested += 1;
      }

      const joining = String(emp.joining_status ?? '').trim();
      const doj = String(emp.date_of_joining ?? '').trim();
      if (!joining && doj && payrollReviewStatus === 'PAYROLL_APPROVED') {
        const bucket = classifyDojReminderBucket(doj, today);
        if (bucket === 'overdue') counts.joining_overdue += 1;
        else if (bucket === 'within_2_days') counts.joining_due += 1;
      }
    }

    res.json(clients.map(c => {
      const action_counts = actionByClient.get(c.id) ?? emptyActionCounts();
      return {
        ...c,
        designations: byClient.get(c.id) ?? [],
        action_counts,
        open_change_count: openChangeCount(action_counts),
        primary_remark: primaryRemarkFromCounts(action_counts),
      };
    }));
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

// GET /api/pm/clients/dashboard-stats
// Optional query: from, to (YYYY-MM-DD) — scopes to employees created in that inclusive range.
// Optional query: client_id — restrict stats to a single assigned client.
router.get('/dashboard-stats', async (req, res, next) => {
  try {
    const fromRaw = String(req.query.from ?? '').trim();
    const toRaw = String(req.query.to ?? '').trim();
    const filterClientId = String(req.query.client_id ?? '').trim() || null;
    const isoDay = /^\d{4}-\d{2}-\d{2}$/;
    if (fromRaw && !isoDay.test(fromRaw)) {
      return res.status(400).json({ error: 'from must be YYYY-MM-DD.' });
    }
    if (toRaw && !isoDay.test(toRaw)) {
      return res.status(400).json({ error: 'to must be YYYY-MM-DD.' });
    }
    if (fromRaw && toRaw && fromRaw > toRaw) {
      return res.status(400).json({ error: 'from must be on or before to.' });
    }
    const dateFiltered = Boolean(fromRaw || toRaw);

    let clientsQuery = supabaseAdmin
      .from('clients')
      .select('id, client_name, contract_code')
      .eq('program_manager_id', req.user.id)
      .order('client_name', { ascending: true });
    if (filterClientId) {
      clientsQuery = clientsQuery.eq('id', filterClientId);
    }
    const { data: clients, error: cErr } = await clientsQuery;
    if (cErr) throw cErr;

    const clientRows = clients ?? [];
    if (clientRows.length === 0) {
      return res.json({ totals: emptyCounts(), clients: [] });
    }

    const clientIds = clientRows.map((c) => c.id);
    const clientIdSet = new Set(clientIds);

    let empQuery = supabaseAdmin
      .from('employees')
      .select('id, client_id, onboarding_initiated, created_at');
    if (dateFiltered) {
      if (fromRaw) empQuery = empQuery.gte('created_at', `${fromRaw}T00:00:00.000Z`);
      if (toRaw) empQuery = empQuery.lte('created_at', `${toRaw}T23:59:59.999Z`);
      if (filterClientId) empQuery = empQuery.eq('client_id', filterClientId);
    } else {
      empQuery = empQuery.in('client_id', clientIds);
    }

    const { data: employees, error: eErr } = await empQuery;
    if (eErr) throw eErr;

    const employeeRows = (employees ?? []).filter((e) => clientIdSet.has(e.client_id));
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

    const clientsWithEmployees = new Set();
    const byClient = new Map(
      clientRows.map((c) => [
        c.id,
        {
          ...emptyCounts(),
          client_id: c.id,
          client_name: c.client_name,
          contract_code: c.contract_code
        }
      ])
    );
    const totals = emptyCounts();
    for (const employee of employeeRows) {
      const current = byClient.get(employee.client_id);
      if (!current) continue;
      clientsWithEmployees.add(employee.client_id);
      const form = formMap.get(employee.id);
      applyCounts(current, employee, form);
      applyCounts(totals, employee, form);
    }

    const resultClients = dateFiltered
      ? clientRows.filter((c) => clientsWithEmployees.has(c.id)).map((c) => byClient.get(c.id))
      : clientRows.map((c) => byClient.get(c.id));

    return res.json({
      totals,
      clients: resultClients
    });
  } catch (err) {
    next(err);
  }
});

router.get('/joining-status-reminders', async (req, res, next) => {
  try {
    const payload = await buildJoiningStatusReminderPayload(req.user.id);
    return res.json(payload);
  } catch (err) {
    next(err);
  }
});

router.get('/joining-status-reminders/export', async (req, res, next) => {
  try {
    const clientId = String(req.query.client_id ?? '').trim();
    const bucketRaw = String(req.query.bucket ?? 'within_2_days').trim().toLowerCase();
    const bucket = bucketRaw === 'overdue' ? 'overdue' : 'within_2_days';

    if (!clientId) {
      return res.status(400).json({ error: 'client_id is required.' });
    }

    const { data: client, error: cErr } = await supabaseAdmin
      .from('clients')
      .select('id, client_name, program_manager_id')
      .eq('id', clientId)
      .maybeSingle();
    if (cErr) throw cErr;
    if (!client || client.program_manager_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized for this client' });
    }

    const payload = await buildJoiningStatusReminderPayload(req.user.id, { clientId });
    const rows = bucket === 'overdue' ? payload.overdue : payload.within_2_days;
    const clientRow = rows.find((r) => r.client_id === clientId);
    const employees = Array.isArray(clientRow?.employees) ? clientRow.employees : [];

    const escapeCsv = (value) => {
      const s = String(value ?? '');
      if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };

    const header = [
      'Client Name',
      'Employee Name',
      'Mobile',
      'Email',
      'Reference ID',
      'Emp Code',
      'Expected DOJ',
      'Bucket',
    ];
    const bucketLabel = bucket === 'overdue' ? 'Overdue' : 'Within 2 working days';
    const lines = [header.join(',')];
    for (const emp of employees) {
      lines.push(
        [
          client.client_name,
          emp.name,
          emp.mobile,
          emp.email,
          emp.reference_id,
          emp.emp_code,
          emp.date_of_joining,
          bucketLabel,
        ]
          .map(escapeCsv)
          .join(',')
      );
    }

    const filename = `joining-reminder-${bucket}-${clientId.slice(0, 8)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(`${lines.join('\n')}\n`);
  } catch (err) {
    next(err);
  }
});

async function buildJoiningStatusReminderPayload(pmUserId, { clientId = null } = {}) {
  let clientsQuery = supabaseAdmin
    .from('clients')
    .select('id, client_name')
    .eq('program_manager_id', pmUserId)
    .order('client_name', { ascending: true });
  if (clientId) clientsQuery = clientsQuery.eq('id', clientId);

  const { data: clients, error: cErr } = await clientsQuery;
  if (cErr) throw cErr;

  const clientRows = clients ?? [];
  if (clientRows.length === 0) {
    return { within_2_days: [], overdue: [], today: [] };
  }

  const clientIds = clientRows.map((c) => c.id);
  const clientNameMap = new Map(clientRows.map((c) => [c.id, c.client_name]));

  const { data: employees, error: eErr } = await supabaseAdmin
    .from('employees')
    .select(
      'id, client_id, name, mobile, email, reference_id, emp_code, date_of_joining, joining_status, doj_extend_unlock'
    )
    .in('client_id', clientIds)
    .not('date_of_joining', 'is', null);
  if (eErr) throw eErr;

  const pendingJoinEmployees = (employees ?? []).filter((row) => {
    const joining = String(row.joining_status ?? '').trim();
    return joining.length === 0;
  });
  if (pendingJoinEmployees.length === 0) {
    return { within_2_days: [], overdue: [], today: [] };
  }

  const pendingIds = pendingJoinEmployees.map((row) => row.id);
  const [{ data: forms, error: fErr }, { data: pendingReqs, error: pendingErr }] = await Promise.all([
    supabaseAdmin
      .from('job_app_form')
      .select('employee_id, payroll_review_status')
      .in('employee_id', pendingIds),
    supabaseAdmin
      .from('doj_extend_requests')
      .select('employee_id')
      .in('employee_id', pendingIds)
      .eq('status', 'PENDING'),
  ]);
  if (fErr) throw fErr;
  if (pendingErr) {
    // Table may be missing before migration; treat as no pending requests.
    console.warn('[pmClients] doj_extend_requests lookup skipped:', pendingErr.message || pendingErr);
  }

  const payrollApprovedSet = new Set(
    (forms ?? [])
      .filter((row) => String(row.payroll_review_status ?? '').trim() === 'PAYROLL_APPROVED')
      .map((row) => row.employee_id)
  );
  const pendingExtendSet = new Set((pendingReqs ?? []).map((r) => r.employee_id));

  const today = todayDateInIST();
  const withinByClient = new Map();
  const overdueByClient = new Map();

  const toEmployeePayload = (row) => ({
    id: row.id,
    name: row.name ?? '',
    mobile: row.mobile ?? '',
    email: row.email ?? '',
    reference_id: row.reference_id ?? '',
    emp_code: row.emp_code ?? '',
    date_of_joining: row.date_of_joining,
    doj_extend_request_pending: pendingExtendSet.has(row.id),
    doj_extend_unlock: Boolean(row.doj_extend_unlock),
  });

  for (const row of pendingJoinEmployees) {
    if (!payrollApprovedSet.has(row.id)) continue;
    const doj = String(row.date_of_joining ?? '').trim();
    if (!doj) continue;
    const bucket = classifyDojReminderBucket(doj, today);
    const map = bucket === 'within_2_days' ? withinByClient : bucket === 'overdue' ? overdueByClient : null;
    if (!map) continue;
    if (!map.has(row.client_id)) map.set(row.client_id, []);
    map.get(row.client_id).push(toEmployeePayload(row));
  }

  const toPayload = (byClient, dojLabel) =>
    Array.from(byClient.entries())
      .map(([cid, emps]) => ({
        client_id: cid,
        client_name: clientNameMap.get(cid) ?? 'Client',
        doj_label: dojLabel,
        employee_count: emps.length,
        employees: emps.sort((a, b) => String(a.name).localeCompare(String(b.name))),
      }))
      .sort((a, b) => a.client_name.localeCompare(b.client_name));

  const withinRows = toPayload(withinByClient, 'Within 2 working days');
  const overdueRows = toPayload(overdueByClient, 'Overdue');

  return {
    within_2_days: withinRows,
    today: withinRows,
    overdue: overdueRows,
  };
}

router.get('/doj-extend-request-updates', async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('doj_extend_requests')
      .select('id, employee_id, client_id, status, reason, review_note, reviewed_at, created_at')
      .eq('requested_by', req.user.id)
      .in('status', ['APPROVED', 'REJECTED'])
      .is('pm_acked_at', null)
      .order('reviewed_at', { ascending: false })
      .limit(50);
    if (error) throw error;

    const rows = data ?? [];
    if (rows.length === 0) return res.json({ updates: [] });

    const employeeIds = [...new Set(rows.map((r) => r.employee_id))];
    const clientIds = [...new Set(rows.map((r) => r.client_id))];

    const [{ data: employees }, { data: clients }] = await Promise.all([
      supabaseAdmin.from('employees').select('id, name, date_of_joining, doj_extend_unlock').in('id', employeeIds),
      supabaseAdmin.from('clients').select('id, client_name').in('id', clientIds),
    ]);

    const empMap = new Map((employees ?? []).map((e) => [e.id, e]));
    const clientMap = new Map((clients ?? []).map((c) => [c.id, c.client_name]));

    return res.json({
      updates: rows.map((r) => {
        const emp = empMap.get(r.employee_id);
        return {
          id: r.id,
          employee_id: r.employee_id,
          employee_name: emp?.name ?? 'Employee',
          client_id: r.client_id,
          client_name: clientMap.get(r.client_id) ?? 'Client',
          status: r.status,
          reason: r.reason,
          review_note: r.review_note,
          reviewed_at: r.reviewed_at,
          date_of_joining: emp?.date_of_joining ?? null,
          doj_extend_unlock: Boolean(emp?.doj_extend_unlock),
        };
      }),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/doj-extend-request-updates/ack', async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body?.ids)
      ? [...new Set(req.body.ids.map((id) => String(id ?? '').trim()).filter(Boolean))]
      : [];
    if (ids.length === 0) {
      return res.status(400).json({ error: 'ids required (non-empty array)' });
    }

    const now = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from('doj_extend_requests')
      .update({ pm_acked_at: now, updated_at: now })
      .in('id', ids)
      .eq('requested_by', req.user.id)
      .in('status', ['APPROVED', 'REJECTED'])
      .is('pm_acked_at', null)
      .select('id');
    if (error) throw error;

    return res.json({ acked: (data ?? []).length, ids: (data ?? []).map((r) => r.id) });
  } catch (err) {
    next(err);
  }
});

export default router;
