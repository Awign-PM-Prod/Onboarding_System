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

  let body: { id_number?: string; pan_number?: string } = {};
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  const panNumber = String(body?.pan_number ?? body?.id_number ?? "")
    .replace(/\s/g, "")
    .toUpperCase();
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(panNumber)) {
    return json(400, {
      error: "id_number must be a valid PAN",
      error_code: "INVALID_PAN",
      message: "id_number must be a valid PAN",
    });
  }

  const apiKey = String(Deno.env.get("PARTNER_KYC_API_KEY") ?? "").trim();
  if (!apiKey) {
    return json(500, { error: "Missing PARTNER_KYC_API_KEY secret" });
  }

  const endpoint = `${partnerBaseUrl()}/pan/verify`;
  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({ pan_number: panNumber }),
    });
  } catch {
    return json(502, { error: "Failed to reach PAN verification provider" });
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

  // Hard client / validation rejections — pass through for Express to surface.
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
      error: "PAN verification provider authentication failed",
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
  const manualReview = Boolean(upstreamBody?.manual_review);
  const warning = String(upstreamBody?.warning ?? "").trim() || null;

  return json(200, {
    ok: true,
    data,
    success: Boolean(upstreamBody?.success ?? true),
    manual_review: manualReview,
    warning,
    messageCode: null,
  });
});
