const DEFAULT_ATTENDANCE_EMAIL_EDGE =
  process.env.SEND_ATTENDANCE_EMAIL_EDGE_FUNCTION || 'send-attendance-email';

/**
 * Invoke a Supabase edge function that accepts { subject, recipients: [{ name, email, html, text }] }.
 * Defaults to the generic Resend mailer (send-attendance-email).
 */
export async function invokeResendEmail({
  toEmail,
  toName,
  subject,
  html,
  text,
  edgeFunction = DEFAULT_ATTENDANCE_EMAIL_EDGE,
  logLabel = 'resend-email'
} = {}) {
  const supabaseUrl = String(process.env.SUPABASE_URL ?? '').trim();
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!supabaseUrl || !serviceRoleKey) {
    console.warn(`[${logLabel}] Missing Supabase env; skipping email send`);
    return { skipped: true };
  }
  if (!toEmail) return { skipped: true, reason: 'no_recipient' };

  const fn = String(edgeFunction || DEFAULT_ATTENDANCE_EMAIL_EDGE).trim() || DEFAULT_ATTENDANCE_EMAIL_EDGE;
  const endpoint = `${supabaseUrl}/functions/v1/${encodeURIComponent(fn)}`;
  try {
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        subject,
        recipients: [{ name: toName || '', email: toEmail, html, text }]
      })
    });
    const raw = await resp.text();
    let body = null;
    try {
      body = raw ? JSON.parse(raw) : null;
    } catch {
      body = null;
    }
    if (!resp.ok) {
      console.warn(`[${logLabel}] Edge failed`, body?.error || resp.status);
      return { ok: false, error: body?.error || `Edge failed (${resp.status})` };
    }
    return { ok: true, body };
  } catch (err) {
    console.warn(`[${logLabel}] invoke error`, err?.message || err);
    return { ok: false, error: err?.message || String(err) };
  }
}
