import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const PAN_VERIFY_URL = "https://kyc-api.surepass.io/api/v1/pan/pan";

const JSON_HEADERS = { "Content-Type": "application/json" };

function json(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: JSON_HEADERS,
  });
}

serve(async (req) => {
  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  let body: { id_number?: string } = {};
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  const panNumber = String(body?.id_number ?? "")
    .replace(/\s/g, "")
    .toUpperCase();
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(panNumber)) {
    return json(400, { error: "id_number must be a valid PAN" });
  }

  const token = Deno.env.get("SUREPASS_PAN_VERIFY_TOKEN") ?? "";
  if (!token) {
    return json(500, { error: "Missing SUREPASS_PAN_VERIFY_TOKEN secret" });
  }

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(PAN_VERIFY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: token,
      },
      body: JSON.stringify({ id_number: panNumber }),
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

  if (!upstreamResponse.ok) {
    const message =
      (upstreamBody?.message as string | undefined) ||
      `Provider request failed (${upstreamResponse.status})`;
    return json(502, { error: message, upstream: upstreamBody ?? rawText });
  }

  const data = (upstreamBody?.data as Record<string, unknown> | undefined) ?? {};
  return json(200, {
    ok: true,
    data,
    success: Boolean(upstreamBody?.success),
    messageCode: String(upstreamBody?.message_code ?? "").trim() || null,
  });
});
