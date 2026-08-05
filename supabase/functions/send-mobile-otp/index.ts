import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const JSON_HEADERS = { "Content-Type": "application/json" };
const D360_API_URL = "https://waba-v2.360dialog.io/messages";
const DEFAULT_COUNTRY_CODE = "91";

function json(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: JSON_HEADERS,
  });
}

function formatWhatsAppTo(raw: string, countryCode: string) {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return null;
  const cc = String(countryCode || DEFAULT_COUNTRY_CODE).replace(/\D/g, "") || DEFAULT_COUNTRY_CODE;
  const targetLength = cc.length + 10;
  if (digits.startsWith(cc) && digits.length === targetLength) return digits;
  const local = digits.length >= 10 ? digits.slice(-10) : digits;
  if (local.length !== 10) return null;
  return `${cc}${local}`;
}

serve(async (req) => {
  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  const apiKey = String(Deno.env.get("D360_API_KEY") ?? "").trim();
  if (!apiKey) {
    return json(500, { error: "Missing D360_API_KEY secret." });
  }

  const countryCode = String(Deno.env.get("WHATSAPP_COUNTRY_CODE") ?? DEFAULT_COUNTRY_CODE).trim() ||
    DEFAULT_COUNTRY_CODE;
  const templateName = String(Deno.env.get("D360_OTP_TEMPLATE_NAME") ?? "").trim();
  const templateLanguage = String(Deno.env.get("D360_OTP_TEMPLATE_LANGUAGE") ?? "en").trim() || "en";
  const templateNamespace = String(Deno.env.get("D360_OTP_TEMPLATE_NAMESPACE") ?? "").trim();
  const buttonIndex = String(Deno.env.get("D360_OTP_TEMPLATE_BUTTON_INDEX") ?? "0").trim() || "0";

  let body: { mobile?: string; otp?: string; name?: string } = {};
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  const otp = String(body?.otp ?? "").replace(/\D/g, "");
  const name = String(body?.name ?? "").trim();
  const to = formatWhatsAppTo(String(body?.mobile ?? ""), countryCode);

  if (!to) {
    return json(400, { error: "A valid 10-digit mobile number is required." });
  }
  if (!/^\d{6}$/.test(otp)) {
    return json(400, { error: "otp must be 6 digits" });
  }

  let messagePayload: Record<string, unknown>;
  if (templateName) {
    const template: Record<string, unknown> = {
      name: templateName,
      language: {
        policy: "deterministic",
        code: templateLanguage,
      },
      components: [
        {
          type: "body",
          parameters: [
            {
              type: "text",
              text: otp,
            },
          ],
        },
        {
          type: "button",
          sub_type: "url",
          index: buttonIndex,
          parameters: [
            {
              type: "text",
              text: otp,
            },
          ],
        },
      ],
    };
    if (templateNamespace) {
      template.namespace = templateNamespace;
    }
    messagePayload = {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template,
    };
  } else {
    const greeting = name ? `Hi ${name},` : "Hi,";
    messagePayload = {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: {
        body: `${greeting}\n\nYour Awign onboarding verification code is ${otp}. It is valid for 15 minutes.\n\nIf you did not request this, please ignore this message.\n- Team Awign`,
      },
    };
  }

  try {
    const resp = await fetch(D360_API_URL, {
      method: "POST",
      headers: {
        "D360-API-KEY": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messagePayload),
    });

    const raw = await resp.text();
    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      parsed = null;
    }

    if (!resp.ok) {
      const upstreamErr = parsed?.error as Record<string, unknown> | undefined;
      return json(502, {
        error: String(
          upstreamErr?.message ??
            parsed?.message ??
            parsed?.error ??
            `360dialog request failed (${resp.status})`,
        ),
        upstream: parsed,
      });
    }

    const messages = Array.isArray(parsed?.messages) ? parsed.messages : [];
    const firstMessage = (messages[0] as Record<string, unknown> | undefined) ?? null;
    return json(200, {
      ok: true,
      to,
      channel: templateName ? "whatsapp_template" : "whatsapp_text",
      provider_id: firstMessage?.id ?? null,
    });
  } catch (err) {
    return json(502, { error: String((err as Error)?.message ?? "WhatsApp OTP send failed") });
  }
});
