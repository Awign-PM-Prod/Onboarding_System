import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const JSON_HEADERS = { "Content-Type": "application/json" };
const RESEND_API_URL = "https://api.resend.com/emails";
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

function emailHtml({ name, otp }: { name: string; otp: string }) {
  const greeting = name ? `Hi ${escapeHtml(name)},` : "Hi there,";
  const safeOtp = escapeHtml(otp);
  return `
    <div style="background:#f3f4f6;padding:24px;font-family:Arial,sans-serif;color:#111827;">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:24px;">
        <div style="font-size:22px;font-weight:700;color:#111827;margin-bottom:18px;">Awign</div>
        <p style="font-size:15px;line-height:1.6;margin:0 0 14px;">${greeting}</p>
        <p style="font-size:15px;line-height:1.6;margin:0 0 18px;">
          Use the verification code below to confirm your email address on the onboarding form.
        </p>
        <p style="font-size:28px;font-weight:700;letter-spacing:0.2em;margin:0 0 18px;color:#111827;">${safeOtp}</p>
        <p style="font-size:13px;line-height:1.5;color:#4b5563;margin:0 0 16px;">
          This code expires in 15 minutes. If you did not request this, you can ignore this email.
        </p>
        <p style="font-size:14px;line-height:1.6;margin:0 0 16px;">- Team Awign</p>
        <p style="font-size:12px;line-height:1.5;color:#6b7280;margin:0;">
          This is a system-generated email. Please do not reply.
        </p>
      </div>
    </div>
  `.trim();
}

function emailText({ name, otp }: { name: string; otp: string }) {
  const greeting = name ? `Hi ${name},` : "Hi there,";
  return [
    greeting,
    "",
    "Use the verification code below to confirm your email address on the onboarding form.",
    "",
    otp,
    "",
    "This code expires in 15 minutes. If you did not request this, you can ignore this email.",
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

  let body: { email?: string; otp?: string; name?: string } = {};
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  const email = String(body?.email ?? "").trim().toLowerCase();
  const otp = String(body?.otp ?? "").replace(/\D/g, "");
  const name = String(body?.name ?? "").trim();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json(400, { error: "A valid email address is required." });
  }
  if (!/^\d{6}$/.test(otp)) {
    return json(400, { error: "otp must be 6 digits" });
  }

  try {
    const resp = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [email],
        subject: "Your Awign onboarding verification code",
        html: emailHtml({ name, otp }),
        text: emailText({ name, otp }),
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
      return json(502, {
        error: String(parsed?.message ?? parsed?.error ?? `Resend request failed (${resp.status})`),
      });
    }

    return json(200, { ok: true, provider_id: parsed?.id ?? null });
  } catch (err) {
    return json(502, { error: String((err as Error)?.message ?? "Email send failed") });
  }
});
