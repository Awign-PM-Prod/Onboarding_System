import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const DEFAULT_BASE_URL = "https://tools.onxwork.com/api/partner/kyc";
const JSON_HEADERS = { "Content-Type": "application/json" };

function json(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: JSON_HEADERS,
  });
}

function partnerBaseUrl(): string {
  const raw = String(Deno.env.get("PARTNER_KYC_BASE_URL") ?? "").trim();
  return (raw || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

serve(async (req) => {
  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  let body: {
    id_number?: string;
    account_number?: string;
    ifsc?: string;
  } = {};
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  const accountNumber = String(body?.account_number ?? body?.id_number ?? "")
    .replace(/\D/g, "");
  const ifsc = String(body?.ifsc ?? "")
    .replace(/\s/g, "")
    .toUpperCase();

  if (!/^\d{9,18}$/.test(accountNumber)) {
    return json(400, {
      error: "account_number must be 9-18 digits",
      error_code: "INVALID_ACCOUNT",
      message: "account_number must be 9-18 digits",
    });
  }
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) {
    return json(400, {
      error: "ifsc is invalid",
      error_code: "INVALID_IFSC",
      message: "ifsc is invalid",
    });
  }

  const apiKey = String(Deno.env.get("PARTNER_KYC_API_KEY") ?? "").trim();
  if (!apiKey) {
    return json(500, { error: "Missing PARTNER_KYC_API_KEY secret" });
  }

  const endpoint = `${partnerBaseUrl()}/bank/verify`;
  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        account_number: accountNumber,
        ifsc,
      }),
    });
  } catch {
    return json(502, { error: "Failed to reach bank verification provider" });
  }

  const rawText = await upstreamResponse.text();
  let upstreamBody: Record<string, unknown> | null = null;
  try {
    upstreamBody = rawText ? JSON.parse(rawText) : null;
  } catch {
    upstreamBody = null;
  }

  const status = upstreamResponse.status;
  const errorCode = String(upstreamBody?.error_code ?? "").trim() || null;
  const message =
    String(upstreamBody?.message ?? upstreamBody?.error ?? "").trim() ||
    `Provider request failed (${status})`;

  if (status === 400 || status === 422) {
    return json(status, {
      error: message,
      error_code: errorCode,
      message,
      upstream: upstreamBody,
    });
  }

  if (status === 429) {
    return json(429, {
      error: message,
      message,
      limit: upstreamBody?.limit ?? null,
      reset: upstreamBody?.reset ?? null,
      upstream: upstreamBody,
    });
  }

  if (status === 401) {
    return json(502, {
      error: "Bank verification provider authentication failed",
      upstream: upstreamBody,
    });
  }

  if (!upstreamResponse.ok) {
    return json(502, {
      error: message,
      error_code: errorCode,
      message,
      upstream: upstreamBody ?? rawText,
    });
  }

  const data =
    (upstreamBody?.data as Record<string, unknown> | undefined) ?? {};
  const accountExists = data?.account_exists;

  if (accountExists !== true) {
    return json(400, {
      error:
        "Bank account could not be verified. Please re-enter account number and IFSC and check again.",
      error_code: "ACCOUNT_NOT_VERIFIED",
      message:
        "Bank account could not be verified. Please re-enter account number and IFSC and check again.",
      upstream: upstreamBody,
    });
  }

  return json(200, {
    ok: true,
    data,
    success: Boolean(upstreamBody?.success ?? true),
    manual_review: false,
    warning: null,
    messageCode: null,
  });
});
