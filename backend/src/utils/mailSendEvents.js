import { supabaseAdmin } from '../supabase.js';

const MAIL_TYPES = new Set(['onboarding', 'staff_invite']);
const SEND_KINDS = new Set(['send', 'resend']);
const STATUSES = new Set(['sent', 'failed', 'skipped']);

function normalizeRow(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const mail_type = String(raw.mail_type ?? '').trim();
  const send_kind = String(raw.send_kind ?? '').trim();
  const status = String(raw.status ?? '').trim();
  if (!MAIL_TYPES.has(mail_type) || !SEND_KINDS.has(send_kind) || !STATUSES.has(status)) {
    return null;
  }
  return {
    mail_type,
    send_kind,
    status,
    recipient_email: String(raw.recipient_email ?? '').trim(),
    recipient_name: raw.recipient_name != null ? String(raw.recipient_name).trim() || null : null,
    actor_user_id: raw.actor_user_id || null,
    client_id: raw.client_id || null,
    employee_id: raw.employee_id || null,
    target_user_id: raw.target_user_id || null,
    error: raw.error != null ? String(raw.error).trim() || null : null,
    meta: raw.meta && typeof raw.meta === 'object' ? raw.meta : null
  };
}

/**
 * Best-effort insert of mail send events. Never throws — logging must not break sends.
 * @param {Array<object>} rows
 */
export async function logMailSendEvents(rows) {
  const list = (Array.isArray(rows) ? rows : []).map(normalizeRow).filter(Boolean);
  if (list.length === 0) return;
  try {
    const { error } = await supabaseAdmin.from('mail_send_events').insert(list);
    if (error) {
      console.warn('[mail_send_events] insert failed', error.message || error);
    }
  } catch (err) {
    console.warn('[mail_send_events] insert failed', err?.message || err);
  }
}
