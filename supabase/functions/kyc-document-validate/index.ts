import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";

const JSON_HEADERS = { "Content-Type": "application/json" };

const KYC_KINDS = ["aadhaar_front", "aadhaar_back", "pan_card"] as const;
type KycKind = (typeof KYC_KINDS)[number];

type RequestBody = {
  kind?: string;
  mime_type?: string;
  image_base64?: string;
  expected_aadhaar_number?: string | null;
  expected_pan_number?: string | null;
};

type ValidationResult = {
  expected_kind: KycKind;
  detected_kind: KycKind | "other";
  is_expected_kind: boolean;
  quality_ok: boolean;
  confidence: number;
  warnings: string[];
  extracted: {
    aadhaar_number: string | null;
    pan_number: string | null;
    full_name: string | null;
  };
  matches: {
    aadhaar_number_match: boolean | null;
    pan_number_match: boolean | null;
  };
};

function json(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: JSON_HEADERS,
  });
}

function asKycKind(raw: string): KycKind | null {
  const candidate = String(raw || "").trim();
  return (KYC_KINDS as readonly string[]).includes(candidate)
    ? (candidate as KycKind)
    : null;
}

function normalizeDigits(raw: unknown): string {
  return String(raw ?? "").replace(/\D/g, "");
}

function normalizePan(raw: unknown): string {
  return String(raw ?? "")
    .replace(/\s/g, "")
    .toUpperCase();
}

function parseOpenAiJson(rawContent: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(rawContent);
    if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
    return {};
  } catch {
    return {};
  }
}

function toStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => String(item ?? "").trim())
    .filter((item) => Boolean(item));
}

