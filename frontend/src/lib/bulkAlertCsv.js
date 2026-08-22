import Papa from 'papaparse';
import { triggerCsvDownload } from './clientCsv';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
export const MAX_BULK_ALERT_ROWS = 200;
export const MAX_COPY_EMAILS = 10;

function normalizeHeader(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

function pickField(row, keys) {
  for (const key of keys) {
    if (row[key] != null && String(row[key]).trim()) return String(row[key]).trim();
  }
  return '';
}

export function parseEmailList(value) {
  if (Array.isArray(value)) {
    return value.flatMap((item) => parseEmailList(item));
  }
  return String(value ?? '')
    .split(/[,;]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Parse CC/BCC addresses. Invalid entries fail the whole list.
 * @returns {{ emails: string[], error?: string }}
 */
export function normalizeCopyEmails(value, { exclude = [], max = MAX_COPY_EMAILS, label = 'address' } = {}) {
  const excluded = new Set(
    (Array.isArray(exclude) ? exclude : [exclude])
      .map((item) => String(item ?? '').trim().toLowerCase())
      .filter(Boolean)
  );
  const emails = [];
  const seen = new Set(excluded);
  for (const email of parseEmailList(value)) {
    if (seen.has(email)) continue;
    if (!EMAIL_RE.test(email)) {
      return { emails: [], error: `Invalid ${label}: ${email}` };
    }
    seen.add(email);
    emails.push(email);
    if (emails.length > max) {
      return { emails: [], error: `${label} supports at most ${max} addresses` };
    }
  }
  return { emails };
}

export function formatEmailList(emails) {
  return (Array.isArray(emails) ? emails : []).join(', ');
}

export function buildBulkAlertTemplateCsv() {
  return Papa.unparse({
    fields: ['name', 'email', 'cc', 'bcc'],
    data: [
      ['Jane Doe', 'jane.doe@example.com', 'manager@example.com', ''],
      ['John Smith', 'john.smith@example.com', 'lead@example.com; hr@example.com', 'archive@example.com']
    ]
  });
}

export function downloadBulkAlertTemplate() {
  triggerCsvDownload('bulk-alert-recipients.csv', buildBulkAlertTemplateCsv());
}

/**
 * Parse a bulk-alert CSV. Expects name + email, with optional cc / bcc columns.
 * @returns {{ rows: Array<object>, validRecipients: Array<object>, errors: string[] }}
 */
export function parseBulkAlertCsvText(text) {
  const { data, errors: parseErrors } = Papa.parse(String(text ?? ''), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: normalizeHeader
  });

  const errors = [];
  if (parseErrors?.length) {
    for (const err of parseErrors.slice(0, 5)) {
      if (err?.message) errors.push(err.message);
    }
  }

  const rows = [];
  const validRecipients = [];
  const seen = new Set();

  for (const raw of Array.isArray(data) ? data : []) {
    const name = pickField(raw, ['name', 'employee_name', 'full_name']);
    const email = pickField(raw, ['email', 'e_mail', 'email_id', 'mail']).toLowerCase();
    const ccRaw = pickField(raw, ['cc', 'cc_email', 'cc_emails']);
    const bccRaw = pickField(raw, ['bcc', 'bcc_email', 'bcc_emails']);

    if (!name && !email && !ccRaw && !bccRaw) continue;

    if (!email) {
      rows.push({ name, email: '', cc: [], bcc: [], valid: false, reason: 'Missing email' });
      continue;
    }
    if (!EMAIL_RE.test(email)) {
      rows.push({ name, email, cc: [], bcc: [], valid: false, reason: 'Invalid email' });
      continue;
    }
    if (seen.has(email)) {
      rows.push({ name, email, cc: [], bcc: [], valid: false, reason: 'Duplicate email' });
      continue;
    }

    const ccResult = normalizeCopyEmails(ccRaw, { exclude: [email], label: 'cc' });
    if (ccResult.error) {
      rows.push({ name, email, cc: [], bcc: [], valid: false, reason: ccResult.error });
      continue;
    }
    const bccResult = normalizeCopyEmails(bccRaw, {
      exclude: [email, ...ccResult.emails],
      label: 'bcc'
    });
    if (bccResult.error) {
      rows.push({ name, email, cc: ccResult.emails, bcc: [], valid: false, reason: bccResult.error });
      continue;
    }

    seen.add(email);
    const row = { name, email, cc: ccResult.emails, bcc: bccResult.emails, valid: true };
    rows.push(row);
    validRecipients.push({ name, email, cc: row.cc, bcc: row.bcc });
  }

  if (validRecipients.length > MAX_BULK_ALERT_ROWS) {
    errors.push(`CSV has more than ${MAX_BULK_ALERT_ROWS} valid recipients.`);
  }

  return { rows, validRecipients, errors };
}
