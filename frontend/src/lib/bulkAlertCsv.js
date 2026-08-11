import Papa from 'papaparse';
import { triggerCsvDownload } from './clientCsv';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
export const MAX_BULK_ALERT_ROWS = 200;

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

export function buildBulkAlertTemplateCsv() {
  return Papa.unparse({
    fields: ['name', 'email'],
    data: [
      ['Jane Doe', 'jane.doe@example.com'],
      ['John Smith', 'john.smith@example.com']
    ]
  });
}

export function downloadBulkAlertTemplate() {
  triggerCsvDownload('bulk-alert-recipients.csv', buildBulkAlertTemplateCsv());
}

/**
 * Parse a bulk-alert CSV. Expects name + email columns.
 * @returns {{ rows: Array<{ name: string, email: string, valid: boolean, reason?: string }>, validRecipients: Array<{ name: string, email: string }>, errors: string[] }}
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

    if (!name && !email) continue;

    if (!email) {
      rows.push({ name, email: '', valid: false, reason: 'Missing email' });
      continue;
    }
    if (!EMAIL_RE.test(email)) {
      rows.push({ name, email, valid: false, reason: 'Invalid email' });
      continue;
    }
    if (seen.has(email)) {
      rows.push({ name, email, valid: false, reason: 'Duplicate email' });
      continue;
    }
    seen.add(email);
    rows.push({ name, email, valid: true });
    validRecipients.push({ name, email });
  }

  if (validRecipients.length > MAX_BULK_ALERT_ROWS) {
    errors.push(`CSV has more than ${MAX_BULK_ALERT_ROWS} valid recipients.`);
  }

  return { rows, validRecipients, errors };
}
