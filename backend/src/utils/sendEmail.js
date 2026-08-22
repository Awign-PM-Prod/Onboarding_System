const DEFAULT_ATTENDANCE_EMAIL_EDGE =
  process.env.SEND_ATTENDANCE_EMAIL_EDGE_FUNCTION || 'send-attendance-email';

const DEFAULT_BATCH_CHUNK_SIZE = 50;

function edgeEndpoint(edgeFunction) {
  const supabaseUrl = String(process.env.SUPABASE_URL ?? '').trim();
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!supabaseUrl || !serviceRoleKey) {
    return { supabaseUrl: '', serviceRoleKey: '', endpoint: '' };
  }
  const fn =
    String(edgeFunction || DEFAULT_ATTENDANCE_EMAIL_EDGE).trim() || DEFAULT_ATTENDANCE_EMAIL_EDGE;
  return {
    supabaseUrl,
    serviceRoleKey,
    endpoint: `${supabaseUrl}/functions/v1/${encodeURIComponent(fn)}`
  };
}

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
  cc,
  bcc,
  edgeFunction = DEFAULT_ATTENDANCE_EMAIL_EDGE,
  logLabel = 'resend-email'
} = {}) {
  if (!toEmail) return { skipped: true, reason: 'no_recipient' };

  const batch = await invokeResendEmailBatch({
    subject,
    recipients: [{ name: toName || '', email: toEmail, html, text, cc, bcc }],
    edgeFunction,
    logLabel
  });

  if (batch?.skipped) {
    return { skipped: true, reason: batch.reason || 'skipped' };
  }
  if (batch?.ok) {
    return { ok: true, body: batch.body };
  }
  const firstError =
    batch?.failed?.[0]?.error ||
    (Array.isArray(batch?.failed) && batch.failed.length > 0 ? 'failed' : 'unknown');
  return { ok: false, error: firstError, body: batch?.body };
}

/**
 * Send many recipients via the Resend edge mailer in chunks.
 * @param {{ subject?: string, recipients?: Array<{ name?: string, email?: string, html?: string, text?: string, cc?: string[], bcc?: string[] }>, edgeFunction?: string, logLabel?: string, chunkSize?: number }} opts
 */
export async function invokeResendEmailBatch({
  subject,
  recipients = [],
  edgeFunction = DEFAULT_ATTENDANCE_EMAIL_EDGE,
  logLabel = 'resend-email',
  chunkSize = DEFAULT_BATCH_CHUNK_SIZE
} = {}) {
  const { serviceRoleKey, endpoint } = edgeEndpoint(edgeFunction);
  if (!endpoint || !serviceRoleKey) {
    console.warn(`[${logLabel}] Missing Supabase env; skipping email send`);
    return {
      skipped: true,
      sent: [],
      failed: (recipients || []).map((r) => ({
        email: String(r?.email ?? '').trim(),
        error: 'missing_supabase_env'
      }))
    };
  }

  const valid = (Array.isArray(recipients) ? recipients : [])
    .map((raw) => ({
      name: String(raw?.name ?? '').trim(),
      email: String(raw?.email ?? '').trim(),
      html: String(raw?.html ?? '').trim(),
      text: String(raw?.text ?? '').trim(),
      cc: Array.isArray(raw?.cc)
        ? raw.cc.map((item) => String(item ?? '').trim()).filter(Boolean)
        : [],
      bcc: Array.isArray(raw?.bcc)
        ? raw.bcc.map((item) => String(item ?? '').trim()).filter(Boolean)
        : []
    }))
    .filter((r) => r.email);

  if (valid.length === 0) {
    return { skipped: true, reason: 'no_recipient', sent: [], failed: [] };
  }

  const size = Math.max(1, Number(chunkSize) || DEFAULT_BATCH_CHUNK_SIZE);
  const sent = [];
  const failed = [];

  for (let i = 0; i < valid.length; i += size) {
    const chunk = valid.slice(i, i + size);
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
          recipients: chunk
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
        const errMsg = body?.error || `Edge failed (${resp.status})`;
        console.warn(`[${logLabel}] Edge failed`, errMsg);
        for (const r of chunk) {
          failed.push({ email: r.email, error: errMsg });
        }
        continue;
      }
      const chunkSent = Array.isArray(body?.sent) ? body.sent : [];
      const chunkFailed = Array.isArray(body?.failed) ? body.failed : [];
      if (chunkSent.length === 0 && chunkFailed.length === 0) {
        // Older/edge responses without per-recipient arrays — treat chunk as sent.
        for (const r of chunk) sent.push({ email: r.email });
      } else {
        for (const item of chunkSent) {
          sent.push({
            email: String(item?.email ?? '').trim(),
            id: item?.id ?? null
          });
        }
        for (const item of chunkFailed) {
          failed.push({
            email: String(item?.email ?? '').trim(),
            error: item?.error || 'failed'
          });
        }
      }
    } catch (err) {
      const errMsg = err?.message || String(err);
      console.warn(`[${logLabel}] invoke error`, errMsg);
      for (const r of chunk) {
        failed.push({ email: r.email, error: errMsg });
      }
    }
  }

  const ok = failed.length === 0;
  return {
    ok,
    skipped: false,
    sent,
    failed,
    body: { sent, failed }
  };
}
