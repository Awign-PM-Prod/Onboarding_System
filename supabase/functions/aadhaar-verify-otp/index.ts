import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const DEFAULT_API_URL =
  "https://profilex-api.neokred.tech/core-svc/api/v2/exp/validation-service/aadhaar-kyc";
const DEFAULT_SERVICE_ID = "db29f416-69be-4830-a14b-194533f6e312";

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
      const parsed = JSON.parse(value);
      return asObject(parsed);
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
      obj.address ||
      obj.gender,
  );
}

/** Prefer nested KYC containers when Neokred wraps demographics under data.*. */
function extractKycData(upstreamBody: Record<string, unknown> | null): Record<string, unknown> {
  const rootData = asObject(upstreamBody?.data) ?? {};
  const candidates = [
    rootData,
    asObject(rootData.aadhaarData),
    asObject(rootData.aadhaar_data),
    asObject(rootData.kycData),
    asObject(rootData.kyc_data),
    asObject(rootData.kycDetails),
    asObject(rootData.kyc_details),
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

  let body: { sessionId?: string; otp?: string } = {};
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  const sessionId = String(body?.sessionId ?? "").trim();
  const otp = String(body?.otp ?? "").replace(/\D/g, "");
  if (!sessionId) {
    return json(400, { error: "sessionId is required" });
  }
  if (!/^\d{6}$/.test(otp)) {
    return json(400, { error: "otp must be 6 digits" });
  }

  const clientUserId = Deno.env.get("NEOKRED_CLIENT_USER_ID") ?? "";
  const secretKey = Deno.env.get("NEOKRED_SECRET_KEY") ?? "";
  const accessKey = Deno.env.get("NEOKRED_ACCESS_KEY") ?? "";
  const serviceId = Deno.env.get("NEOKRED_AADHAAR_VERIFY_SERVICE_ID") ?? DEFAULT_SERVICE_ID;
  const endpoint = Deno.env.get("NEOKRED_AADHAAR_VERIFY_URL") ?? DEFAULT_API_URL;

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
      body: JSON.stringify({ sessionId, otp }),
    });
  } catch {
    return json(502, { error: "Failed to reach Aadhaar verify provider" });
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

  const successFlag = upstreamBody?.success;
  if (successFlag === false) {
    return json(502, {
      error: String(upstreamBody?.message ?? "Aadhaar verify provider reported failure"),
      upstream: upstreamBody,
    });
  }

  const data = extractKycData(upstreamBody);
  return json(200, {
    ok: true,
    transactionId: String(upstreamBody?.transactionId ?? "").trim() || null,
    data,
  });
});
