import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const DEFAULT_API_URL =
  "https://profilex-api.neokred.tech/core-svc/api/v2/exp/validation-service/unified-digital-kyc";
const DEFAULT_SERVICE_ID = "7294047a-552f-4e63-8a61-34ee9763ee13";

const JSON_HEADERS = { "Content-Type": "application/json" };

function json(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: JSON_HEADERS,
  });
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function firstNonEmptyString(...values: unknown[]): string {
  for (const value of values) {
    const s = String(value ?? "").trim();
    if (s) return s;
  }
  return "";
}

/** Digilocker providers return the redirect URL under several key names. */
function extractDigilockerUrl(upstreamBody: Record<string, unknown> | null): string {
  const data = asObject(upstreamBody?.data) ?? {};
  // ProfileX wraps the payload as data.model.{url,shortUrl,unifiedTransactionId}
  const model = asObject(data.model) ?? {};
  return firstNonEmptyString(
    model.url,
    model.shortUrl,
    model.short_url,
    model.redirectUrl,
    model.redirect_url,
    model.redirectionUrl,
    model.redirection_url,
    data.url,
    data.redirectUrl,
    data.redirect_url,
    data.redirectionUrl,
    data.redirection_url,
    data.digilockerUrl,
    data.digilocker_url,
    data.authorizationUrl,
    data.authorization_url,
    data.webUrl,
    data.web_url,
    data.link,
    data.shortUrl,
    data.short_url,
    upstreamBody?.url,
    upstreamBody?.redirectUrl,
  );
}

function extractUnifiedTransactionId(
  upstreamBody: Record<string, unknown> | null,
): string {
  const data = asObject(upstreamBody?.data) ?? {};
  const model = asObject(data.model) ?? {};
  return firstNonEmptyString(
    model.unifiedTransactionId,
    model.unified_transaction_id,
    model.transactionId,
    model.transaction_id,
    data.unifiedTransactionId,
    data.unified_transaction_id,
    data.transactionId,
    data.transaction_id,
    data.txnId,
    data.txn_id,
    upstreamBody?.unifiedTransactionId,
    upstreamBody?.transactionId,
  );
}

serve(async (req) => {
  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  let body: { redirectionUrl?: string; uniqueId?: string } = {};
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  const redirectionUrl = String(body?.redirectionUrl ?? "").trim();
  const uniqueId = String(body?.uniqueId ?? "").trim();
  if (!redirectionUrl) {
    return json(400, { error: "redirectionUrl is required" });
  }
  if (!uniqueId) {
    return json(400, { error: "uniqueId is required" });
  }

  const clientUserId = Deno.env.get("NEOKRED_CLIENT_USER_ID") ?? "";
  const secretKey = Deno.env.get("NEOKRED_SECRET_KEY") ?? "";
  const accessKey = Deno.env.get("NEOKRED_ACCESS_KEY") ?? "";
  const serviceId =
    Deno.env.get("NEOKRED_DIGILOCKER_STEP1_SERVICE_ID") ?? DEFAULT_SERVICE_ID;
  const endpoint =
    Deno.env.get("NEOKRED_DIGILOCKER_STEP1_URL") ?? DEFAULT_API_URL;

  if (!clientUserId || !secretKey || !accessKey) {
    return json(500, {
      error:
        "Missing required Neokred credentials. Set NEOKRED_CLIENT_USER_ID, NEOKRED_SECRET_KEY, NEOKRED_ACCESS_KEY.",
    });
  }

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(endpoint, {
      method: "POST",
      headers: {
        "client-user-id": clientUserId,
        "secret-key": secretKey,
        "access-key": accessKey,
        "service-id": serviceId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ redirectionUrl, uniqueId }),
    });
  } catch {
    return json(502, { error: "Failed to reach Digilocker KYC provider" });
  }

  const rawText = await upstreamResponse.text();
  let upstreamBody: Record<string, unknown> | null = null;
  try {
    upstreamBody = rawText ? JSON.parse(rawText) : null;
  } catch {
    upstreamBody = null;
  }

  if (!upstreamResponse.ok) {
    const message =
      (upstreamBody?.message as string | undefined) ||
      `Provider request failed (${upstreamResponse.status})`;
    return json(502, { error: message, upstream: upstreamBody ?? rawText });
  }

  if (upstreamBody?.success === false) {
    return json(502, {
      error: String(upstreamBody?.message ?? "Digilocker start reported failure"),
      upstream: upstreamBody,
    });
  }

  const digilockerUrl = extractDigilockerUrl(upstreamBody);
  const unifiedTransactionId = extractUnifiedTransactionId(upstreamBody);

  if (!digilockerUrl) {
    return json(502, {
      error: "Provider response did not include a Digilocker redirect URL",
      upstream: upstreamBody,
    });
  }

  return json(200, {
    ok: true,
    digilockerUrl,
    unifiedTransactionId: unifiedTransactionId || null,
    uniqueId,
    providerMessage: String(upstreamBody?.message ?? ""),
    upstream: upstreamBody,
  });
});