function parseConfidence(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function buildPrompt(kind: KycKind, expectedAadhaar: string, expectedPan: string): string {
  const commonRules = [
    "You are validating Indian KYC document images for onboarding.",
    "Return JSON only, no markdown.",
    "If text is unreadable/blurry/glare/cropped, include warning.",
    "Never invent values. Use null if unsure.",
    "Allowed detected_kind values: aadhaar_front, aadhaar_back, pan_card, other.",
  ];

  const kindRules =
    kind === "aadhaar_front"
      ? [
          "Expected: Aadhaar FRONT side.",
          "Front usually has holder photo and identity details.",
          "If image looks like Aadhaar back or PAN, set is_expected_kind false and warn.",
        ]
      : kind === "aadhaar_back"
        ? [
            "Expected: Aadhaar BACK side.",
            "Back usually has address block and often QR code area.",
            "If image looks like Aadhaar front or PAN, set is_expected_kind false and warn.",
          ]
        : [
            "Expected: PAN card image.",
            "If image looks like Aadhaar front/back or non-PAN doc, set is_expected_kind false and warn.",
          ];

  const expectedValues = [
    `Expected Aadhaar number for match check (may be empty): ${expectedAadhaar || "N/A"}`,
    `Expected PAN number for match check (may be empty): ${expectedPan || "N/A"}`,
  ];

  const outputSchema = [
    "Output shape:",
    "{",
    '  "detected_kind": "aadhaar_front|aadhaar_back|pan_card|other",',
    '  "is_expected_kind": true|false,',
    '  "quality_ok": true|false,',
    '  "confidence": 0..1,',
    '  "warnings": ["..."],',
    '  "extracted": {',
    '    "aadhaar_number": "12 digits or null",',
    '    "pan_number": "ABCDE1234F or null",',
    '    "full_name": "string or null"',
    "  }",
    "}",
  ];

  return [...commonRules, ...kindRules, ...expectedValues, ...outputSchema].join("\n");
}

function normalizeResult(
  kind: KycKind,
  parsed: Record<string, unknown>,
  expectedAadhaar: string,
  expectedPan: string,
): ValidationResult {
  const detectedRaw = String(parsed.detected_kind ?? "").trim();
  const detectedKind =
    detectedRaw === "aadhaar_front" ||
      detectedRaw === "aadhaar_back" ||
      detectedRaw === "pan_card"
      ? (detectedRaw as KycKind)
      : "other";

  const extractedRaw =
    parsed.extracted && typeof parsed.extracted === "object"
      ? (parsed.extracted as Record<string, unknown>)
      : {};
  const extractedAadhaar = normalizeDigits(extractedRaw.aadhaar_number).slice(0, 12) || "";
  const extractedPan = normalizePan(extractedRaw.pan_number).slice(0, 10) || "";
  const extractedName = String(extractedRaw.full_name ?? "").trim();

  const warnings = toStringArray(parsed.warnings);
  const declaredExpected = Boolean(parsed.is_expected_kind);
  const isExpectedKind = declaredExpected && detectedKind === kind;

  if (detectedKind !== kind) {
    warnings.push(`Document seems to be ${detectedKind.replace("_", " ")} instead of ${kind.replace("_", " ")}.`);
  }
  if (!parsed.quality_ok) {
    warnings.push("Image quality is low. Please upload a clearer photo.");
  }

  const aadhaarMatch =
    expectedAadhaar && extractedAadhaar
      ? expectedAadhaar === extractedAadhaar
      : null;
  const panMatch = expectedPan && extractedPan ? expectedPan === extractedPan : null;

  if (aadhaarMatch === false) {
    warnings.push("Aadhaar number on image does not match the verified Aadhaar number.");
  }
  if (panMatch === false) {
    warnings.push("PAN number on image does not match the verified PAN number.");
  }

  return {
    expected_kind: kind,
    detected_kind: detectedKind,
    is_expected_kind: isExpectedKind,
    quality_ok: Boolean(parsed.quality_ok),
    confidence: parseConfidence(parsed.confidence),
    warnings: Array.from(new Set(warnings)).slice(0, 6),
    extracted: {
      aadhaar_number: extractedAadhaar || null,
      pan_number: extractedPan || null,
      full_name: extractedName || null,
    },
    matches: {
      aadhaar_number_match: aadhaarMatch,
      pan_number_match: panMatch,
    },
  };
}

serve(async (req) => {
  console.log("[kyc-document-validate] request received", { method: req.method });
  if (req.method !== "POST") {
    console.warn("[kyc-document-validate] rejected non-POST request");
    return json(405, { error: "Method not allowed" });
  }

  let body: RequestBody = {};
  try {
    body = await req.json();
  } catch {
    console.warn("[kyc-document-validate] invalid JSON body");
    return json(400, { error: "Invalid JSON body" });
  }

  const kind = asKycKind(String(body.kind ?? ""));
  if (!kind) {
    console.warn("[kyc-document-validate] invalid kind", { kind: body.kind ?? null });
    return json(400, { error: "kind must be one of aadhaar_front, aadhaar_back, pan_card" });
  }

  const mimeType = String(body.mime_type ?? "").trim().toLowerCase();
  if (!mimeType.startsWith("image/")) {
    console.warn("[kyc-document-validate] invalid mime type", { mimeType });
    return json(400, { error: "mime_type must be an image type" });
  }

  const imageBase64 = String(body.image_base64 ?? "").trim();
  if (!imageBase64) {
    console.warn("[kyc-document-validate] missing image payload", { kind, mimeType });
    return json(400, { error: "image_base64 is required" });
  }
  console.log("[kyc-document-validate] input accepted", {
    kind,
    mimeType,
    imageBase64Length: imageBase64.length,
  });

  const apiKey = Deno.env.get("OPENAI_API_KEY") ?? "";
  if (!apiKey) {
    console.error("[kyc-document-validate] OPENAI_API_KEY is missing");
    return json(500, { error: "Missing OPENAI_API_KEY secret" });
  }

  const model = String(Deno.env.get("OPENAI_KYC_MODEL") ?? DEFAULT_OPENAI_MODEL).trim() || DEFAULT_OPENAI_MODEL;
  const expectedAadhaar = normalizeDigits(body.expected_aadhaar_number).slice(0, 12);
  const expectedPan = normalizePan(body.expected_pan_number).slice(0, 10);
  const prompt = buildPrompt(kind, expectedAadhaar, expectedPan);
  console.log("[kyc-document-validate] calling OpenAI", {
    model,
    kind,
    hasExpectedAadhaar: Boolean(expectedAadhaar),
    hasExpectedPan: Boolean(expectedPan),
  });

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "You are a strict KYC document classifier. Always return valid JSON.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${imageBase64}`,
                },
              },
            ],
          },
        ],
      }),
    });
  } catch {
    console.error("[kyc-document-validate] failed to reach OpenAI API");
    return json(502, { error: "Failed to reach OpenAI API" });
  }
  console.log("[kyc-document-validate] OpenAI response received", {
    status: upstreamResponse.status,
    ok: upstreamResponse.ok,
  });

  const upstreamRawText = await upstreamResponse.text();
  let upstreamBody: Record<string, unknown> | null = null;
  try {
    upstreamBody = upstreamRawText ? JSON.parse(upstreamRawText) : null;
  } catch {
    upstreamBody = null;
  }

  if (!upstreamResponse.ok) {
    const message =
      String(upstreamBody?.error && typeof upstreamBody.error === "object"
        ? (upstreamBody.error as Record<string, unknown>).message ?? ""
        : "").trim() || `OpenAI request failed (${upstreamResponse.status})`;
    console.error("[kyc-document-validate] OpenAI returned error", {
      status: upstreamResponse.status,
      message,
    });
    return json(502, {
      error: message,
      upstream: upstreamBody ?? upstreamRawText,
    });
  }

  const choice0 =
    Array.isArray(upstreamBody?.choices) && upstreamBody?.choices.length > 0
      ? (upstreamBody.choices[0] as Record<string, unknown>)
      : {};
  const messageObj =
    choice0.message && typeof choice0.message === "object"
      ? (choice0.message as Record<string, unknown>)
      : {};
  const rawContent = String(messageObj.content ?? "").trim();

  if (!rawContent) {
    console.error("[kyc-document-validate] empty content from OpenAI");
    return json(502, { error: "OpenAI returned empty content", upstream: upstreamBody ?? null });
  }

  const parsed = parseOpenAiJson(rawContent);
  const result = normalizeResult(kind, parsed, expectedAadhaar, expectedPan);
  console.log("[kyc-document-validate] validation completed", {
    kind,
    detectedKind: result.detected_kind,
    isExpectedKind: result.is_expected_kind,
    warningCount: result.warnings.length,
    aadhaarMatch: result.matches.aadhaar_number_match,
    panMatch: result.matches.pan_number_match,
  });

  return json(200, {
    ok: true,
    result,
    model,
  });
});
