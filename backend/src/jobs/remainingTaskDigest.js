import { supabaseAdmin } from '../supabase.js';
import { invokeResendEmail } from '../utils/sendEmail.js';

const FRONTEND_URL = String(process.env.FRONTEND_URL || 'http://localhost:8088').trim() || 'http://localhost:8088';

const PM_DECIDED = new Set(['APPROVED', 'REJECTED', 'CORRECTION_REQUESTED']);
const JOINED_STATUSES = new Set(['JOINED', 'JOINED_OTHER_DATE']);

function todayDateInIST() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

function frontendBase() {
  return FRONTEND_URL.replace(/\/+$/, '');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function emptyPmClientBucket(client) {
  return {
    client_id: client.id,
    client_name: client.client_name || 'Client',
    awaiting_pm_review: 0,
    pl_rejected: 0,
    joining_today: 0,
    joining_overdue: 0,
    submission_pending: 0,
    role_assigned: 0,
    correction_requested: 0
  };
}

function emptyPlClientBucket(client) {
  return {
    client_id: client.id,
    client_name: client.client_name || 'Client',
    pending_pl_review: 0,
    missing_uan: 0,
    unlock_pending: 0
  };
}

function pmActionableTotal(bucket) {
  return (
    bucket.awaiting_pm_review +
    bucket.pl_rejected +
    bucket.joining_today +
    bucket.joining_overdue +
    bucket.submission_pending +
    bucket.role_assigned +
    bucket.correction_requested
  );
}

function plActionableTotal(bucket) {
  return bucket.pending_pl_review + bucket.missing_uan + bucket.unlock_pending;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function fetchInBatches(table, select, column, ids, applyFilters = (q) => q) {
  if (!ids.length) return [];
  const rows = [];
  for (const batch of chunk(ids, 200)) {
    const query = applyFilters(supabaseAdmin.from(table).select(select).in(column, batch));
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...(data ?? []));
  }
  return rows;
}

function remarksBlocks(remarks) {
  const text = String(remarks ?? '').trim();
  if (!text) return { html: '', textLines: [] };
  const escaped = escapeHtml(text).replace(/\n/g, '<br/>');
  return {
    html: `<p style="margin:16px 0;padding:12px 14px;border-left:3px solid #334155;background:#f8fafc;"><strong>Note from Super Admin:</strong><br/>${escaped}</p>`,
    textLines: ['Note from Super Admin:', text, '']
  };
}

function buildPmEmail({ name, clients, dashboardUrl, remarks }) {
  const note = remarksBlocks(remarks);
  const lines = [];
  const textLines = [
    `Hi ${name || 'there'},`,
    '',
    ...note.textLines,
    'Here is your remaining onboarding work summary:',
    ''
  ];

  for (const c of clients) {
    const items = [];
    if (c.awaiting_pm_review) items.push(`${c.awaiting_pm_review} form(s) awaiting your review`);
    if (c.pl_rejected) items.push(`${c.pl_rejected} PL-rejected item(s) needing attention`);
    if (c.joining_today) items.push(`${c.joining_today} joining status due today`);
    if (c.joining_overdue) items.push(`${c.joining_overdue} joining status overdue`);
    if (c.submission_pending) items.push(`${c.submission_pending} form submission(s) pending (employee)`);
    if (c.role_assigned) items.push(`${c.role_assigned} role assigned — form not sent`);
    if (c.correction_requested) {
      items.push(`${c.correction_requested} correction(s) awaiting employee update`);
    }
    if (!items.length) continue;

    lines.push(
      `<p style="margin:16px 0 6px;font-weight:700;">${escapeHtml(c.client_name)}</p><ul style="margin:0 0 0 18px;padding:0;">${items
        .map((item) => `<li style="margin:4px 0;">${escapeHtml(item)}</li>`)
        .join('')}</ul>`
    );
    textLines.push(`${c.client_name}:`);
    for (const item of items) textLines.push(`  - ${item}`);
    textLines.push('');
  }

  textLines.push(`Open your dashboard: ${dashboardUrl}`);
  textLines.push('');
  textLines.push('- Team Awign');

  return {
    subject: 'Awign — remaining onboarding tasks',
    html: [
      `<p>Hi ${escapeHtml(name || 'there')},</p>`,
      note.html,
      '<p>Here is your remaining onboarding work summary:</p>',
      ...lines,
      `<p style="margin-top:20px;"><a href="${escapeHtml(dashboardUrl)}">Open PM dashboard</a></p>`
    ]
      .filter(Boolean)
      .join('\n'),
    text: textLines.join('\n')
  };
}

function buildPlEmail({ name, clients, dashboardUrl, remarks }) {
  const note = remarksBlocks(remarks);
  const lines = [];
  const textLines = [
    `Hi ${name || 'there'},`,
    '',
    ...note.textLines,
    'Here is your remaining payroll work summary:',
    ''
  ];

  for (const c of clients) {
    const items = [];
    if (c.pending_pl_review) items.push(`${c.pending_pl_review} employee(s) awaiting PL review`);
    if (c.missing_uan) items.push(`${c.missing_uan} joined employee(s) missing UAN`);
    if (c.unlock_pending) items.push(`${c.unlock_pending} attendance unlock request(s) pending`);
    if (!items.length) continue;

    lines.push(
      `<p style="margin:16px 0 6px;font-weight:700;">${escapeHtml(c.client_name)}</p><ul style="margin:0 0 0 18px;padding:0;">${items
        .map((item) => `<li style="margin:4px 0;">${escapeHtml(item)}</li>`)
        .join('')}</ul>`
    );
    textLines.push(`${c.client_name}:`);
    for (const item of items) textLines.push(`  - ${item}`);
    textLines.push('');
  }

  textLines.push(`Open your dashboard: ${dashboardUrl}`);
  textLines.push('');
  textLines.push('- Team Awign');

  return {
    subject: 'Awign — remaining payroll tasks',
    html: [
      `<p>Hi ${escapeHtml(name || 'there')},</p>`,
      note.html,
      '<p>Here is your remaining payroll work summary:</p>',
      ...lines,
      `<p style="margin-top:20px;"><a href="${escapeHtml(dashboardUrl)}">Open payroll dashboard</a></p>`
    ]
      .filter(Boolean)
      .join('\n'),
    text: textLines.join('\n')
  };
}

async function buildPmDigests(users, todayIst) {
  const pmUsers = users.filter((u) => u.role === 'PROGRAM_MANAGER');
  if (!pmUsers.length) return [];

  const clients = await fetchInBatches(
    'clients',
    'id, client_name, program_manager_id',
    'program_manager_id',
    pmUsers.map((u) => u.id)
  );
  if (!clients.length) return [];

  const clientIds = clients.map((c) => c.id);
  const employees = await fetchInBatches(
    'employees',
    'id, client_id, onboarding_initiated, onboarding_status, date_of_joining, joining_status',
    'client_id',
    clientIds
  );
  const forms = await fetchInBatches(
    'job_app_form',
    'employee_id, submission_status, review_status, payroll_review_status',
    'employee_id',
    employees.map((e) => e.id)
  );
  const formMap = new Map(forms.map((f) => [f.employee_id, f]));

  const byPm = new Map();
  for (const client of clients) {
    if (!byPm.has(client.program_manager_id)) byPm.set(client.program_manager_id, new Map());
    byPm.get(client.program_manager_id).set(client.id, emptyPmClientBucket(client));
  }

  const clientToPm = new Map(clients.map((c) => [c.id, c.program_manager_id]));

  for (const emp of employees) {
    const pmId = clientToPm.get(emp.client_id);
    const clientMap = byPm.get(pmId);
    if (!clientMap) continue;
    const bucket = clientMap.get(emp.client_id);
    if (!bucket) continue;

    const form = formMap.get(emp.id);
    const submissionStatus = String(form?.submission_status ?? '').trim();
    const reviewStatus = String(form?.review_status ?? '').trim().toUpperCase();
    const payrollReviewStatus = String(form?.payroll_review_status ?? '').trim();
    const onboardingStatus = String(emp.onboarding_status ?? '').trim().toUpperCase();

    if (submissionStatus === 'Submitted' && !PM_DECIDED.has(reviewStatus)) {
      bucket.awaiting_pm_review += 1;
    }
    if (reviewStatus === 'APPROVED' && payrollReviewStatus === 'PAYROLL_REJECTED') {
      bucket.pl_rejected += 1;
    }
    if (reviewStatus === 'CORRECTION_REQUESTED') {
      bucket.correction_requested += 1;
    }
    if (emp.onboarding_initiated && submissionStatus !== 'Submitted') {
      bucket.submission_pending += 1;
    }
    if (onboardingStatus === 'ROLE_ASSIGNED') bucket.role_assigned += 1;

    const joining = String(emp.joining_status ?? '').trim();
    const doj = String(emp.date_of_joining ?? '').trim();
    if (!joining && doj && payrollReviewStatus === 'PAYROLL_APPROVED') {
      if (doj === todayIst) bucket.joining_today += 1;
      else if (doj < todayIst) bucket.joining_overdue += 1;
    }
  }

  const digests = [];
  for (const user of pmUsers) {
    const clientMap = byPm.get(user.id);
    if (!clientMap) continue;
    const actionableClients = Array.from(clientMap.values())
      .filter((c) => pmActionableTotal(c) > 0)
      .sort((a, b) => a.client_name.localeCompare(b.client_name));
    if (!actionableClients.length) continue;

    digests.push({
      user,
      role: 'PROGRAM_MANAGER',
      clients: actionableClients,
      dashboardUrl: `${frontendBase()}/pm-dashboard`
    });
  }
  return digests;
}

async function buildPlDigests(users) {
  const plUsers = users.filter((u) => u.role === 'PAYROLL_LEAD');
  if (!plUsers.length) return [];

  const clients = await fetchInBatches(
    'clients',
    'id, client_name, created_by',
    'created_by',
    plUsers.map((u) => u.id)
  );
  if (!clients.length) return [];

  const clientIds = clients.map((c) => c.id);
  const clientToPl = new Map(clients.map((c) => [c.id, c.created_by]));

  const employees = await fetchInBatches(
    'employees',
    'id, client_id, joining_status, payroll_pf_uan_number',
    'client_id',
    clientIds
  );
  const forms = await fetchInBatches(
    'job_app_form',
    'employee_id, payroll_review_status',
    'employee_id',
    employees.map((e) => e.id)
  );
  const formMap = new Map(forms.map((f) => [f.employee_id, f]));

  const sheets = await fetchInBatches(
    'attendance_sheets',
    'id, client_id, unlock_request_status',
    'client_id',
    clientIds,
    (q) => q.eq('unlock_request_status', 'PENDING')
  );

  const byPl = new Map();
  for (const client of clients) {
    if (!byPl.has(client.created_by)) byPl.set(client.created_by, new Map());
    byPl.get(client.created_by).set(client.id, emptyPlClientBucket(client));
  }

  for (const emp of employees) {
    const plId = clientToPl.get(emp.client_id);
    const clientMap = byPl.get(plId);
    if (!clientMap) continue;
    const bucket = clientMap.get(emp.client_id);
    if (!bucket) continue;

    const form = formMap.get(emp.id);
    if (String(form?.payroll_review_status ?? '').trim() === 'PENDING_PAYROLL_LEAD') {
      bucket.pending_pl_review += 1;
    }

    const joining = String(emp.joining_status ?? '').trim().toUpperCase();
    const uan = String(emp.payroll_pf_uan_number ?? '').trim();
    if (JOINED_STATUSES.has(joining) && !uan) bucket.missing_uan += 1;
  }

  for (const sheet of sheets) {
    const plId = clientToPl.get(sheet.client_id);
    const clientMap = byPl.get(plId);
    if (!clientMap) continue;
    const bucket = clientMap.get(sheet.client_id);
    if (!bucket) continue;
    bucket.unlock_pending += 1;
  }

  const digests = [];
  for (const user of plUsers) {
    const clientMap = byPl.get(user.id);
    if (!clientMap) continue;
    const actionableClients = Array.from(clientMap.values())
      .filter((c) => plActionableTotal(c) > 0)
      .sort((a, b) => a.client_name.localeCompare(b.client_name));
    if (!actionableClients.length) continue;
    digests.push({
      user,
      role: 'PAYROLL_LEAD',
      clients: actionableClients,
      dashboardUrl: `${frontendBase()}/dashboard`
    });
  }
  return digests;
}

/**
 * @param {{ userIds?: string[], remarks?: string }} [options]
 * @returns {Promise<{ sent: number, skipped: number, failed: number, details: Array<object> }>}
 */
export async function runRemainingTaskDigest({ userIds, remarks } = {}) {
  let query = supabaseAdmin
    .from('users')
    .select('id, name, email, role')
    .in('role', ['PROGRAM_MANAGER', 'PAYROLL_LEAD']);

  const filterIds = Array.isArray(userIds)
    ? [...new Set(userIds.map((id) => String(id || '').trim()).filter(Boolean))]
    : null;
  const note = String(remarks ?? '').trim() || undefined;

  if (filterIds) {
    if (filterIds.length === 0) {
      return { sent: 0, skipped: 0, failed: 0, details: [] };
    }
    query = query.in('id', filterIds);
  }

  const { data: users, error } = await query;
  if (error) throw error;

  const userRows = users ?? [];
  const todayIst = todayDateInIST();
  const [pmDigests, plDigests] = await Promise.all([
    buildPmDigests(userRows, todayIst),
    buildPlDigests(userRows)
  ]);

  const digests = [...pmDigests, ...plDigests];
  const summary = { sent: 0, skipped: 0, failed: 0, details: [] };

  for (const digest of digests) {
    const email =
      digest.role === 'PROGRAM_MANAGER'
        ? buildPmEmail({
            name: digest.user.name,
            clients: digest.clients,
            dashboardUrl: digest.dashboardUrl,
            remarks: note
          })
        : buildPlEmail({
            name: digest.user.name,
            clients: digest.clients,
            dashboardUrl: digest.dashboardUrl,
            remarks: note
          });

    const result = await invokeResendEmail({
      toEmail: digest.user.email,
      toName: digest.user.name,
      subject: email.subject,
      html: email.html,
      text: email.text,
      logLabel: 'remaining-task-digest'
    });

    const detail = {
      user_id: digest.user.id,
      email: digest.user.email,
      role: digest.role,
      clients: digest.clients.length
    };

    if (result?.skipped) {
      summary.skipped += 1;
      summary.details.push({ ...detail, status: 'skipped', reason: result.reason || 'skipped' });
    } else if (result?.ok) {
      summary.sent += 1;
      summary.details.push({ ...detail, status: 'sent' });
    } else {
      summary.failed += 1;
      summary.details.push({ ...detail, status: 'failed', error: result?.error || 'unknown' });
    }
  }

  const emailedIds = new Set(digests.map((d) => d.user.id));
  summary.skipped += userRows.filter((u) => !emailedIds.has(u.id)).length;

  console.log(
    `[remaining-task-digest] done sent=${summary.sent} failed=${summary.failed} empty_or_skipped=${summary.skipped}`
  );
  return summary;
}
