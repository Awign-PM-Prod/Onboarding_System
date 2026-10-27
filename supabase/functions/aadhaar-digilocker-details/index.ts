import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const DEFAULT_API_URL =
  "https://profilex-api.neokred.tech/core-svc/api/v2/exp/validation-service/unified-digital-kyc-details";
const DEFAULT_SERVICE_ID = "a042f184-47ae-4cd1-b8b0-f723974508fa";

const JSON_HEADERS = { "Content-Type": "application/json" };

function json(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: JSON_HEADERS,
  });
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      return asObject(JSON.parse(value));
    } catch {
      return null;
    }
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function looksLikeKycProfile(obj: Record<string, unknown> | null): boolean {
  if (!obj) return false;
  return Boolean(
    obj.name ||
      obj.fullName ||
      obj.full_name ||
      obj.careof ||
      obj.careOf ||
      obj.care_of ||
      obj.dob ||
      obj.dateOfBirth ||
      obj.date_of_birth ||
      obj.photo ||
      obj.image ||
      obj.image_url ||
      obj.address ||
      obj.gender ||
      obj.uid ||
      obj.aadhaarNumber ||
      obj.aadhaar_number ||
      obj.maskedAdharNumber ||
      obj.maskedAadhaarNumber,
  );
}

/** Prefer nested KYC containers when Neokred wraps demographics under data.*. */
function extractKycData(upstreamBody: Record<string, unknown> | null): Record<string, unknown> {
  const rootData = asObject(upstreamBody?.data) ?? {};
  const model = asObject(rootData.model) ?? {};
  const candidates = [
    rootData,
    model,
    asObject(model.aadhaarData),
    asObject(model.aadhaar_data),
    asObject(model.kycData),
    asObject(model.kyc_data),
    asObject(rootData.aadhaarData),
    asObject(rootData.aadhaar_data),
    asObject(rootData.kycData),
    asObject(rootData.kyc_data),
    asObject(rootData.kycDetails),
    asObject(rootData.kyc_details),
    asObject(rootData.digilockerData),
    asObject(rootData.digilocker_data),
    asObject(rootData.result),
    asObject(rootData.profile),
    asObject(rootData.details),
    asObject(upstreamBody),
  ];

  for (const candidate of candidates) {
    if (looksLikeKycProfile(candidate)) {
      return candidate ?? {};
    }
  }

  return rootData;
}

serve(async (req) => {
  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  let body: {
    unifiedTransactionId?: string;
    uniqueId?: string;
  } = {};
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  const unifiedTransactionId = String(
    body?.unifiedTransactionId ?? (body as { unified_transaction_id?: string })
      ?.unified_transaction_id ??
      "",
  ).trim();
  const uniqueId = String(body?.uniqueId ?? "").trim();
  if (!unifiedTransactionId) {
    return json(400, { error: "unifiedTransactionId is required" });
  }

  const clientUserId = Deno.env.get("NEOKRED_CLIENT_USER_ID") ?? "";
  const secretKey = Deno.env.get("NEOKRED_SECRET_KEY") ?? "";
  const accessKey = Deno.env.get("NEOKRED_ACCESS_KEY") ?? "";
  const serviceId =
    Deno.env.get("NEOKRED_DIGILOCKER_STEP2_SERVICE_ID") ?? DEFAULT_SERVICE_ID;
  const endpoint =
    Deno.env.get("NEOKRED_DIGILOCKER_STEP2_URL") ?? DEFAULT_API_URL;

  if (!clientUserId || !secretKey || !accessKey) {
    return json(500, {
      error:
        "Missing required Neokred credentials. Set NEOKRED_CLIENT_USER_ID, NEOKRED_SECRET_KEY, NEOKRED_ACCESS_KEY.",
    });
  }

  const providerPayload: Record<string, string> = { unifiedTransactionId };
  if (uniqueId) providerPayload.uniqueId = uniqueId;

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
      body: JSON.stringify(providerPayload),
    });
  } catch {
    return json(502, { error: "Failed to reach Digilocker details provider" });
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
      error: String(
        upstreamBody?.message ?? "Digilocker details provider reported failure",
      ),
      upstream: upstreamBody,
    });
  }

  const data = extractKycData(upstreamBody);
  if (!looksLikeKycProfile(data)) {
    return json(502, {
      error: "Provider response did not include Digilocker KYC details",
      upstream: upstreamBody,
    });
  }

  return json(200, {
    ok: true,
    transactionId: String(upstreamBody?.transactionId ?? "").trim() || null,
    unifiedTransactionId,
    data,
    upstream: upstreamBody,
  });
});
