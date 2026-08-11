import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const JSON_HEADERS = { "Content-Type": "application/json" };
const AWIGN_SMS_URL = "https://core-api.awign.com/api/v1/sms/to_number";
const TEMPLATE_ID = "1107160412653314461";
const SENDER_ID = "IAWIGN";
const CHANNEL = "telspiel_product";
const CALLER_ID = "staffing_go";
/** Fixed Awign SMS app identifiers (not secrets) — same as curl example headers. */
const AWIGN_SMS_CLIENT = "6Ok5D1iEP4zcV8S25HJmNA";
const AWIGN_SMS_UID = "110986717252553637625";
const MESSAGE_TEMPLATE =
  "{#var#} is the OTP for your verification.\n\nCheers!\nTeam AWIGN";

function json(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: JSON_HEADERS,
  });
}

/** Normalize to a 10-digit Indian mobile for Awign SMS body. */
function normalizeMobile10(raw: string) {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return null;
  const local = digits.length >= 10 ? digits.slice(-10) : digits;
  if (local.length !== 10) return null;
  return local;
}

function readAccessToken() {
  // Prefer Mobile_OTP_KEY; keep mobile_otp as fallback for older secret names.
  return String(Deno.env.get("Mobile_OTP_KEY") ?? Deno.env.get("mobile_otp") ?? "").trim();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

serve(async (req) => {
  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  // Access token must be ONLY the JWT — not the full curl command.
  const accessToken = readAccessToken();
  if (!accessToken) {
    return json(500, {
      error: "Missing Mobile_OTP_KEY (or mobile_otp) secret.",
    });
  }
  if (
    accessToken.toLowerCase().includes("curl ") ||
    accessToken.includes("--header") ||
    accessToken.includes("\n")
  ) {
    return json(500, {
      error:
        "Mobile_OTP_KEY must be only the JWT access-token value (eyJ...), not the full curl command.",
    });
  }

  let body: { mobile?: string; otp?: string; name?: string } = {};
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  const otp = String(body?.otp ?? "").replace(/\D/g, "");
  const mobile = normalizeMobile10(String(body?.mobile ?? ""));

  if (!mobile) {
    return json(400, { error: "A valid 10-digit mobile number is required." });
  }
  if (!/^\d{6}$/.test(otp)) {
    return json(400, { error: "otp must be 6 digits" });
  }

  const message = MESSAGE_TEMPLATE.replace("{#var#}", otp);

  try {
    const resp = await fetch(AWIGN_SMS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "access-token": accessToken,
        client: AWIGN_SMS_CLIENT,
        uid: AWIGN_SMS_UID,
        "x-caller-id": CALLER_ID,
      },
      body: JSON.stringify({
        sms: {
          mobile_number: mobile,
          template_id: TEMPLATE_ID,
          message,
          sender_id: SENDER_ID,
          channel: CHANNEL,
          // Without sync, Awign accepts the row as status=created with
          // message_reference_id=null and TELSPIEL often never sends.
          sync: true,
        },
      }),
    });

    const raw = await resp.text();
    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      parsed = null;
    }

    const data = asRecord(parsed?.data);
    const upstreamErr = parsed?.error as Record<string, unknown> | string | undefined;
    const upstreamMessage =
      typeof upstreamErr === "string"
        ? upstreamErr
        : upstreamErr && typeof upstreamErr === "object"
        ? String(
          (upstreamErr as Record<string, unknown>).message ??
            (upstreamErr as Record<string, unknown>).error ??
            "",
        )
        : "";
    const bodyMessage = String(parsed?.message ?? "").trim();
    const statusText = String(parsed?.status ?? "").trim().toLowerCase();
    const dataStatus = String(data?.status ?? "").trim().toLowerCase();
    const providerId = data?.id ?? parsed?.id ?? parsed?.request_id ?? null;

    const explicitFail =
      parsed?.success === false ||
      parsed?.ok === false ||
      statusText === "error" ||
      statusText === "failed" ||
      parsed?.status === false;
    const looksLikeAuthOrFail =
      Boolean(upstreamMessage) ||
      /fail|invalid|expired|unauthor|forbidden/i.test(bodyMessage);
    const awignAccepted =
      statusText === "success" ||
      /taken successfully|queued|created|accepted/i.test(bodyMessage) ||
      dataStatus === "created" ||
      dataStatus === "queued" ||
      dataStatus === "success";

    if (!resp.ok || explicitFail || looksLikeAuthOrFail || !awignAccepted) {
      return json(502, {
        error: String(
          upstreamMessage ||
            bodyMessage ||
            `Awign SMS request failed (${resp.status})`,
        ),
        upstream: parsed ?? raw,
      });
    }

    return json(200, {
      ok: true,
      to: mobile,
      channel: "sms",
      provider_id: providerId,
      awign_status: data?.status ?? parsed?.status ?? null,
      upstream: parsed,
    });
  } catch (err) {
    return json(502, { error: String((err as Error)?.message ?? "SMS OTP send failed") });
  }
});
