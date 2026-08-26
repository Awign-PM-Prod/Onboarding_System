import { Router } from 'express';
import { supabaseAdmin } from '../supabase.js';
import { requireRole } from '../middleware/requireRole.js';
import { invokeResendEmailBatch } from '../utils/sendEmail.js';
import { logOrgActivityFromReq } from '../utils/orgActivityLog.js';
import { isProgramManagerForClient } from '../utils/clientProgramManagers.js';

const router = Router();

router.use(requireRole(['PROGRAM_MANAGER', 'SUPER_ADMIN']));

function isSuperAdminCaller(req) {
  return req.user?.role === 'SUPER_ADMIN';
}

const DEFAULT_SUBJECT = 'Update from Awign';
const MAX_MESSAGE_CHARS = 5000;
const MAX_BULK_RECIPIENTS = 200;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeEmail(value) {
  return String(value ?? '').trim().toLowerCase();
}

function isValidEmail(email) {
  return Boolean(email) && EMAIL_RE.test(email);
}

const MAX_COPY_EMAILS = 10;

function parseEmailList(raw) {
  if (Array.isArray(raw)) {
    return raw.flatMap((item) => parseEmailList(item));
  }
  return String(raw ?? '')
    .split(/[,;]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function normalizeCopyEmails(raw, { exclude = [], label = 'address' } = {}) {
  const excluded = new Set(
    (Array.isArray(exclude) ? exclude : [exclude])
      .map((item) => normalizeEmail(item))
      .filter(Boolean)
  );
  const emails = [];
  const seen = new Set(excluded);
  for (const email of parseEmailList(raw)) {
    if (seen.has(email)) continue;
    if (!isValidEmail(email)) {
      return { emails: [], error: `Invalid ${label}: ${email}` };
    }
    seen.add(email);
    emails.push(email);
    if (emails.length > MAX_COPY_EMAILS) {
      return { emails: [], error: `${label} supports at most ${MAX_COPY_EMAILS} addresses` };
    }
  }
  return { emails };
}

function buildAlertBodies({ name, message }) {
  const displayName = String(name || '').trim() || 'there';
  const safeName = escapeHtml(displayName);
  const safeMessageHtml = escapeHtml(message).replace(/\r\n|\r|\n/g, '<br/>');
  const html = `<p>Hi ${safeName},</p><p>${safeMessageHtml}</p>`;
  const text = `Hi ${displayName},\n\n${message}`;
  return { html, text };
}

function normalizeBulkRecipients(rawList) {
  const details = [];
  const recipients = [];
  const seen = new Set();

  for (const raw of Array.isArray(rawList) ? rawList : []) {
    const name = String(raw?.name ?? '').trim();
    const email = normalizeEmail(raw?.email);
    if (!email) {
      details.push({ email: '', name, status: 'skipped', reason: 'missing_email' });
      continue;
    }
    if (!isValidEmail(email)) {
      details.push({ email, name, status: 'skipped', reason: 'invalid_email' });
      continue;
    }
    if (seen.has(email)) {
      details.push({ email, name, status: 'skipped', reason: 'duplicate_email' });
      continue;
    }
    const ccResult = normalizeCopyEmails(raw?.cc, { exclude: [email], label: 'cc' });
    if (ccResult.error) {
      details.push({ email, name, status: 'skipped', reason: ccResult.error });
      continue;
    }
    const bccResult = normalizeCopyEmails(raw?.bcc, {
      exclude: [email, ...ccResult.emails],
      label: 'bcc'
    });
    if (bccResult.error) {
      details.push({ email, name, status: 'skipped', reason: bccResult.error });
      continue;
    }
    seen.add(email);
    recipients.push({ name, email, cc: ccResult.emails, bcc: bccResult.emails });
  }

  return { recipients, details };
}

const HISTORY_SEND_LIMIT = 50;
const RECIPIENT_STATUSES = new Set(['sent', 'failed', 'skipped']);

function countByStatus(details) {
  const rows = Array.isArray(details) ? details : [];
  return {
    sent: rows.filter((d) => d.status === 'sent').length,
    failed: rows.filter((d) => d.status === 'failed').length,
    skipped: rows.filter((d) => d.status === 'skipped').length
  };
}

async function persistAlertHistory({
  req,
  mode,
  subject,
  message,
  clientId,
  employeeId,
  details
}) {
  try {
    const counts = countByStatus(details);
    const { data: sendRow, error: sendErr } = await supabaseAdmin
      .from('pm_bulk_alert_sends')
      .insert({
        sender_user_id: req.user.id,
        mode,
        subject,
        message,
        client_id: clientId || null,
        employee_id: employeeId || null,
        sent_count: counts.sent,
        failed_count: counts.failed,
        skipped_count: counts.skipped
      })
      .select('id')
      .single();
    if (sendErr) throw sendErr;

    const recipientRows = (Array.isArray(details) ? details : []).map((d) => ({
      send_id: sendRow.id,
      employee_id: mode === 'single' ? employeeId || null : null,
      name: String(d.name ?? '').trim(),
      email: String(d.email ?? '').trim(),
      status: RECIPIENT_STATUSES.has(d.status) ? d.status : 'skipped',
      error: String(d.error || d.reason || '').trim() || null
    }));
    if (recipientRows.length > 0) {
      const { error: recErr } = await supabaseAdmin
        .from('pm_bulk_alert_recipients')
        .insert(recipientRows);
      if (recErr) throw recErr;
    }

    logOrgActivityFromReq(req, {
      action: 'PM_BULK_ALERT_SENT',
      entityType: 'pm_bulk_alert_send',
      entityId: sendRow.id,
      clientId: clientId || null,
      summary: `Sent ${counts.sent}, failed ${counts.failed}, skipped ${counts.skipped} — ${subject}`,
      metadata: { mode, sent: counts.sent, failed: counts.failed, skipped: counts.skipped, subject }
    }).catch((err) => {
      console.error('[pm-bulk-alert] org activity log failed', err?.message || err);
    });
  } catch (err) {
    console.error('[pm-bulk-alert] persist history failed', err?.message || err);
  }
}

router.post('/send', async (req, res, next) => {
  try {
    const mode = String(req.body?.mode ?? '').trim().toLowerCase();
    const message = String(req.body?.message ?? '').trim();
    const subject =
      String(req.body?.subject ?? '').trim() || DEFAULT_SUBJECT;

    if (mode !== 'single' && mode !== 'bulk') {
      return res.status(400).json({ error: 'mode must be "single" or "bulk"' });
    }
    if (!message) {
      return res.status(400).json({ error: 'message is required' });
    }
    if (message.length > MAX_MESSAGE_CHARS) {
      return res
        .status(400)
        .json({ error: `message must be at most ${MAX_MESSAGE_CHARS} characters` });
    }

    let toSend = [];
    const preDetails = [];
    let clientId = null;
    let employeeId = null;

    if (mode === 'single') {
      employeeId = String(req.body?.employee_id ?? '').trim();
      if (!employeeId) {
        return res.status(400).json({ error: 'employee_id is required for single mode' });
      }

      const { data: employee, error: empErr } = await supabaseAdmin
        .from('employees')
        .select('id, name, email, client_id')
        .eq('id', employeeId)
        .maybeSingle();
      if (empErr) throw empErr;
      if (!employee) {
        return res.status(404).json({ error: 'Employee not found' });
      }

      const { data: client, error: clientErr } = await supabaseAdmin
        .from('clients')
        .select('id, program_manager_id')
        .eq('id', employee.client_id)
        .maybeSingle();
      if (clientErr) throw clientErr;
      if (!client || (!(await isProgramManagerForClient(req.user.id, client.id)) && !isSuperAdminCaller(req))) {
        return res.status(403).json({ error: 'Not authorized for this employee' });
      }
      clientId = client.id;

      const email = normalizeEmail(employee.email);
      if (!email || !isValidEmail(email)) {
        return res.status(400).json({
          error: 'Selected employee has no valid email',
          sent: 0,
          failed: 0,
          skipped: 1,
          details: [
            {
              email: email || '',
              name: employee.name || '',
              status: 'skipped',
              reason: 'no_email'
            }
          ]
        });
      }

      const ccResult = normalizeCopyEmails(req.body?.cc, { exclude: [email], label: 'cc' });
      if (ccResult.error) {
        return res.status(400).json({ error: ccResult.error });
      }
      const bccResult = normalizeCopyEmails(req.body?.bcc, {
        exclude: [email, ...ccResult.emails],
        label: 'bcc'
      });
      if (bccResult.error) {
        return res.status(400).json({ error: bccResult.error });
      }

      toSend = [{
        name: String(employee.name ?? '').trim(),
        email,
        cc: ccResult.emails,
        bcc: bccResult.emails
      }];
    } else {
      const { recipients, details } = normalizeBulkRecipients(req.body?.recipients);
      preDetails.push(...details);

      if (recipients.length === 0) {
        return res.status(400).json({
          error: 'No valid recipients to send',
          sent: 0,
          failed: 0,
          skipped: details.length,
          details
        });
      }
      if (recipients.length > MAX_BULK_RECIPIENTS) {
        return res.status(400).json({
          error: `Bulk send supports at most ${MAX_BULK_RECIPIENTS} recipients`
        });
      }
      toSend = recipients;
    }

    const edgeRecipients = toSend.map((r) => {
      const bodies = buildAlertBodies({ name: r.name, message });
      return {
        name: r.name,
        email: r.email,
        html: bodies.html,
        text: bodies.text,
        cc: Array.isArray(r.cc) ? r.cc : [],
        bcc: Array.isArray(r.bcc) ? r.bcc : []
      };
    });

    const result = await invokeResendEmailBatch({
      subject,
      recipients: edgeRecipients,
      logLabel: 'pm-bulk-alert'
    });

    const details = [...preDetails];
    const sentEmails = new Set(
      (result?.sent || []).map((item) => normalizeEmail(item.email)).filter(Boolean)
    );
    const failedByEmail = new Map();
    for (const item of result?.failed || []) {
      const email = normalizeEmail(item.email);
      if (email) failedByEmail.set(email, item.error || 'failed');
    }

    if (result?.skipped && sentEmails.size === 0 && failedByEmail.size === 0) {
      for (const r of toSend) {
        details.push({
          email: r.email,
          name: r.name,
          status: 'skipped',
          reason: result.reason || 'skipped'
        });
      }
      const skipped = details.filter((d) => d.status === 'skipped').length;
      await persistAlertHistory({
        req,
        mode,
        subject,
        message,
        clientId,
        employeeId,
        details
      });
      return res.json({
        sent: 0,
        failed: 0,
        skipped,
        details
      });
    }

    for (const r of toSend) {
      if (sentEmails.has(r.email)) {
        details.push({ email: r.email, name: r.name, status: 'sent' });
      } else if (failedByEmail.has(r.email)) {
        details.push({
          email: r.email,
          name: r.name,
          status: 'failed',
          error: failedByEmail.get(r.email)
        });
      } else if (result?.ok) {
        details.push({ email: r.email, name: r.name, status: 'sent' });
      } else {
        details.push({
          email: r.email,
          name: r.name,
          status: 'failed',
          error: 'unknown'
        });
      }
    }

    const sent = details.filter((d) => d.status === 'sent').length;
    const failed = details.filter((d) => d.status === 'failed').length;
    const skipped = details.filter((d) => d.status === 'skipped').length;

    await persistAlertHistory({
      req,
      mode,
      subject,
      message,
      clientId,
      employeeId,
      details
    });

    return res.json({ sent, failed, skipped, details });
  } catch (err) {
    next(err);
  }
});

router.get('/history', async (req, res, next) => {
  try {
    const { data: sends, error: sendErr } = await supabaseAdmin
      .from('pm_bulk_alert_sends')
      .select('id, created_at, mode, message')
      .eq('sender_user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(HISTORY_SEND_LIMIT);
    if (sendErr) throw sendErr;

    const sendRows = sends ?? [];
    if (sendRows.length === 0) return res.json([]);

    const sendIds = sendRows.map((s) => s.id);
    const { data: recipients, error: recErr } = await supabaseAdmin
      .from('pm_bulk_alert_recipients')
      .select('send_id, name, email, status')
      .in('send_id', sendIds);
    if (recErr) throw recErr;

    const bySend = new Map();
    for (const row of recipients ?? []) {
      if (!bySend.has(row.send_id)) bySend.set(row.send_id, []);
      bySend.get(row.send_id).push({
        name: row.name || '',
        email: row.email || '',
        status: row.status
      });
    }

    return res.json(
      sendRows.map((s) => ({
        id: s.id,
        created_at: s.created_at,
        mode: s.mode,
        message: s.message,
        recipients: bySend.get(s.id) ?? []
      }))
    );
  } catch (err) {
    next(err);
  }
});

export default router;
