import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const JSON_HEADERS = { "Content-Type": "application/json" };
const RESEND_API_URL = "https://api.resend.com/emails";
const DEFAULT_SUBJECT = "Complete your onboarding with Awign";
const FROM_EMAIL = "Onboarding Awign <onboarding.awign@awign.in>";

function json(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: JSON_HEADERS,
  });
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function emailHtml({ name, link }: { name: string; link: string }) {
  const greeting = name ? `Hi ${escapeHtml(name)},` : "Hi there,";
  const safeLink = escapeHtml(link);
  return `
    <div style="background:#f3f4f6;padding:24px;font-family:Arial,sans-serif;color:#111827;">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:24px;">
        <div style="font-size:22px;font-weight:700;color:#111827;margin-bottom:18px;">Awign</div>
        <p style="font-size:15px;line-height:1.6;margin:0 0 14px;">${greeting}</p>
        <p style="font-size:15px;line-height:1.6;margin:0 0 18px;">
          You have been onboarded with Awign. To get started, please complete your onboarding form using the link below.
        </p>
        <p style="margin:0 0 18px;">
          <a
            href="${safeLink}"
            style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:14px;font-weight:600;"
          >Start onboarding</a>
        </p>
        <p style="font-size:13px;line-height:1.5;color:#4b5563;margin:0 0 16px;">
          If the button does not work, open this link in your browser:<br />
          <a href="${safeLink}" style="color:#2563eb;word-break:break-all;">${safeLink}</a>
        </p>
        <p style="font-size:14px;line-height:1.6;margin:0 0 16px;">- Team Awign</p>
        <p style="font-size:12px;line-height:1.5;color:#6b7280;margin:0;">
          This is a system-generated email. Please do not reply.
        </p>
      </div>
    </div>
  `.trim();
}

function emailText({ name, link }: { name: string; link: string }) {
  const greeting = name ? `Hi ${name},` : "Hi there,";
  return [
    greeting,
    "",
    "You have been onboarded with Awign. To get started, please complete your onboarding form using the link below.",
    "",
    link,
    "",
    "- Team Awign",
    "",
    "This is a system-generated email. Please do not reply.",
  ].join("\n");
}

serve(async (req) => {
  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  const apiKey = String(Deno.env.get("RESEND_API_KEY") ?? "").trim();
  if (!apiKey) {
    return json(500, { error: "Missing RESEND_API_KEY secret." });
  }

  let body: { subject?: string; recipients?: Array<Record<string, unknown>> } = {};
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  const subject = String(body?.subject ?? "").trim() || DEFAULT_SUBJECT;
  const recipients = Array.isArray(body?.recipients) ? body.recipients : [];
  if (recipients.length === 0) {
    return json(400, { error: "recipients required (non-empty array)." });
  }

  const validRecipients = recipients
    .map((raw) => ({
      employee_id: String(raw?.employee_id ?? "").trim(),
      name: String(raw?.name ?? "").trim(),
      email: String(raw?.email ?? "").trim(),
      link: String(raw?.link ?? "").trim(),
    }))
    .filter((r) => r.employee_id && r.email && r.link);

  if (validRecipients.length === 0) {
    return json(400, { error: "No valid recipients to send." });
  }

  const sent: Array<Record<string, unknown>> = [];
  const failed: Array<Record<string, unknown>> = [];
  await Promise.all(
    validRecipients.map(async (recipient) => {
      try {
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
            html: emailHtml({ name: recipient.name, link: recipient.link }),
            text: emailText({ name: recipient.name, link: recipient.link }),
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
            employee_id: recipient.employee_id,
            email: recipient.email,
            error: String(parsed?.message ?? parsed?.error ?? `Resend request failed (${resp.status})`),
          });
          return;
        }

        sent.push({
          employee_id: recipient.employee_id,
          email: recipient.email,
          provider_id: parsed?.id ?? null,
        });
      } catch (err) {
        failed.push({
          employee_id: recipient.employee_id,
          email: recipient.email,
          error: String((err as Error)?.message ?? "Email send failed"),
        });
      }
    }),
  );

  return json(200, {
    ok: true,
    sent,
    failed,
  });
});
