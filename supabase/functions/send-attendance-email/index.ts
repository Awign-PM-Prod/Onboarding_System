import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const JSON_HEADERS = { "Content-Type": "application/json" };
const RESEND_API_URL = "https://api.resend.com/emails";
const FROM_EMAIL = "Onboarding Awign <onboarding.awign@awign.in>";
const DEFAULT_SUBJECT = "Attendance update — Awign";

function json(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: JSON_HEADERS,
  });
}

function wrapHtml(inner: string) {
  return `
    <div style="background:#f3f4f6;padding:24px;font-family:Arial,sans-serif;color:#111827;">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:24px;">
        <div style="font-size:22px;font-weight:700;color:#111827;margin-bottom:18px;">Awign</div>
        ${inner}
        <p style="font-size:12px;line-height:1.5;color:#6b7280;margin:16px 0 0;">
          This is a system-generated email. Please do not reply.
        </p>
      </div>
    </div>
  `.trim();
}

serve(async (req) => {
  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  const apiKey = String(Deno.env.get("RESEND_API_KEY") ?? "").trim();
  if (!apiKey) {
    return json(500, { error: "Missing RESEND_API_KEY secret." });
  }

  let body: {
    subject?: string;
    recipients?: Array<Record<string, unknown>>;
  } = {};
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  const subject = String(body?.subject ?? "").trim() || DEFAULT_SUBJECT;
  const recipients = Array.isArray(body.recipients) ? body.recipients : [];
  if (recipients.length === 0) {
    return json(400, { error: "recipients required (non-empty array)." });
  }

  const valid = recipients
    .map((raw) => ({
      name: String(raw?.name ?? "").trim(),
      email: String(raw?.email ?? "").trim(),
      html: String(raw?.html ?? "").trim(),
      text: String(raw?.text ?? "").trim(),
    }))
    .filter((r) => r.email);

  if (valid.length === 0) {
    return json(400, { error: "No valid recipients to send." });
  }

  const sent: Array<Record<string, unknown>> = [];
  const failed: Array<Record<string, unknown>> = [];

  await Promise.all(
    valid.map(async (recipient) => {
      try {
        const htmlBody = recipient.html
          ? wrapHtml(recipient.html)
          : wrapHtml(`<p>Hi ${recipient.name || "there"},</p><p>${recipient.text || subject}</p>`);
        const resp = await fetch(RESEND_API_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: FROM_EMAIL,
            to: [recipient.email],
            subject,
            html: htmlBody,
            text: recipient.text || subject,
          }),
        });
        const raw = await resp.text();
        let parsed: Record<string, unknown> | null = null;
        try {
          parsed = raw ? JSON.parse(raw) : null;
        } catch {
          parsed = null;
        }
        if (!resp.ok) {
          failed.push({
            email: recipient.email,
            error: parsed?.message || parsed?.error || `Resend ${resp.status}`,
          });
          return;
        }
        sent.push({ email: recipient.email, id: parsed?.id ?? null });
      } catch (err) {
        failed.push({
          email: recipient.email,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }),
  );

  return json(200, { sent, failed });
});
