/**
 * One-off test: build PM digest for Rahul Sharma and email it to a target inbox
 * via send-attendance-email (same mailer the edge digest uses).
 *
 * Usage:
 *   node --use-system-ca scripts/test-remaining-task-digest-mail.mjs
 */
import 'dotenv/config';

const SUPABASE_URL = String(process.env.SUPABASE_URL ?? '').trim();
const SERVICE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
const FRONTEND_URL = String(process.env.FRONTEND_URL || 'http://localhost:8088').trim();
const TARGET_EMAIL = String(process.env.TEST_DIGEST_TO || 'sahil.vohra@awign.com').trim();
const PM_NAME = 'Rahul Sharma';
const PM_DECIDED = new Set(['APPROVED', 'REJECTED', 'CORRECTION_REQUESTED']);

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json'
};

async function rest(path) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`${path} -> ${resp.status} ${text}`);
  return text ? JSON.parse(text) : [];
}

function todayDateInIST() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

async function main() {
  const users = await rest(
    `users?role=eq.PROGRAM_MANAGER&name=eq.${encodeURIComponent(PM_NAME)}&select=id,name,email`
  );
  const pm = users[0];
  if (!pm) throw new Error(`PM not found: ${PM_NAME}`);

  const clients = await rest(
    `clients?program_manager_id=eq.${pm.id}&select=id,client_name`
  );
  if (!clients.length) throw new Error('PM has no clients');

  const clientIds = clients.map((c) => c.id);
  const clientFilter = `client_id=in.(${clientIds.join(',')})`;
  const employees = await rest(
    `employees?${clientFilter}&select=id,client_id,onboarding_initiated,onboarding_status,date_of_joining,joining_status`
  );
  const empIds = employees.map((e) => e.id);
  const forms = empIds.length
    ? await rest(
        `job_app_form?employee_id=in.(${empIds.join(',')})&select=employee_id,submission_status,review_status,payroll_review_status`
      )
    : [];
  const formMap = new Map(forms.map((f) => [f.employee_id, f]));
  const today = todayDateInIST();

  const byClient = new Map(
    clients.map((c) => [
      c.id,
      {
        client_name: c.client_name || 'Client',
        awaiting_pm_review: 0,
        pl_rejected: 0,
        joining_today: 0,
        joining_overdue: 0,
        submission_pending: 0,
        role_assigned: 0
      }
    ])
  );

  for (const emp of employees) {
    const bucket = byClient.get(emp.client_id);
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
    if (emp.onboarding_initiated && submissionStatus !== 'Submitted') {
      bucket.submission_pending += 1;
    }
    if (onboardingStatus === 'ROLE_ASSIGNED') bucket.role_assigned += 1;

    const joining = String(emp.joining_status ?? '').trim();
    const doj = String(emp.date_of_joining ?? '').trim();
    if (!joining && doj && payrollReviewStatus === 'PAYROLL_APPROVED') {
      if (doj === today) bucket.joining_today += 1;
      else if (doj < today) bucket.joining_overdue += 1;
    }
  }

  const actionable = [...byClient.values()].filter(
    (c) =>
      c.awaiting_pm_review + c.pl_rejected + c.joining_today + c.joining_overdue > 0
  );

  // For forced test send, include FYI-only clients if nothing actionable
  const clientsForEmail = (actionable.length ? actionable : [...byClient.values()])
    .filter(
      (c) =>
        c.awaiting_pm_review +
          c.pl_rejected +
          c.joining_today +
          c.joining_overdue +
          c.submission_pending +
          c.role_assigned >
        0
    )
    .sort((a, b) => a.client_name.localeCompare(b.client_name));

  if (!clientsForEmail.length) {
    // Still send a sample so the mail path is verified
    clientsForEmail.push({
      client_name: 'Sample (no pending items found)',
      awaiting_pm_review: 0,
      pl_rejected: 0,
      joining_today: 0,
      joining_overdue: 0,
      submission_pending: 0,
      role_assigned: 0
    });
  }

  const dashboardUrl = `${FRONTEND_URL.replace(/\/+$/, '')}/pm-dashboard`;
  const lines = [];
  const textLines = [
    `Hi ${PM_NAME},`,
    '',
    '(Test digest — mailed to your inbox via send-attendance-email)',
    'Here is your remaining onboarding work summary:',
    ''
  ];

  for (const c of clientsForEmail) {
    const items = [];
    if (c.awaiting_pm_review) items.push(`${c.awaiting_pm_review} form(s) awaiting your review`);
    if (c.pl_rejected) items.push(`${c.pl_rejected} PL-rejected item(s) needing attention`);
    if (c.joining_today) items.push(`${c.joining_today} joining status due today`);
    if (c.joining_overdue) items.push(`${c.joining_overdue} joining status overdue`);
    if (c.submission_pending) {
      items.push(`${c.submission_pending} form submission(s) pending (employee)`);
    }
    if (c.role_assigned) items.push(`${c.role_assigned} role assigned — form not sent`);
    if (!items.length) items.push('No pending counts (forced test send)');
    lines.push(
      `<p style="margin:16px 0 6px;font-weight:700;">${escapeHtml(c.client_name)}</p><ul style="margin:0 0 0 18px;padding:0;">${items
        .map((item) => `<li style="margin:4px 0;">${escapeHtml(item)}</li>`)
        .join('')}</ul>`
    );
    textLines.push(`${c.client_name}:`);
    for (const item of items) textLines.push(`  - ${item}`);
    textLines.push('');
  }
  textLines.push(`Open your dashboard: ${dashboardUrl}`, '', '- Team Awign');

  const html = [
    `<p>Hi ${escapeHtml(PM_NAME)},</p>`,
    '<p><em>Test digest for Rahul Sharma — delivered to your inbox.</em></p>',
    '<p>Here is your remaining onboarding work summary:</p>',
    ...lines,
    `<p style="margin-top:20px;"><a href="${escapeHtml(dashboardUrl)}">Open PM dashboard</a></p>`
  ].join('\n');

  const mailResp = await fetch(`${SUPABASE_URL}/functions/v1/send-attendance-email`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      subject: 'Awign — remaining onboarding tasks (TEST)',
      recipients: [
        {
          name: PM_NAME,
          email: TARGET_EMAIL,
          html,
          text: textLines.join('\n')
        }
      ]
    })
  });
  const mailRaw = await mailResp.text();
  console.log('mailer_status', mailResp.status);
  console.log(mailRaw);
  console.log('pm', { id: pm.id, name: pm.name, stored_email: pm.email });
  console.log('sent_to', TARGET_EMAIL);
  console.log('clients_in_email', clientsForEmail.length, 'actionable', actionable.length);
  if (!mailResp.ok) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
