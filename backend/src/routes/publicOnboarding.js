import { Router } from 'express';
import multer from 'multer';
import { supabaseAdmin } from '../supabase.js';
import { compressKycImageBuffer } from '../utils/kycImageCompress.js';
import { namesLikelyMatch } from '../utils/nameMatch.js';

const router = Router();

const DRIVING_LICENSE_BUCKET = 'driving-licenses';
const QUALIFICATION_BUCKET = 'qualification-certificates';
const KYC_DOCUMENTS_BUCKET = 'kyc-documents';
const BANK_PHOTO_DOCUMENTS_BUCKET = 'bank-photo-documents';
const ONBOARDING_DOCUMENT_FIELD_CONFIG = {
  pd_driving_license_url: { bucket: DRIVING_LICENSE_BUCKET, mode: 'single' },
  qual_highest_qualification_doc_url: { bucket: QUALIFICATION_BUCKET, mode: 'single' },
  qual_education_certificate_url: { bucket: QUALIFICATION_BUCKET, mode: 'single' },
  qual_additional_certificates_url: { bucket: QUALIFICATION_BUCKET, mode: 'array' },
  kyc_aadhar_front_url: { bucket: KYC_DOCUMENTS_BUCKET, mode: 'single' },
  kyc_aadhar_back_url: { bucket: KYC_DOCUMENTS_BUCKET, mode: 'single' },
  kyc_pan_card_url: { bucket: KYC_DOCUMENTS_BUCKET, mode: 'single' },
  kyc_bank_passbook_url: { bucket: KYC_DOCUMENTS_BUCKET, mode: 'single' },
  bp_passport_photo_url: { bucket: BANK_PHOTO_DOCUMENTS_BUCKET, mode: 'single' },
  bp_police_verification_url: { bucket: BANK_PHOTO_DOCUMENTS_BUCKET, mode: 'single' },
  bp_pf_uan_face_auth_screenshot_url: { bucket: BANK_PHOTO_DOCUMENTS_BUCKET, mode: 'single' },
};
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_DRIVING_LICENSE_BYTES = MAX_UPLOAD_BYTES;
const MAX_QUALIFICATION_BYTES = MAX_UPLOAD_BYTES;
const MAX_KYC_IMAGE_DOCUMENT_BYTES = MAX_UPLOAD_BYTES;
const MAX_KYC_VALIDATE_BYTES = MAX_UPLOAD_BYTES;
const MAX_BANK_PHOTO_DOCUMENT_BYTES = MAX_UPLOAD_BYTES;

const PAN_NUMBER_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const IFSC_CODE_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const ACCOUNT_NUMBER_REGEX = /^[0-9]{9,18}$/;
const PLACEHOLDER_ACCOUNT_REGEX = /^0+$/;
const PLACEHOLDER_IFSC_REGEX = /^[A-Z]{4}0{7}$/;
const PINCODE_REGEX = /^[0-9]{6}$/;
const MAX_SUBMISSION_ATTEMPTS = 3;

const CORRECTION_FIELD_SET = new Set([
  'email',
  'pd_secondary_mobile',
  'pd_father_name',
  'pd_mother_name',
  'pd_spouse_name',
  'pd_alternate_number',
  'pd_emergency_contact_name',
  'pd_emergency_contact_relation',
  'pd_current_address_same_as_aadhaar',
  'pd_current_address',
  'pd_current_state',
  'pd_current_city',
  'pd_current_pincode',
  'pd_marital_status',
  'pd_driving_license',
  'pd_driving_license_url',
  'qual_highest_qualification',
  'qual_highest_qualification_doc_url',
  'qual_education_certificate_url',
  'qual_additional_certificates_url',
  'kyc_aadhar_front_url',
  'kyc_aadhar_back_url',
  'kyc_pan_number',
  'kyc_pan_card_url',
  'kyc_account_holder_name',
  'kyc_account_number',
  'kyc_ifsc_code',
  'kyc_bank_passbook_url',
  'bp_passport_photo_url',
  'bp_esic_number',
  'bp_pf_uan_number',
  'bp_pf_uan_face_auth_screenshot_url',
  'bp_police_verification_url',
  'bp_nominee_name',
  'bp_nominee_relation',
  'bp_nominee_mobile',
]);
const CORRECTION_OPTIONAL_FIELDS = new Set([
  'qual_additional_certificates_url',
  'bp_esic_number',
  'bp_police_verification_url'
]);

const HIGHEST_QUALIFICATION_VALUES = new Set([
  '10th Pass',
  '12th Pass',
  'Diploma',
  'ITI',
  'Graduate',
  'Post Graduate',
  'Professional Degree',
  'Others',
]);

const licenseUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_DRIVING_LICENSE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!String(file.mimetype || '').startsWith('image/')) {
      cb(new Error('Only image files are allowed'));
      return;
    }
    cb(null, true);
  },
});

function extFromMime(mime) {
  const m = String(mime || '').toLowerCase();
  if (m === 'image/jpeg' || m === 'image/jpg') return 'jpg';
  if (m === 'image/png') return 'png';
  if (m === 'image/webp') return 'webp';
  if (m === 'image/gif') return 'gif';
  if (m === 'image/heic' || m === 'image/heif') return 'heic';
  return 'img';
}

function isAllowedOcrImageMime(mime) {
  const m = String(mime || '').toLowerCase();
  return m === 'image/jpeg' || m === 'image/jpg' || m === 'image/png' || m === 'image/webp';
}

function isAllowedQualificationMime(mime) {
  const m = String(mime || '').toLowerCase();
  if (m.startsWith('image/')) return true;
  if (m === 'application/pdf') return true;
  if (m === 'application/msword') return true;
  if (m === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return true;
  return false;
}

function extForQualificationFile(mime, originalname) {
  const m = String(mime || '').toLowerCase();
  if (m === 'application/pdf') return 'pdf';
  if (m === 'application/msword') return 'doc';
  if (m === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
  const fromMime = extFromMime(mime);
  if (fromMime !== 'img') return fromMime;
  const match = /\.([a-z0-9]+)$/i.exec(String(originalname || ''));
  return match ? match[1].toLowerCase().slice(0, 8) : 'bin';
}

const qualificationUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_QUALIFICATION_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!isAllowedQualificationMime(file.mimetype)) {
      cb(new Error('File must be an image, PDF, or Word document (.doc / .docx)'));
      return;
    }
    cb(null, true);
  },
});

const kycImageOnlyUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_KYC_IMAGE_DOCUMENT_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!isAllowedOcrImageMime(file.mimetype)) {
      cb(new Error('Only JPG, JPEG, PNG, or WEBP images are allowed'));
      return;
    }
    cb(null, true);
  },
});

const bpPassportPhotoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BANK_PHOTO_DOCUMENT_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!String(file.mimetype || '').startsWith('image/')) {
      cb(new Error('Only image files are allowed'));
      return;
    }
    cb(null, true);
  },
});

const bpPoliceVerificationUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BANK_PHOTO_DOCUMENT_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!isAllowedQualificationMime(file.mimetype)) {
      cb(new Error('File must be an image, PDF, or Word document (.doc / .docx)'));
      return;
    }
    cb(null, true);
  },
});

function normalizeAdditionalCertificateUrls(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    return raw
      .filter((u) => typeof u === 'string' && u.trim())
      .map((u) => u.trim())
      .slice(0, 20);
  }
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (!t) return [];
    try {
      const p = JSON.parse(t);
      return normalizeAdditionalCertificateUrls(p);
    } catch {
      return [t];
    }
  }
  return [];
}

function normalizeComparableValue(v) {
  if (v == null) return null;
  if (Array.isArray(v)) {
    return v.map((x) => normalizeComparableValue(x));
  }
  if (typeof v === 'object') return v;
  if (typeof v === 'string') return v.trim();
  return v;
}

function isEmptyValue(v) {
  if (v == null) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) {
    return v.filter((x) => typeof x === 'string' && x.trim()).length === 0;
  }
  return false;
}

function isSameValue(a, b) {
  return JSON.stringify(normalizeComparableValue(a)) === JSON.stringify(normalizeComparableValue(b));
}

function editableFieldsFromFormRow(formRow) {
  const raw = formRow?.editable_fields;
  if (!Array.isArray(raw)) return new Set();
  const out = new Set();
  for (const f of raw) {
    const key = String(f ?? '').trim();
    if (!key || !CORRECTION_FIELD_SET.has(key)) continue;
    out.add(key);
  }
  return out;
}
const MOBILE_DIGITS_REGEX = /\D/g;
const TEN_DIGIT_REGEX = /^\d{10}$/;
const TWELVE_DIGIT_REGEX = /^\d{12}$/;
const OTP_TTL_MS = 15 * 60 * 1000;
const AADHAAR_SEND_OTP_EDGE_FUNCTION =
  process.env.AADHAAR_SEND_OTP_EDGE_FUNCTION || 'aadhaar-send-otp';
const AADHAAR_VERIFY_OTP_EDGE_FUNCTION =
  process.env.AADHAAR_VERIFY_OTP_EDGE_FUNCTION || 'aadhaar-verify-otp';
const BANK_VERIFY_EDGE_FUNCTION =
  process.env.BANK_VERIFY_EDGE_FUNCTION || 'bank-verify';
const PAN_VERIFY_EDGE_FUNCTION =
  process.env.PAN_VERIFY_EDGE_FUNCTION || 'pan-verify';
const KYC_DOC_VALIDATE_EDGE_FUNCTION =
  process.env.KYC_DOC_VALIDATE_EDGE_FUNCTION || 'kyc-document-validate';
const SEND_EMAIL_OTP_EDGE_FUNCTION =
  process.env.SEND_EMAIL_OTP_EDGE_FUNCTION || 'send-email-otp';
const SEND_MOBILE_OTP_EDGE_FUNCTION =
  process.env.SEND_MOBILE_OTP_EDGE_FUNCTION || 'send-mobile-otp';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Fixed demo OTP for email contact verification in non-production only. */
const DEMO_CONTACT_OTP = '123123';
/**
 * Fixed demo OTP for mobile flows (status, Aadhaar resume, alternate mobile)
 * while Awign/TELSPIEL delivery is unreliable. Enabled when MOBILE_OTP_DEMO=true
 * or when NODE_ENV is not production (default for local `npm run dev`).
 */
const DEMO_MOBILE_OTP = '123123';
const STATUS_SESSION_TTL_MS = 60 * 60 * 1000;

/** @type {Map<string, { otp: string, expires: number }>} */
const statusOtpBySession = new Map();
/** @type {Map<string, { otp: string, expires: number, target: string }>} */
const contactOtpBySession = new Map();
/** @type {Map<string, { otp: string, expires: number }>} */
const aadhaarResumeOtpBySession = new Map();
/** @type {Map<string, { employeeId: string, mobile: string, expires: number }>} */
const statusAuthByToken = new Map();

function sessionKey(employeeId, mobile) {
  return `${employeeId}:${mobile}`;
}

function createStatusSessionToken(employeeId, mobile) {
  return `status_${employeeId}_${mobile}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function contactOtpKey(employeeId, channel) {
  return `${employeeId}:${channel}`;
}

function generateContactOtp() {
  if (process.env.NODE_ENV !== 'production') {
    return DEMO_CONTACT_OTP;
  }
  return String(Math.floor(100000 + Math.random() * 900000));
}

function useDemoMobileOtp() {
  const flag = String(process.env.MOBILE_OTP_DEMO ?? '').trim().toLowerCase();
  if (flag === 'true' || flag === '1' || flag === 'yes') return true;
  if (flag === 'false' || flag === '0' || flag === 'no') return false;
  return process.env.NODE_ENV !== 'production';
}

function generateMobileOtp() {
  if (useDemoMobileOtp()) return DEMO_MOBILE_OTP;
  return String(Math.floor(100000 + Math.random() * 900000));
}

/**
 * Send real SMS unless demo mode is on (skip provider; use fixed DEMO_MOBILE_OTP).
 * @returns {Promise<{ delivery: 'demo' | 'sms', otp: string }>}
 */
async function sendMobileOtpDelivery({ mobile, name }) {
  const otp = generateMobileOtp();
  if (useDemoMobileOtp()) {
    return { delivery: 'demo', otp };
  }
  await invokeSendMobileOtpEdge({ mobile, otp, name: name || '' });
  return { delivery: 'sms', otp };
}

const AWIGN_SMS_URL = 'https://core-api.awign.com/api/v1/sms/to_number';
const AWIGN_SMS_TEMPLATE_ID = '1107160412653314461';
const AWIGN_SMS_SENDER_ID = 'IAWIGN';
const AWIGN_SMS_CHANNEL = 'telspiel_product';
const AWIGN_SMS_CALLER_ID = 'staffing_go';
const AWIGN_SMS_CLIENT = '6Ok5D1iEP4zcV8S25HJmNA';
const AWIGN_SMS_UID = '110986717252553637625';
const AWIGN_SMS_MESSAGE_TEMPLATE =
  '{#var#} is the OTP for your verification.\n\nCheers!\nTeam AWIGN';

function normalizeMobile10ForSms(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (!digits) return null;
  const local = digits.length >= 10 ? digits.slice(-10) : digits;
  return local.length === 10 ? local : null;
}

/**
 * Prefer direct Awign SMS with sync:true (edge without sync left messages stuck as
 * status=created / message_reference_id=null and they never reached the phone).
 * Falls back to the Supabase edge function when Mobile_OTP_KEY is not set locally.
 */
async function invokeSendMobileOtpEdge({ mobile, otp, name }) {
  const accessToken = String(process.env.Mobile_OTP_KEY ?? process.env.mobile_otp ?? '').trim();
  const to = normalizeMobile10ForSms(mobile);
  if (!to) {
    const err = new Error('A valid 10-digit mobile number is required.');
    err.statusCode = 400;
    throw err;
  }
  if (!/^\d{6}$/.test(String(otp ?? '').replace(/\D/g, ''))) {
    const err = new Error('otp must be 6 digits');
    err.statusCode = 400;
    throw err;
  }

  if (accessToken) {
    const message = AWIGN_SMS_MESSAGE_TEMPLATE.replace('{#var#}', String(otp).replace(/\D/g, ''));
    const resp = await fetch(AWIGN_SMS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'access-token': accessToken,
        client: AWIGN_SMS_CLIENT,
        uid: AWIGN_SMS_UID,
        'x-caller-id': AWIGN_SMS_CALLER_ID,
      },
      body: JSON.stringify({
        sms: {
          mobile_number: to,
          template_id: AWIGN_SMS_TEMPLATE_ID,
          message,
          sender_id: AWIGN_SMS_SENDER_ID,
          channel: AWIGN_SMS_CHANNEL,
          sync: true,
        },
      }),
    });
    const raw = await resp.text();
    let body = null;
    try {
      body = raw ? JSON.parse(raw) : null;
    } catch {
      body = null;
    }
    const data = body?.data && typeof body.data === 'object' ? body.data : null;
    const statusText = String(body?.status ?? '').trim().toLowerCase();
    const refId = data?.message_reference_id ?? data?.id ?? null;
    const accepted =
      statusText === 'success' &&
      (Boolean(refId) ||
        ['processing', 'created', 'queued', 'sent', 'success'].includes(
          String(data?.status ?? '').trim().toLowerCase()
        ));
    if (!resp.ok || !accepted) {
      const msg = body?.message || body?.error || `Awign SMS request failed (${resp.status})`;
      const err = new Error(msg);
      err.details = body ?? raw;
      err.statusCode = resp.status >= 400 && resp.status < 600 ? resp.status : 502;
      throw err;
    }
    return {
      ok: true,
      to,
      channel: 'sms',
      provider_id: refId,
      awign_status: data?.status ?? body?.status ?? null,
      upstream: body,
    };
  }

  const supabaseUrl = String(process.env.SUPABASE_URL ?? '').trim();
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'Mobile_OTP_KEY (or SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY) is required to send mobile OTP.'
    );
  }

  const endpoint = `${supabaseUrl}/functions/v1/${encodeURIComponent(SEND_MOBILE_OTP_EDGE_FUNCTION)}`;
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ mobile: to, otp, name: name || '' }),
  });

  const raw = await resp.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!resp.ok) {
    const msg = body?.error || body?.message || `Edge function failed (${resp.status})`;
    const err = new Error(msg);
    err.details = body?.upstream ?? body ?? null;
    err.statusCode = resp.status >= 400 && resp.status < 600 ? resp.status : 502;
    throw err;
  }
  return body ?? {};
}

function normalizeEmail(raw) {
  return String(raw ?? '').trim().toLowerCase();
}

async function invokeSendEmailOtpEdge({ email, otp, name }) {
  const supabaseUrl = String(process.env.SUPABASE_URL ?? '').trim();
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to invoke edge functions.');
  }

  const endpoint = `${supabaseUrl}/functions/v1/${encodeURIComponent(SEND_EMAIL_OTP_EDGE_FUNCTION)}`;
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, otp, name: name || '' }),
  });

  const raw = await resp.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!resp.ok) {
    const msg = body?.error || body?.message || `Edge function failed (${resp.status})`;
    const err = new Error(msg);
    err.details = body?.upstream ?? body ?? null;
    throw err;
  }
  return body ?? {};
}

async function assertOnboardingFormEditable(emp, mobile) {
  const { data: formCurrent, error: formCurrentErr } = await supabaseAdmin
    .from('job_app_form')
    .select('review_status, submission_status, editable_fields')
    .eq('employee_id', emp.id)
    .eq('mobile', mobile)
    .maybeSingle();
  if (formCurrentErr) throw formCurrentErr;
  if (!formCurrent) {
    const err = new Error('Application form not found or mobile mismatch.');
    err.statusCode = 404;
    throw err;
  }
  if (formCurrent.review_status === 'REJECTED') {
    const err = new Error('Application is rejected and cannot be edited.');
    err.statusCode = 400;
    throw err;
  }
  if (formCurrent.review_status === 'APPROVED') {
    const err = new Error('Application is approved and cannot be edited.');
    err.statusCode = 400;
    throw err;
  }
  const correctionMode = formCurrent.review_status === 'CORRECTION_REQUESTED';
  if (formCurrent.submission_status === 'Submitted' && !correctionMode) {
    const err = new Error('Application is already submitted and under review.');
    err.statusCode = 400;
    throw err;
  }
  return formCurrent;
}

async function invokeAadhaarSendOtpEdge({ uid }) {
  const supabaseUrl = String(process.env.SUPABASE_URL ?? '').trim();
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to invoke edge functions.');
  }

  const endpoint = `${supabaseUrl}/functions/v1/${encodeURIComponent(AADHAAR_SEND_OTP_EDGE_FUNCTION)}`;
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ uid }),
  });

  const raw = await resp.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!resp.ok) {
    const msg = body?.error || body?.message || `Edge function failed (${resp.status})`;
    const err = new Error(msg);
    err.details = body?.upstream ?? body ?? null;
    throw err;
  }
  return body;
}

async function invokeAadhaarVerifyOtpEdge({ sessionId, otp }) {
  const supabaseUrl = String(process.env.SUPABASE_URL ?? '').trim();
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to invoke edge functions.');
  }

  const endpoint = `${supabaseUrl}/functions/v1/${encodeURIComponent(AADHAAR_VERIFY_OTP_EDGE_FUNCTION)}`;
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sessionId, otp }),
  });

  const raw = await resp.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!resp.ok) {
    const msg = body?.error || body?.message || `Edge function failed (${resp.status})`;
    const err = new Error(msg);
    err.details = body?.upstream ?? body ?? null;
    throw err;
  }
  return body;
}

function createPartnerKycEdgeError(resp, body) {
  const msg = body?.message || body?.error || `Edge function failed (${resp.status})`;
  const err = new Error(msg);
  err.status = resp.status;
  err.errorCode = String(body?.error_code ?? '').trim() || null;
  err.details = body?.upstream ?? body ?? null;
  err.isClientRejection = resp.status === 400 || resp.status === 422;
  return err;
}

async function invokeBankVerifyEdge({ idNumber, ifsc }) {
  const supabaseUrl = String(process.env.SUPABASE_URL ?? '').trim();
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to invoke edge functions.');
  }

  const endpoint = `${supabaseUrl}/functions/v1/${encodeURIComponent(BANK_VERIFY_EDGE_FUNCTION)}`;
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ id_number: idNumber, ifsc }),
  });

  const raw = await resp.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!resp.ok) {
    throw createPartnerKycEdgeError(resp, body);
  }
  return body;
}

async function invokePanVerifyEdge({ idNumber }) {
  const supabaseUrl = String(process.env.SUPABASE_URL ?? '').trim();
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to invoke edge functions.');
  }

  const endpoint = `${supabaseUrl}/functions/v1/${encodeURIComponent(PAN_VERIFY_EDGE_FUNCTION)}`;
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ id_number: idNumber }),
  });

  const raw = await resp.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!resp.ok) {
    throw createPartnerKycEdgeError(resp, body);
  }
  return body;
}

async function invokeKycDocValidateEdge({
  kind,
  mimeType,
  imageBase64,
  expectedAadhaarNumber,
  expectedPanNumber,
}) {
  const supabaseUrl = String(process.env.SUPABASE_URL ?? '').trim();
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to invoke edge functions.');
  }

  const endpoint = `${supabaseUrl}/functions/v1/${encodeURIComponent(KYC_DOC_VALIDATE_EDGE_FUNCTION)}`;
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      kind,
      mime_type: mimeType,
      image_base64: imageBase64,
      expected_aadhaar_number: expectedAadhaarNumber || null,
      expected_pan_number: expectedPanNumber || null,
    }),
  });

  const raw = await resp.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!resp.ok) {
    const msg = body?.error || body?.message || `Edge function failed (${resp.status})`;
    const err = new Error(msg);
    err.details = body?.upstream ?? body ?? null;
    throw err;
  }
  return body;
}

function firstNonEmptyString(...candidates) {
  for (const raw of candidates) {
    if (raw == null) continue;
    if (typeof raw === 'object') continue;
    const v = String(raw).trim();
    if (v) return v;
  }
  return '';
}

function isoFromDdMmYyyy(raw) {
  const t = String(raw ?? '').trim();
  if (!t) return null;
  let m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(t);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

function genderCodeFromProvider(raw) {
  const c = String(raw ?? '').trim().toUpperCase();
  if (c === 'M' || c === 'MALE') return 'M';
  if (c === 'F' || c === 'FEMALE') return 'F';
  if (c === 'T' || c === 'X' || c === 'O' || c === 'OTHER' || c === 'TRANSGENDER') return 'X';
  return c || null;
}

function buildAadhaarAddress(parts) {
  return parts
    .map((v) => String(v ?? '').trim())
    .filter((v) => Boolean(v))
    .join(', ');
}

function photoDataUrlFromBase64(photo) {
  const v = String(photo ?? '').trim();
  if (!v) return null;
  if (v.startsWith('data:image/') || v.startsWith('http://') || v.startsWith('https://')) return v;
  return `data:image/jpeg;base64,${v}`;
}

/**
 * Neokred/ProfileX payloads vary (flat vs nested address, camelCase vs snake_case).
 * Normalize into the flat shape we persist on job_app_form.
 */
function extractNeokredAadhaarPayload(edgeResult) {
  let data = edgeResult?.data;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      data = null;
    }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    data = {};
  }

  const nestedKeys = [
    'aadhaarData',
    'aadhaar_data',
    'kycData',
    'kyc_data',
    'kycDetails',
    'kyc_details',
    'result',
    'profile',
    'details',
    'poi',
    'Poi',
  ];
  let profile = data;
  for (const key of nestedKeys) {
    const nested = data[key];
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      const nestedName = firstNonEmptyString(nested.name, nested.fullName, nested.full_name);
      if (nestedName || nested.address || nested.photo || nested.dob || nested.dateOfBirth) {
        profile = nested;
        break;
      }
    }
  }

  const address =
    profile.address && typeof profile.address === 'object' && !Array.isArray(profile.address)
      ? profile.address
      : profile.poa && typeof profile.poa === 'object' && !Array.isArray(profile.poa)
        ? profile.poa
        : profile.Poa && typeof profile.Poa === 'object' && !Array.isArray(profile.Poa)
          ? profile.Poa
          : {};

  const name = firstNonEmptyString(profile.name, profile.fullName, profile.full_name, profile.Name);
  const careOf = firstNonEmptyString(
    profile.careof,
    profile.careOf,
    profile.care_of,
    profile.co,
    profile.Careof,
    address.careof,
    address.careOf,
    address.care_of,
    address.co
  );
  const dobRaw = firstNonEmptyString(
    profile.dob,
    profile.dateOfBirth,
    profile.date_of_birth,
    profile.DoB,
    profile.dobDate
  );
  const gender = genderCodeFromProvider(
    firstNonEmptyString(profile.gender, profile.Gender, address.gender)
  );
  const house = firstNonEmptyString(profile.house, address.house);
  const street = firstNonEmptyString(profile.street, address.street);
  const locality = firstNonEmptyString(
    profile.locality,
    profile.loc,
    profile.location,
    address.locality,
    address.loc,
    address.location,
    profile.vtc,
    address.vtc
  );
  const subDistrict = firstNonEmptyString(
    profile.subDistrict,
    profile.subdistrict,
    profile.sub_district,
    profile.subdist,
    address.subDistrict,
    address.subdistrict,
    address.sub_district,
    address.subdist
  );
  const district = firstNonEmptyString(
    profile.district,
    profile.dist,
    address.district,
    address.dist
  );
  const state = firstNonEmptyString(profile.state, address.state);
  const pincode = firstNonEmptyString(
    profile.pincode,
    profile.pinCode,
    profile.pin,
    profile.pc,
    profile.postCode,
    profile.postal_code,
    address.pincode,
    address.pinCode,
    address.pin,
    address.pc,
    address.postCode,
    address.postal_code
  );
  const fullAddress = firstNonEmptyString(
    profile.full_address,
    profile.fullAddress,
    profile.address_line,
    typeof profile.address === 'string' ? profile.address : '',
    typeof address.full_address === 'string' ? address.full_address : '',
    typeof address.fullAddress === 'string' ? address.fullAddress : ''
  );
  const builtAddress = buildAadhaarAddress([
    house,
    street,
    locality,
    subDistrict,
    district,
    state,
    pincode,
  ]);
  const photo = firstNonEmptyString(
    profile.photo,
    profile.Photo,
    profile.image,
    profile.Image,
    profile.profilePhoto,
    profile.profile_photo,
    profile.Pht
  );
  const uid = String(
    profile.aadhaar_number ??
      profile.aadhaarNumber ??
      profile.uid ??
      profile.maskedNumber ??
      profile.masked_aadhaar ??
      ''
  ).replace(/\D/g, '');

  return {
    name,
    careOf,
    dob: isoFromDdMmYyyy(dobRaw),
    gender,
    state,
    district,
    pincode,
    address: builtAddress || fullAddress,
    photo: photoDataUrlFromBase64(photo),
    uid,
  };
}

const EMPLOYEE_JOB_FORM_FIELDS =
  'id, client_id, name, mobile, email, designation';

async function resolveOnboardingEmployee(mobile, employeeIdFilter) {
  let query = supabaseAdmin
    .from('employees')
    .select(EMPLOYEE_JOB_FORM_FIELDS)
    .eq('mobile', mobile)
    .eq('onboarding_initiated', true);

  if (employeeIdFilter) {
    query = query.eq('id', employeeIdFilter);
  }

  const { data, error } = await query.limit(1);
  if (error) throw error;
  return (data ?? [])[0] ?? null;
}

async function resolveAadhaarNameForEmployee(employeeId) {
  const id = String(employeeId ?? '').trim();
  if (!id) return '';
  const { data, error } = await supabaseAdmin
    .from('job_app_form')
    .select('aad_name')
    .eq('employee_id', id)
    .maybeSingle();
  if (error) throw error;
  return String(data?.aad_name ?? '').trim();
}

async function fetchClientOnboardingFlags(clientId) {
  const id = String(clientId ?? '').trim();
  if (!id) {
    return {
      require_license_upload: true,
      require_qualification_certificate_upload: true,
    };
  }
  const { data, error } = await supabaseAdmin
    .from('clients')
    .select('require_license_upload, require_qualification_certificate_upload')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return {
    require_license_upload: data?.require_license_upload !== false,
    require_qualification_certificate_upload: data?.require_qualification_certificate_upload !== false,
  };
}

async function formWithClientFlags(form) {
  if (!form || typeof form !== 'object') return form;
  const flags = await fetchClientOnboardingFlags(form.client_id);
  return {
    ...form,
    require_license_upload: flags.require_license_upload,
    require_qualification_certificate_upload: flags.require_qualification_certificate_upload,
  };
}

function storagePathFromPublicUrl(fileUrl, bucket) {
  const rawUrl = String(fileUrl ?? '').trim();
  if (!rawUrl) return null;
  try {
    const parsed = new URL(rawUrl);
    const marker = `/storage/v1/object/public/${bucket}/`;
    const idx = parsed.pathname.indexOf(marker);
    if (idx === -1) return null;
    const pathPart = parsed.pathname.slice(idx + marker.length);
    const normalized = decodeURIComponent(pathPart).replace(/^\/+/, '').trim();
    return normalized || null;
  } catch {
    return null;
  }
}

async function upsertJobAppFormFromEmployee(emp) {
  const now = new Date().toISOString();
  const snapshot = {
    client_id: emp.client_id,
    name: emp.name,
    mobile: emp.mobile,
    email: emp.email ?? null,
    designation: emp.designation ?? null,
    updated_at: now,
  };

  const { data: existing, error: selErr } = await supabaseAdmin
    .from('job_app_form')
    .select('employee_id')
    .eq('employee_id', emp.id)
    .maybeSingle();
  if (selErr) throw selErr;

  if (existing) {
    const { error } = await supabaseAdmin
      .from('job_app_form')
      .update(snapshot)
      .eq('employee_id', emp.id);
    if (error) throw error;
  } else {
    const { error } = await supabaseAdmin.from('job_app_form').insert({
      employee_id: emp.id,
      ...snapshot,
    });
    if (error) throw error;
  }
}

function normalizeMobile(raw) {
  const digits = String(raw ?? '').replace(MOBILE_DIGITS_REGEX, '');
  if (digits.length >= 10) return digits.slice(-10);
  return digits;
}

/** City for personal-details row = Aadhaar district (same value in product). */
function pdCityFromAadDistrict(aadDistrict) {
  if (aadDistrict == null) return null;
  const s = String(aadDistrict).trim();
  return s.length > 0 ? s : null;
}

/** Integer age from Aadhaar DOB (same calendar logic as the onboarding UI). */
function computePdAgeFromAadDob(aadDob) {
  if (aadDob == null || aadDob === '') return null;
  const iso = String(aadDob).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const t = new Date();
  let a = t.getFullYear() - d.getFullYear();
  const m = t.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < d.getDate())) a -= 1;
  if (a < 0 || a > 120) return null;
  return a;
}

router.post('/mobile-lookup', async (req, res, next) => {
  try {
    const mobile = normalizeMobile(req.body?.mobile);
    const employeeId = String(req.body?.employee_id ?? '').trim();

    if (!TEN_DIGIT_REGEX.test(mobile)) {
      return res.status(400).json({ error: 'mobile must be a valid 10-digit number' });
    }

    let query = supabaseAdmin
      .from('employees')
      .select(EMPLOYEE_JOB_FORM_FIELDS)
      .eq('mobile', mobile)
      .eq('onboarding_initiated', true);

    if (employeeId) {
      query = query.eq('id', employeeId);
    }

    const { data, error } = await query.limit(1);
    if (error) throw error;

    const row = (data ?? [])[0];
    if (!row) {
      return res.json({ matched: false });
    }

    await upsertJobAppFormFromEmployee(row);

    return res.json({ matched: true });
  } catch (err) {
    next(err);
  }
});

router.get('/employee-summary', async (req, res, next) => {
  try {
    const employeeId = String(req.query?.employee_id ?? '').trim();
    if (!employeeId) {
      return res.status(400).json({ error: 'employee_id is required' });
    }

    const { data, error } = await supabaseAdmin
      .from('employees')
      .select(EMPLOYEE_JOB_FORM_FIELDS)
      .eq('id', employeeId)
      .eq('onboarding_initiated', true)
      .limit(1);
    if (error) throw error;

    const row = (data ?? [])[0];
    if (!row) {
      return res.status(404).json({ error: 'No matching onboarding record for this link.' });
    }

    await upsertJobAppFormFromEmployee(row);

    return res.json({
      employee: {
        id: row.id,
        name: row.name,
        mobile: row.mobile,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/aadhaar/send-otp', async (req, res, next) => {
  try {
    const mobile = normalizeMobile(req.body?.mobile);
    const employeeIdFilter = String(req.body?.employee_id ?? '').trim();
    const aadhaarDigits = String(req.body?.aadhaar ?? '').replace(/\D/g, '');

    if (!TEN_DIGIT_REGEX.test(mobile)) {
      return res.status(400).json({ error: 'mobile must be a valid 10-digit number' });
    }
    if (!TWELVE_DIGIT_REGEX.test(aadhaarDigits)) {
      return res.status(400).json({ error: 'Aadhaar must be exactly 12 digits' });
    }

    const row = await resolveOnboardingEmployee(mobile, employeeIdFilter || null);
    if (!row) {
      return res.status(400).json({ error: 'No matching onboarding record for this mobile number.' });
    }

    const edgeResult = await invokeAadhaarSendOtpEdge({ uid: aadhaarDigits });
    const sessionId = String(edgeResult?.sessionId ?? '').trim();
    const transactionId = String(edgeResult?.transactionId ?? '').trim() || null;
    if (!sessionId) {
      return res.status(502).json({ error: 'Aadhaar OTP provider did not return a valid session id.' });
    }

    const now = new Date().toISOString();
    const { error: updErr } = await supabaseAdmin.from('job_app_form').upsert(
      {
        employee_id: row.id,
        client_id: row.client_id,
        name: row.name,
        mobile: row.mobile,
        email: row.email ?? null,
        designation: row.designation ?? null,
        aadhaar_number: aadhaarDigits,
        aadhaar_verified: false,
        aad_otp_session_id: sessionId,
        aad_otp_transaction_id: transactionId,
        aad_otp_requested_at: now,
        updated_at: now,
      },
      { onConflict: 'employee_id' }
    );
    if (updErr) throw updErr;

    return res.json({
      ok: true,
      sessionId,
      transactionId,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/aadhaar/verify-otp', async (req, res, next) => {
  try {
    const mobile = normalizeMobile(req.body?.mobile);
    const employeeIdFilter = String(req.body?.employee_id ?? '').trim();
    const otpIn = String(req.body?.otp ?? '').replace(/\D/g, '');

    if (!TEN_DIGIT_REGEX.test(mobile)) {
      return res.status(400).json({ error: 'mobile must be a valid 10-digit number' });
    }
    if (!/^\d{6}$/.test(otpIn)) {
      return res.status(400).json({ error: 'OTP must be 6 digits' });
    }

    const row = await resolveOnboardingEmployee(mobile, employeeIdFilter || null);
    if (!row) {
      return res.status(400).json({ error: 'No matching onboarding record for this mobile number.' });
    }

    const { data: formCurrent, error: formCurrentErr } = await supabaseAdmin
      .from('job_app_form')
      .select('aadhaar_number, aad_otp_session_id')
      .eq('employee_id', row.id)
      .eq('mobile', mobile)
      .maybeSingle();
    if (formCurrentErr) throw formCurrentErr;
    const sessionId = String(formCurrent?.aad_otp_session_id ?? '').trim();
    if (!sessionId) {
      return res.status(400).json({ error: 'No active Aadhaar session found. Please request OTP again.' });
    }

    let edgeResult;
    try {
      edgeResult = await invokeAadhaarVerifyOtpEdge({ sessionId, otp: otpIn });
    } catch (err) {
      const msg = String(err?.message || '').toLowerCase();
      if (msg.includes('failed to download aadhaar details')) {
        return res.status(502).json({
          error: 'Aadhaar verification service is temporarily unavailable. Please try again in a minute.',
        });
      }
      return res.status(502).json({
        error: 'Could not verify Aadhaar OTP right now. Please retry.',
      });
    }
    const mapped = extractNeokredAadhaarPayload(edgeResult);
    const aadName = mapped.name;
    const aadCareOf = mapped.careOf;
    const aadDob = mapped.dob;
    const aadGender = mapped.gender;
    const aadState = mapped.state;
    const aadDistrict = mapped.district;
    const aadPincode = mapped.pincode;
    const aadAddress = mapped.address;
    const aadProfilePhoto = mapped.photo;

    if (!aadName) {
      console.warn('[public/onboarding] Neokred verify returned no Aadhaar name', {
        employeeId: row.id,
        dataKeys:
          edgeResult?.data && typeof edgeResult.data === 'object'
            ? Object.keys(edgeResult.data)
            : typeof edgeResult?.data,
      });
      return res.status(502).json({
        error:
          'Aadhaar OTP was accepted but KYC details were missing in the provider response. Please request a new OTP and try again.',
      });
    }

    const providerUid = String(mapped.uid ?? '').replace(/\D/g, '');
    const persistedAadhaarNumber = TWELVE_DIGIT_REGEX.test(providerUid)
      ? providerUid
      : String(formCurrent?.aadhaar_number ?? '').trim() || null;
    const now = new Date().toISOString();
    const { error: upsertErr } = await supabaseAdmin.from('job_app_form').upsert(
      {
        employee_id: row.id,
        client_id: row.client_id,
        name: row.name,
        mobile: row.mobile,
        email: row.email ?? null,
        designation: row.designation ?? null,
        aadhaar_number: persistedAadhaarNumber,
        aad_profile_photo: aadProfilePhoto,
        aad_name: aadName || null,
        aad_care_of: aadCareOf || null,
        aad_dob: aadDob,
        aad_gender: aadGender,
        aad_address: aadAddress || null,
        aad_state: aadState || null,
        aad_district: aadDistrict || null,
        aad_pincode: aadPincode || null,
        aad_otp_transaction_id: String(edgeResult?.transactionId ?? '').trim() || null,
        aadhaar_verified: true,
        pd_city: pdCityFromAadDistrict(aadDistrict),
        pd_age: computePdAgeFromAadDob(aadDob),
        updated_at: now,
      },
      { onConflict: 'employee_id' }
    );

    if (upsertErr) throw upsertErr;

    const { data: persistedRow, error: persistedErr } = await supabaseAdmin
      .from('job_app_form')
      .select('aadhaar_number, aad_profile_photo, aad_name, aad_care_of, aad_dob, aad_gender, aad_address, aad_state, aad_district, aad_pincode')
      .eq('employee_id', row.id)
      .eq('mobile', mobile)
      .maybeSingle();
    if (persistedErr) throw persistedErr;
    if (!persistedRow) {
      return res.status(500).json({ error: 'Aadhaar verification succeeded but details could not be persisted.' });
    }

    return res.json({
      verified: true,
      aadhaar_number: String(persistedRow?.aadhaar_number ?? '').trim() || '',
      aadhaarDetails: {
        aad_profile_photo: String(persistedRow?.aad_profile_photo ?? ''),
        aad_name: String(persistedRow?.aad_name ?? ''),
        aad_care_of: String(persistedRow?.aad_care_of ?? ''),
        aad_dob: persistedRow?.aad_dob ?? null,
        aad_gender: String(persistedRow?.aad_gender ?? ''),
        aad_address: String(persistedRow?.aad_address ?? ''),
        aad_state: String(persistedRow?.aad_state ?? ''),
        aad_district: String(persistedRow?.aad_district ?? ''),
        aad_pincode: String(persistedRow?.aad_pincode ?? ''),
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/aadhaar/resume/send-otp', async (req, res, next) => {
  try {
    const mobile = normalizeMobile(req.body?.mobile);
    const employeeIdFilter = String(req.body?.employee_id ?? '').trim();

    if (!TEN_DIGIT_REGEX.test(mobile)) {
      return res.status(400).json({ error: 'mobile must be a valid 10-digit number' });
    }

    const row = await resolveOnboardingEmployee(mobile, employeeIdFilter || null);
    if (!row) {
      return res.status(400).json({ error: 'No matching onboarding record for this mobile number.' });
    }

    const { data: formCurrent, error: formCurrentErr } = await supabaseAdmin
      .from('job_app_form')
      .select('aadhaar_number, aadhaar_verified, aad_name')
      .eq('employee_id', row.id)
      .eq('mobile', mobile)
      .maybeSingle();
    if (formCurrentErr) throw formCurrentErr;

    if (!formCurrent || formCurrent.aadhaar_verified !== true) {
      return res.status(400).json({ error: 'Aadhaar is not verified yet. Please complete Aadhaar verification first.' });
    }

    if (!String(formCurrent?.aad_name ?? '').trim()) {
      return res.status(400).json({
        error: 'Saved Aadhaar KYC details are missing. Please verify Aadhaar again with OTP.',
      });
    }

    const savedAadhaar = String(formCurrent?.aadhaar_number ?? '').trim();
    if (!TWELVE_DIGIT_REGEX.test(savedAadhaar)) {
      return res.status(400).json({ error: 'Saved Aadhaar number is invalid. Please verify Aadhaar again.' });
    }

    const { delivery, otp } = await sendMobileOtpDelivery({
      mobile,
      name: row.name ?? '',
    });

    const key = sessionKey(row.id, mobile);
    aadhaarResumeOtpBySession.set(key, { otp, expires: Date.now() + OTP_TTL_MS });
    if (delivery === 'demo') {
      console.log(
        `[public/onboarding] Aadhaar resume demo OTP for employee ${row.id}: ${DEMO_MOBILE_OTP}`
      );
    } else {
      console.log(`[public/onboarding] Aadhaar resume OTP sent via SMS for employee ${row.id} (${mobile})`);
    }

    return res.json({
      ok: true,
      delivery,
      ...(delivery === 'demo' ? { message: 'Demo OTP: use 123123' } : {}),
    });
  } catch (err) {
    if (err?.statusCode) {
      return res.status(err.statusCode).json({
        error: err.message || 'Could not send OTP via SMS. Please try again.',
        details: err.details ?? null,
      });
    }
    next(err);
  }
});

router.post('/aadhaar/resume/verify-otp', async (req, res, next) => {
  try {
    const mobile = normalizeMobile(req.body?.mobile);
    const employeeIdFilter = String(req.body?.employee_id ?? '').trim();
    const otpIn = String(req.body?.otp ?? '').replace(/\D/g, '');

    if (!TEN_DIGIT_REGEX.test(mobile)) {
      return res.status(400).json({ error: 'mobile must be a valid 10-digit number' });
    }
    if (!/^\d{6}$/.test(otpIn)) {
      return res.status(400).json({ error: 'OTP must be 6 digits' });
    }

    const row = await resolveOnboardingEmployee(mobile, employeeIdFilter || null);
    if (!row) {
      return res.status(400).json({ error: 'No matching onboarding record for this mobile number.' });
    }

    const key = sessionKey(row.id, mobile);
    const entry = aadhaarResumeOtpBySession.get(key);
    if (!entry || Date.now() > entry.expires) {
      return res.status(400).json({ error: 'OTP expired or not found. Request a new OTP.' });
    }
    if (entry.otp !== otpIn) {
      return res.status(400).json({ error: 'Invalid OTP' });
    }
    aadhaarResumeOtpBySession.delete(key);

    const { data: formCurrent, error: formCurrentErr } = await supabaseAdmin
      .from('job_app_form')
      .select('aadhaar_number, aadhaar_verified, aad_profile_photo, aad_name, aad_care_of, aad_dob, aad_gender, aad_address, aad_state, aad_district, aad_pincode')
      .eq('employee_id', row.id)
      .eq('mobile', mobile)
      .maybeSingle();
    if (formCurrentErr) throw formCurrentErr;

    if (!formCurrent || formCurrent.aadhaar_verified !== true) {
      return res.status(400).json({ error: 'Aadhaar is not verified yet. Please complete Aadhaar verification first.' });
    }

    if (!String(formCurrent?.aad_name ?? '').trim()) {
      return res.status(400).json({
        error: 'Saved Aadhaar KYC details are missing. Please verify Aadhaar again with OTP.',
      });
    }

    return res.json({
      verified: true,
      aadhaar_number: String(formCurrent?.aadhaar_number ?? '').trim() || '',
      aadhaarDetails: {
        aad_profile_photo: String(formCurrent?.aad_profile_photo ?? ''),
        aad_name: String(formCurrent?.aad_name ?? ''),
        aad_care_of: String(formCurrent?.aad_care_of ?? ''),
        aad_dob: formCurrent?.aad_dob ?? null,
        aad_gender: String(formCurrent?.aad_gender ?? ''),
        aad_address: String(formCurrent?.aad_address ?? ''),
        aad_state: String(formCurrent?.aad_state ?? ''),
        aad_district: String(formCurrent?.aad_district ?? ''),
        aad_pincode: String(formCurrent?.aad_pincode ?? ''),
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/bank/verify', async (req, res, next) => {
  try {
    const mobile = normalizeMobile(req.body?.mobile);
    const employeeIdFilter = String(req.body?.employee_id ?? '').trim();
    const accountHolderName = String(req.body?.account_holder_name ?? '').trim();
    const accountNumber = String(req.body?.account_number ?? '').replace(/\D/g, '');
    const ifsc = String(req.body?.ifsc ?? '')
      .replace(/\s/g, '')
      .toUpperCase();

    if (!TEN_DIGIT_REGEX.test(mobile)) {
      return res.status(400).json({ error: 'mobile must be a valid 10-digit number' });
    }
    if (accountHolderName.length < 2) {
      return res.status(400).json({ error: 'Account holder name is required.' });
    }
    if (!ACCOUNT_NUMBER_REGEX.test(accountNumber) || PLACEHOLDER_ACCOUNT_REGEX.test(accountNumber)) {
      return res.status(400).json({ error: 'Account number must be 9–18 digits.' });
    }
    if (!IFSC_CODE_REGEX.test(ifsc) || PLACEHOLDER_IFSC_REGEX.test(ifsc)) {
      return res.status(400).json({ error: 'Enter a valid IFSC code.' });
    }

    const row = await resolveOnboardingEmployee(mobile, employeeIdFilter || null);
    if (!row) {
      return res.status(400).json({ error: 'No matching onboarding record for this mobile number.' });
    }

    let edgeResult = null;
    try {
      edgeResult = await invokeBankVerifyEdge({
        idNumber: accountNumber,
        ifsc,
      });
    } catch (edgeErr) {
      if (edgeErr?.isClientRejection) {
        const reason = String(edgeErr.message ?? '').trim() || 'Bank verification failed';
        return res.status(400).json({
          error: `${reason.replace(/[. ]+$/, '')}. Please re-enter account number and IFSC and check again.`,
          error_code: edgeErr.errorCode ?? null,
        });
      }
      const providerMessage = String(edgeErr?.message ?? '').trim();
      const reason = providerMessage || 'Bank verification failed.';
      return res.status(400).json({
        error: `${reason.replace(/[. ]+$/, '')}. Please re-enter account number and IFSC and check again.`,
      });
    }

    const providerData = edgeResult?.data ?? {};
    const accountExists = providerData?.account_exists === true;
    const providerFullName = String(providerData?.full_name ?? '').trim();

    // Only a confirmed account is verified. Provider outages and unresolved
    // lookups (account_exists null) used to soft-pass as verified + manual_review.
    if (!accountExists) {
      return res.status(400).json({
        error: 'Bank account could not be verified. Please re-enter account number and IFSC and check again.',
      });
    }
    if (!providerFullName) {
      return res.status(400).json({ error: 'Bank verification did not return account holder name.' });
    }

    const aadhaarName = await resolveAadhaarNameForEmployee(row.id);
    if (!aadhaarName) {
      return res.status(400).json({ error: 'Aadhaar name not found. Complete Aadhaar verification first.' });
    }
    if (!namesLikelyMatch(aadhaarName, providerFullName)) {
      return res.status(400).json({
        error: 'Account holder name does not match Aadhaar name.',
        details: {
          aadhaar_name: aadhaarName,
          bank_name: providerFullName,
        },
      });
    }

    const now = new Date().toISOString();
    const { error: upsertErr } = await supabaseAdmin.from('job_app_form').upsert(
      {
        employee_id: row.id,
        client_id: row.client_id,
        name: row.name,
        mobile: row.mobile,
        email: row.email ?? null,
        designation: row.designation ?? null,
        kyc_account_holder_name: providerFullName,
        kyc_account_number: accountNumber,
        kyc_ifsc_code: ifsc,
        // Partner KYC does not return bank/branch metadata.
        kyc_bank_ifsc_details: null,
        kyc_bank_verified: true,
        kyc_bank_branch_confirmed: true,
        updated_at: now,
      },
      { onConflict: 'employee_id' }
    );
    if (upsertErr) throw upsertErr;

    return res.json({
      verified: true,
      account_holder_name: providerFullName,
      account_number: accountNumber,
      ifsc,
      ifsc_details: null,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/pan/verify', async (req, res, next) => {
  try {
    const mobile = normalizeMobile(req.body?.mobile);
    const employeeIdFilter = String(req.body?.employee_id ?? '').trim();
    const panNumber = String(req.body?.pan_number ?? '')
      .replace(/\s/g, '')
      .toUpperCase();

    if (!TEN_DIGIT_REGEX.test(mobile)) {
      return res.status(400).json({ error: 'mobile must be a valid 10-digit number' });
    }
    if (!PAN_NUMBER_REGEX.test(panNumber)) {
      return res.status(400).json({ error: 'Enter a valid PAN (e.g. ABCDE1234F).' });
    }

    const row = await resolveOnboardingEmployee(mobile, employeeIdFilter || null);
    if (!row) {
      return res.status(400).json({ error: 'No matching onboarding record for this mobile number.' });
    }

    let edgeResult = null;
    try {
      edgeResult = await invokePanVerifyEdge({ idNumber: panNumber });
    } catch (edgeErr) {
      if (edgeErr?.isClientRejection) {
        return res.status(400).json({
          error: String(edgeErr.message ?? '').trim() || 'PAN verification failed.',
          error_code: edgeErr.errorCode ?? null,
        });
      }
      return res.status(400).json({
        error: String(edgeErr?.message ?? '').trim() || 'PAN verification failed. Please try again.',
      });
    }

    const providerData = edgeResult?.data ?? {};
    const providerPan = String(providerData?.pan_number ?? '').replace(/\s/g, '').toUpperCase();
    const providerFullName = String(providerData?.full_name ?? '').trim();
    const manualReview = Boolean(edgeResult?.manual_review);

    if (!manualReview) {
      if (!providerFullName) {
        return res.status(400).json({ error: 'PAN verification did not return full name.' });
      }

      const aadhaarName = await resolveAadhaarNameForEmployee(row.id);
      if (!aadhaarName) {
        return res.status(400).json({ error: 'Aadhaar name not found. Complete Aadhaar verification first.' });
      }
      const holderMatchesEmployee = namesLikelyMatch(aadhaarName, providerFullName);
      if (!holderMatchesEmployee) {
        return res.status(400).json({
          error: 'PAN name does not match Aadhaar name.',
          details: {
            aadhaar_name: aadhaarName,
            pan_name: providerFullName,
          },
        });
      }
    } else if (providerFullName) {
      // Soft pass with a name: still enforce match when Aadhaar is available.
      const aadhaarName = await resolveAadhaarNameForEmployee(row.id);
      if (aadhaarName && !namesLikelyMatch(aadhaarName, providerFullName)) {
        return res.status(400).json({
          error: 'PAN name does not match Aadhaar name.',
          details: {
            aadhaar_name: aadhaarName,
            pan_name: providerFullName,
          },
        });
      }
    }

    const finalPan = providerPan || panNumber;
    const now = new Date().toISOString();
    const { error: upsertErr } = await supabaseAdmin.from('job_app_form').upsert(
      {
        employee_id: row.id,
        client_id: row.client_id,
        name: row.name,
        mobile: row.mobile,
        email: row.email ?? null,
        designation: row.designation ?? null,
        kyc_pan_number: finalPan,
        kyc_pan_verified: true,
        updated_at: now,
      },
      { onConflict: 'employee_id' }
    );
    if (upsertErr) throw upsertErr;

    const warning = manualReview
      ? String(edgeResult?.warning ?? '').trim() ||
        'PAN verification could not be completed. Flagged for manual review.'
      : null;

    return res.json({
      verified: true,
      manual_review: manualReview || undefined,
      warning: warning || undefined,
      pan_number: finalPan,
      full_name: providerFullName || null,
      category: providerData?.category ?? null,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/status/send-otp', async (req, res, next) => {
  try {
    const mobile = normalizeMobile(req.body?.mobile);
    const employeeIdFilter = String(req.body?.employee_id ?? '').trim();
    if (!TEN_DIGIT_REGEX.test(mobile)) {
      return res.status(400).json({ error: 'mobile must be a valid 10-digit number' });
    }
    const row = await resolveOnboardingEmployee(mobile, employeeIdFilter || null);
    if (!row) {
      return res.status(400).json({ error: 'No matching onboarding record for this mobile number.' });
    }

    const { delivery, otp } = await sendMobileOtpDelivery({
      mobile,
      name: row.name ?? '',
    });

    const key = sessionKey(row.id, mobile);
    statusOtpBySession.set(key, { otp, expires: Date.now() + OTP_TTL_MS });
    if (delivery === 'demo') {
      console.log(`[public/onboarding] Status demo OTP for employee ${row.id}: ${DEMO_MOBILE_OTP}`);
    } else {
      console.log(`[public/onboarding] Status OTP sent via SMS for employee ${row.id} (${mobile})`);
    }

    return res.json({
      ok: true,
      delivery,
      ...(delivery === 'demo' ? { message: 'Demo OTP: use 123123' } : {}),
    });
  } catch (err) {
    if (err?.statusCode) {
      return res.status(err.statusCode).json({
        error: err.message || 'Could not send OTP via SMS. Please try again.',
        details: err.details ?? null,
      });
    }
    next(err);
  }
});

router.post('/status/verify-otp', async (req, res, next) => {
  try {
    const mobile = normalizeMobile(req.body?.mobile);
    const employeeIdFilter = String(req.body?.employee_id ?? '').trim();
    const otpIn = String(req.body?.otp ?? '').replace(/\D/g, '');
    if (!TEN_DIGIT_REGEX.test(mobile)) {
      return res.status(400).json({ error: 'mobile must be a valid 10-digit number' });
    }
    if (!/^\d{6}$/.test(otpIn)) {
      return res.status(400).json({ error: 'OTP must be 6 digits' });
    }
    const row = await resolveOnboardingEmployee(mobile, employeeIdFilter || null);
    if (!row) {
      return res.status(400).json({ error: 'No matching onboarding record for this mobile number.' });
    }
    const key = sessionKey(row.id, mobile);
    const entry = statusOtpBySession.get(key);
    if (!entry || Date.now() > entry.expires) {
      return res.status(400).json({ error: 'OTP expired or not found. Request a new OTP.' });
    }
    if (entry.otp !== otpIn) {
      return res.status(400).json({ error: 'Invalid OTP' });
    }
    statusOtpBySession.delete(key);
    const token = createStatusSessionToken(row.id, mobile);
    statusAuthByToken.set(token, {
      employeeId: row.id,
      mobile,
      expires: Date.now() + STATUS_SESSION_TTL_MS,
    });
    return res.json({ verified: true, session_token: token, expires_in_seconds: Math.floor(STATUS_SESSION_TTL_MS / 1000) });
  } catch (err) {
    next(err);
  }
});

router.post('/email/send-otp', async (req, res, next) => {
  try {
    const mobile = normalizeMobile(req.body?.mobile);
    const employeeIdFilter = String(req.body?.employee_id ?? '').trim();
    const email = normalizeEmail(req.body?.email);

    if (!TEN_DIGIT_REGEX.test(mobile)) {
      return res.status(400).json({ error: 'mobile must be a valid 10-digit number' });
    }
    if (!EMAIL_REGEX.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    const row = await resolveOnboardingEmployee(mobile, employeeIdFilter || null);
    if (!row) {
      return res.status(400).json({ error: 'No matching onboarding record for this mobile number.' });
    }

    await assertOnboardingFormEditable(row, mobile);

    const otp = generateContactOtp();
    try {
      await invokeSendEmailOtpEdge({ email, otp, name: row.name ?? '' });
    } catch (err) {
      if (process.env.NODE_ENV === 'production') {
        throw err;
      }
      console.warn(`[public/onboarding] Email OTP edge send failed; using demo OTP for ${email}:`, err?.message || err);
    }

    const key = contactOtpKey(row.id, 'email');
    contactOtpBySession.set(key, { otp, expires: Date.now() + OTP_TTL_MS, target: email });
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[public/onboarding] Email verification OTP for employee ${row.id} (${email}): ${otp}`);
    }

    const now = new Date().toISOString();
    const { error: updErr } = await supabaseAdmin
      .from('job_app_form')
      .update({
        email,
        email_verified: false,
        updated_at: now,
      })
      .eq('employee_id', row.id)
      .eq('mobile', mobile);
    if (updErr) throw updErr;

    return res.json({ ok: true });
  } catch (err) {
    if (err?.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    next(err);
  }
});

router.post('/email/verify-otp', async (req, res, next) => {
  try {
    const mobile = normalizeMobile(req.body?.mobile);
    const employeeIdFilter = String(req.body?.employee_id ?? '').trim();
    const email = normalizeEmail(req.body?.email);
    const otpIn = String(req.body?.otp ?? '').replace(/\D/g, '');

    if (!TEN_DIGIT_REGEX.test(mobile)) {
      return res.status(400).json({ error: 'mobile must be a valid 10-digit number' });
    }
    if (!EMAIL_REGEX.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }
    if (!/^\d{6}$/.test(otpIn)) {
      return res.status(400).json({ error: 'OTP must be 6 digits' });
    }

    const row = await resolveOnboardingEmployee(mobile, employeeIdFilter || null);
    if (!row) {
      return res.status(400).json({ error: 'No matching onboarding record for this mobile number.' });
    }

    await assertOnboardingFormEditable(row, mobile);

    const key = contactOtpKey(row.id, 'email');
    const entry = contactOtpBySession.get(key);
    if (!entry || Date.now() > entry.expires) {
      return res.status(400).json({ error: 'OTP expired or not found. Request a new OTP.' });
    }
    if (normalizeEmail(entry.target) !== email) {
      return res.status(400).json({ error: 'Email does not match the address OTP was sent to. Request a new OTP.' });
    }
    if (entry.otp !== otpIn) {
      return res.status(400).json({ error: 'Invalid OTP' });
    }
    contactOtpBySession.delete(key);

    const now = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from('job_app_form')
      .update({
        email,
        email_verified: true,
        updated_at: now,
      })
      .eq('employee_id', row.id)
      .eq('mobile', mobile)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      return res.status(404).json({ error: 'Application form not found or mobile mismatch.' });
    }

    return res.json({ verified: true, form: await formWithClientFlags(data) });
  } catch (err) {
    if (err?.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    next(err);
  }
});

router.post('/secondary-mobile/send-otp', async (req, res, next) => {
  try {
    const mobile = normalizeMobile(req.body?.mobile);
    const employeeIdFilter = String(req.body?.employee_id ?? '').trim();
    const secondaryMobile = normalizeMobile(req.body?.pd_secondary_mobile ?? req.body?.secondary_mobile);

    if (!TEN_DIGIT_REGEX.test(mobile)) {
      return res.status(400).json({ error: 'mobile must be a valid 10-digit number' });
    }
    if (!TEN_DIGIT_REGEX.test(secondaryMobile)) {
      return res.status(400).json({ error: 'Alternate mobile number must be 10 digits.' });
    }
    if (secondaryMobile === mobile) {
      return res.status(400).json({ error: 'Alternate mobile must be different from your primary mobile number.' });
    }

    const row = await resolveOnboardingEmployee(mobile, employeeIdFilter || null);
    if (!row) {
      return res.status(400).json({ error: 'No matching onboarding record for this mobile number.' });
    }

    await assertOnboardingFormEditable(row, mobile);

    let delivery;
    let otp;
    try {
      ({ delivery, otp } = await sendMobileOtpDelivery({
        mobile: secondaryMobile,
        name: row.name ?? '',
      }));
    } catch (err) {
      const status = err?.statusCode && err.statusCode >= 400 ? err.statusCode : 502;
      return res.status(status).json({
        error: err?.message || 'Could not send OTP to alternate mobile via SMS. Please try again.',
        details: err?.details ?? null,
      });
    }

    const key = contactOtpKey(row.id, 'secondary_mobile');
    contactOtpBySession.set(key, { otp, expires: Date.now() + OTP_TTL_MS, target: secondaryMobile });
    if (delivery === 'demo') {
      console.log(
        `[public/onboarding] Alternate mobile demo OTP for employee ${row.id} (${secondaryMobile}): ${DEMO_MOBILE_OTP}`
      );
    } else {
      console.log(
        `[public/onboarding] Alternate mobile OTP sent via SMS for employee ${row.id} (${secondaryMobile})`
      );
    }

    const now = new Date().toISOString();
    const { error: updErr } = await supabaseAdmin
      .from('job_app_form')
      .update({
        pd_secondary_mobile: secondaryMobile,
        pd_secondary_mobile_verified: false,
        updated_at: now,
      })
      .eq('employee_id', row.id)
      .eq('mobile', mobile);
    if (updErr) throw updErr;

    return res.json({
      ok: true,
      delivery,
      message:
        delivery === 'demo'
          ? 'Demo OTP: use 123123'
          : 'OTP sent to the alternate mobile number via SMS.',
    });
  } catch (err) {
    if (err?.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    next(err);
  }
});

router.post('/secondary-mobile/verify-otp', async (req, res, next) => {
  try {
    const mobile = normalizeMobile(req.body?.mobile);
    const employeeIdFilter = String(req.body?.employee_id ?? '').trim();
    const secondaryMobile = normalizeMobile(req.body?.pd_secondary_mobile ?? req.body?.secondary_mobile);
    const otpIn = String(req.body?.otp ?? '').replace(/\D/g, '');

    if (!TEN_DIGIT_REGEX.test(mobile)) {
      return res.status(400).json({ error: 'mobile must be a valid 10-digit number' });
    }
    if (!TEN_DIGIT_REGEX.test(secondaryMobile)) {
      return res.status(400).json({ error: 'Alternate mobile number must be 10 digits.' });
    }
    if (!/^\d{6}$/.test(otpIn)) {
      return res.status(400).json({ error: 'OTP must be 6 digits' });
    }

    const row = await resolveOnboardingEmployee(mobile, employeeIdFilter || null);
    if (!row) {
      return res.status(400).json({ error: 'No matching onboarding record for this mobile number.' });
    }

    await assertOnboardingFormEditable(row, mobile);

    const key = contactOtpKey(row.id, 'secondary_mobile');
    const entry = contactOtpBySession.get(key);
    if (!entry || Date.now() > entry.expires) {
      return res.status(400).json({ error: 'OTP expired or not found. Request a new OTP.' });
    }
    if (normalizeMobile(entry.target) !== secondaryMobile) {
      return res.status(400).json({
        error: 'Alternate mobile does not match the number OTP was sent to. Request a new OTP.',
      });
    }
    if (entry.otp !== otpIn) {
      return res.status(400).json({ error: 'Invalid OTP' });
    }
    contactOtpBySession.delete(key);

    const now = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from('job_app_form')
      .update({
        pd_secondary_mobile: secondaryMobile,
        pd_secondary_mobile_verified: true,
        updated_at: now,
      })
      .eq('employee_id', row.id)
      .eq('mobile', mobile)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      return res.status(404).json({ error: 'Application form not found or mobile mismatch.' });
    }

    return res.json({ verified: true, form: await formWithClientFlags(data) });
  } catch (err) {
    if (err?.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    next(err);
  }
});

router.post('/driving-license-upload', (req, res, next) => {
  licenseUpload.single('file')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File must be 5 MB or smaller' });
      }
      return res.status(400).json({ error: err.message || 'Invalid upload' });
    }
    next();
  });
}, async (req, res, next) => {
  try {
    const mobile = normalizeMobile(req.body?.mobile);
    const employeeIdFilter = String(req.body?.employee_id ?? '').trim();

    if (!TEN_DIGIT_REGEX.test(mobile)) {
      return res.status(400).json({ error: 'mobile must be a valid 10-digit number' });
    }
    if (!req.file?.buffer) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const emp = await resolveOnboardingEmployee(mobile, employeeIdFilter || null);
    if (!emp) {
      return res.status(400).json({ error: 'No matching onboarding record for this mobile number.' });
    }

    const { data: formCurrent, error: formCurrentErr } = await supabaseAdmin
      .from('job_app_form')
      .select('*')
      .eq('employee_id', emp.id)
      .eq('mobile', mobile)
      .maybeSingle();
    if (formCurrentErr) throw formCurrentErr;
    if (!formCurrent) {
      return res.status(404).json({ error: 'Application form not found or mobile mismatch.' });
    }
    const clientOnboardingFlags = await fetchClientOnboardingFlags(formCurrent.client_id);
    if (!clientOnboardingFlags.require_license_upload) {
      return res.status(400).json({ error: 'Driving license upload is not required for this client.' });
    }
    if (formCurrent.review_status === 'REJECTED') {
      return res.status(400).json({ error: 'Application is rejected and cannot be edited.' });
    }
    if (formCurrent.review_status === 'APPROVED') {
      return res.status(400).json({ error: 'Application is approved and cannot be edited.' });
    }
    const correctionMode = formCurrent.review_status === 'CORRECTION_REQUESTED';
    const editableFields = editableFieldsFromFormRow(formCurrent);
    if (formCurrent.submission_status === 'Submitted' && !correctionMode) {
      return res.status(400).json({ error: 'Application is already submitted and under review.' });
    }
    const ensureCorrectionEditScope = (candidateUpdate) => {
      if (!correctionMode) return null;
      const attemptedNonEditable = [];
      for (const [key, nextVal] of Object.entries(candidateUpdate)) {
        if (!CORRECTION_FIELD_SET.has(key)) continue;
        if (editableFields.has(key)) continue;
        if (CORRECTION_OPTIONAL_FIELDS.has(key) && isEmptyValue(formCurrent[key])) continue;
        if (!isSameValue(formCurrent[key], nextVal)) {
          attemptedNonEditable.push(key);
        }
      }
      if (attemptedNonEditable.length > 0) {
        return `Only requested correction fields can be edited: ${attemptedNonEditable.join(', ')}`;
      }
      return null;
    };

    const ext = extFromMime(req.file.mimetype);
    const objectPath = `onboarding/${emp.id}/${Date.now()}.${ext}`;

    const { error: upErr } = await supabaseAdmin.storage
      .from(DRIVING_LICENSE_BUCKET)
      .upload(objectPath, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false,
      });
    if (upErr) throw upErr;

    const { data: pub } = supabaseAdmin.storage.from(DRIVING_LICENSE_BUCKET).getPublicUrl(objectPath);
    const publicUrl = pub?.publicUrl;
    if (!publicUrl) {
      return res.status(500).json({ error: 'Could not resolve file URL' });
    }

    const now = new Date().toISOString();
    const { error: dbErr } = await supabaseAdmin
      .from('job_app_form')
      .update({ pd_driving_license_url: publicUrl, updated_at: now })
      .eq('employee_id', emp.id)
      .eq('mobile', mobile);
    if (dbErr) throw dbErr;

    return res.json({ url: publicUrl });
  } catch (err) {
    next(err);
  }
});

router.post('/qualification-certificate-upload', (req, res, next) => {
  const kind = String(req.query?.kind || '').trim();
  const allowedKinds = new Set(['iti_diploma_doc', 'highest_qualification_doc', 'additional_doc']);
  if (!allowedKinds.has(kind)) {
    return res.status(400).json({ error: 'Invalid kind. Use ?kind=iti_diploma_doc, highest_qualification_doc, or additional_doc' });
  }
  qualificationUpload.single('file')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File must be 5 MB or smaller' });
      }
      return res.status(400).json({ error: err.message || 'Invalid upload' });
    }
    next();
  });
}, async (req, res, next) => {
  try {
    const mobile = normalizeMobile(req.body?.mobile);
    const employeeIdFilter = String(req.body?.employee_id ?? '').trim();
    const kind = String(req.query?.kind || '').trim();

    if (!TEN_DIGIT_REGEX.test(mobile)) {
      return res.status(400).json({ error: 'mobile must be a valid 10-digit number' });
    }
    if (!req.file?.buffer) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const emp = await resolveOnboardingEmployee(mobile, employeeIdFilter || null);
    if (!emp) {
      return res.status(400).json({ error: 'No matching onboarding record for this mobile number.' });
    }
    const { data: formCurrent, error: formCurrentErr } = await supabaseAdmin
      .from('job_app_form')
      .select('*')
      .eq('employee_id', emp.id)
      .eq('mobile', mobile)
      .maybeSingle();
    if (formCurrentErr) throw formCurrentErr;
    if (!formCurrent) {
      return res.status(404).json({ error: 'Application form not found or mobile mismatch.' });
    }
    if (formCurrent.review_status === 'REJECTED') {
      return res.status(400).json({ error: 'Application is rejected and cannot be edited.' });
    }
    if (formCurrent.review_status === 'APPROVED') {
      return res.status(400).json({ error: 'Application is approved and cannot be edited.' });
    }
    const correctionMode = formCurrent.review_status === 'CORRECTION_REQUESTED';
    if (formCurrent.submission_status === 'Submitted' && !correctionMode) {
      return res.status(400).json({ error: 'Application is already submitted and under review.' });
    }
    const clientOnboardingFlags = await fetchClientOnboardingFlags(formCurrent.client_id);
    if (kind === 'iti_diploma_doc' && !clientOnboardingFlags.require_qualification_certificate_upload) {
      return res.status(400).json({ error: 'ITI/Diploma certificate upload is not required for this client.' });
    }

    const ext = extForQualificationFile(req.file.mimetype, req.file.originalname);
    const objectPath = `onboarding/${emp.id}/${kind}/${Date.now()}.${ext}`;

    const { error: upErr } = await supabaseAdmin.storage
      .from(QUALIFICATION_BUCKET)
      .upload(objectPath, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false,
      });
    if (upErr) throw upErr;

    const { data: pub } = supabaseAdmin.storage.from(QUALIFICATION_BUCKET).getPublicUrl(objectPath);
    const publicUrl = pub?.publicUrl;
    if (!publicUrl) {
      return res.status(500).json({ error: 'Could not resolve file URL' });
    }

    const now = new Date().toISOString();
    if (kind === 'additional_doc') {
      const existing = normalizeAdditionalCertificateUrls(formCurrent.qual_additional_certificates_url);
      const merged = [...existing, publicUrl].slice(0, 20);
      const { error: dbErr } = await supabaseAdmin
        .from('job_app_form')
        .update({
          qual_additional_certificates_url: merged,
          updated_at: now,
        })
        .eq('employee_id', emp.id)
        .eq('mobile', mobile);
      if (dbErr) throw dbErr;
      return res.json({ url: publicUrl, urls: merged });
    }

    const qualField = kind === 'highest_qualification_doc'
      ? 'qual_highest_qualification_doc_url'
      : 'qual_education_certificate_url';
    const { error: dbErr } = await supabaseAdmin
      .from('job_app_form')
      .update({
        [qualField]: publicUrl,
        updated_at: now,
      })
      .eq('employee_id', emp.id)
      .eq('mobile', mobile);
    if (dbErr) throw dbErr;

    return res.json({ url: publicUrl });
  } catch (err) {
    next(err);
  }
});

const KYC_UPLOAD_KINDS = new Set(['aadhaar_front', 'aadhaar_back', 'pan_card', 'bank_passbook']);
const KYC_VALIDATE_KINDS = new Set(['aadhaar_front', 'aadhaar_back', 'pan_card']);

const kycValidateUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_KYC_VALIDATE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!isAllowedOcrImageMime(file.mimetype)) {
      cb(new Error('Only JPG, JPEG, PNG, or WEBP images are allowed'));
      return;
    }
    cb(null, true);
  },
});

router.post('/kyc-document-validate', (req, res, next) => {
  const kind = String(req.query?.kind || '').trim();
  if (!KYC_VALIDATE_KINDS.has(kind)) {
    return res.status(400).json({
      error: 'Invalid kind. Use ?kind=aadhaar_front, aadhaar_back, or pan_card',
    });
  }
  kycValidateUpload.single('file')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File must be 5 MB or smaller for auto-check' });
      }
      return res.status(400).json({ error: err.message || 'Invalid upload' });
    }
    next();
  });
}, async (req, res, next) => {
  try {
    const mobile = normalizeMobile(req.body?.mobile);
    const employeeIdFilter = String(req.body?.employee_id ?? '').trim();
    const kind = String(req.query?.kind || '').trim();

    if (!TEN_DIGIT_REGEX.test(mobile)) {
      return res.status(400).json({ error: 'mobile must be a valid 10-digit number' });
    }
    if (!req.file?.buffer) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const emp = await resolveOnboardingEmployee(mobile, employeeIdFilter || null);
    if (!emp) {
      return res.status(400).json({ error: 'No matching onboarding record for this mobile number.' });
    }

    const { data: form, error: formErr } = await supabaseAdmin
      .from('job_app_form')
      .select('aadhaar_number, kyc_pan_number')
      .eq('employee_id', emp.id)
      .maybeSingle();
    if (formErr) throw formErr;
    const normalizedPan = String(form?.kyc_pan_number ?? '').replace(/\s/g, '').toUpperCase();
    if (kind === 'pan_card' && !PAN_NUMBER_REGEX.test(normalizedPan)) {
      return res.json({
        ok: true,
        checked: false,
        warnings: [
          'Please verify PAN number first, then upload PAN card image.',
        ],
        details: 'PAN number not verified yet',
      });
    }

    try {
      const edgeResult = await invokeKycDocValidateEdge({
        kind,
        mimeType: req.file.mimetype,
        imageBase64: req.file.buffer.toString('base64'),
        expectedAadhaarNumber: String(form?.aadhaar_number ?? '').replace(/\D/g, ''),
        expectedPanNumber: normalizedPan,
      });
      return res.json({
        ok: true,
        checked: true,
        result: edgeResult?.result ?? null,
      });
    } catch (edgeErr) {
      return res.json({
        ok: true,
        checked: false,
        warnings: [
          'Could not auto-check this document right now. Please upload a clear image and try again.',
        ],
        details: edgeErr?.message || 'Auto-check unavailable',
      });
    }
  } catch (err) {
    next(err);
  }
});

router.post('/kyc-document-upload', (req, res, next) => {
  const kind = String(req.query?.kind || '').trim();
  if (!KYC_UPLOAD_KINDS.has(kind)) {
    return res.status(400).json({
      error: 'Invalid kind. Use ?kind=aadhaar_front, aadhaar_back, pan_card, or bank_passbook',
    });
  }
  kycImageOnlyUpload.single('file')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File must be 5 MB or smaller' });
      }
      return res.status(400).json({ error: err.message || 'Invalid upload' });
    }
    next();
  });
}, async (req, res, next) => {
  try {
    const mobile = normalizeMobile(req.body?.mobile);
    const employeeIdFilter = String(req.body?.employee_id ?? '').trim();

    if (!TEN_DIGIT_REGEX.test(mobile)) {
      return res.status(400).json({ error: 'mobile must be a valid 10-digit number' });
    }
    if (!req.file?.buffer) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const emp = await resolveOnboardingEmployee(mobile, employeeIdFilter || null);
    if (!emp) {
      return res.status(400).json({ error: 'No matching onboarding record for this mobile number.' });
    }

    const kind = String(req.query?.kind || '').trim();
    const { data: formCurrent, error: formCurrentErr } = await supabaseAdmin
      .from('job_app_form')
      .select('*')
      .eq('employee_id', emp.id)
      .eq('mobile', mobile)
      .maybeSingle();
    if (formCurrentErr) throw formCurrentErr;
    if (!formCurrent) {
      return res.status(404).json({ error: 'Application form not found or mobile mismatch.' });
    }
    if (formCurrent.review_status === 'REJECTED') {
      return res.status(400).json({ error: 'Application is rejected and cannot be edited.' });
    }
    if (formCurrent.review_status === 'APPROVED') {
      return res.status(400).json({ error: 'Application is approved and cannot be edited.' });
    }
    const correctionMode = formCurrent.review_status === 'CORRECTION_REQUESTED';
    if (formCurrent.submission_status === 'Submitted' && !correctionMode) {
      return res.status(400).json({ error: 'Application is already submitted and under review.' });
    }
    if (kind === 'pan_card') {
      const normalizedPan = String(formCurrent?.kyc_pan_number ?? '').replace(/\s/g, '').toUpperCase();
      if (!PAN_NUMBER_REGEX.test(normalizedPan)) {
        return res.status(400).json({ error: 'Please verify PAN number first before uploading PAN card image.' });
      }
    }

    let compressed;
    try {
      compressed = await compressKycImageBuffer(req.file.buffer);
    } catch (compressErr) {
      return res.status(400).json({
        error: compressErr.message || 'Could not process image. Try a clearer photo.',
      });
    }

    const objectPath = `onboarding/${emp.id}/${kind}/${Date.now()}.${compressed.ext}`;

    const { error: upErr } = await supabaseAdmin.storage
      .from(KYC_DOCUMENTS_BUCKET)
      .upload(objectPath, compressed.buffer, {
        contentType: compressed.contentType,
        upsert: false,
      });
    if (upErr) throw upErr;

    const { data: pub } = supabaseAdmin.storage.from(KYC_DOCUMENTS_BUCKET).getPublicUrl(objectPath);
    const publicUrl = pub?.publicUrl;
    if (!publicUrl) {
      return res.status(500).json({ error: 'Could not resolve file URL' });
    }

    const fieldByKind = {
      aadhaar_front: 'kyc_aadhar_front_url',
      aadhaar_back: 'kyc_aadhar_back_url',
      pan_card: 'kyc_pan_card_url',
      bank_passbook: 'kyc_bank_passbook_url',
    };
    const field = fieldByKind[kind];
    const { error: dbErr } = await supabaseAdmin
      .from('job_app_form')
      .update({
        [field]: publicUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('employee_id', emp.id)
      .eq('mobile', mobile);
    if (dbErr) throw dbErr;

    return res.json({ url: publicUrl });
  } catch (err) {
    next(err);
  }
});

const BP_UPLOAD_KINDS = new Set(['passport_photo', 'police_verification', 'pf_uan_face_auth']);

router.post('/bp-document-upload', (req, res, next) => {
  const kind = String(req.query?.kind || '').trim();
  if (!BP_UPLOAD_KINDS.has(kind)) {
    return res.status(400).json({
      error: 'Invalid kind. Use ?kind=passport_photo, police_verification, or pf_uan_face_auth',
    });
  }
  const multerMw = kind === 'police_verification' ? bpPoliceVerificationUpload : bpPassportPhotoUpload;
  multerMw.single('file')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File must be 5 MB or smaller' });
      }
      return res.status(400).json({ error: err.message || 'Invalid upload' });
    }
    next();
  });
}, async (req, res, next) => {
  try {
    const mobile = normalizeMobile(req.body?.mobile);
    const employeeIdFilter = String(req.body?.employee_id ?? '').trim();

    if (!TEN_DIGIT_REGEX.test(mobile)) {
      return res.status(400).json({ error: 'mobile must be a valid 10-digit number' });
    }
    if (!req.file?.buffer) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const emp = await resolveOnboardingEmployee(mobile, employeeIdFilter || null);
    if (!emp) {
      return res.status(400).json({ error: 'No matching onboarding record for this mobile number.' });
    }

    const { data: formCurrent, error: formCurrentErr } = await supabaseAdmin
      .from('job_app_form')
      .select('*')
      .eq('employee_id', emp.id)
      .eq('mobile', mobile)
      .maybeSingle();
    if (formCurrentErr) throw formCurrentErr;
    if (!formCurrent) {
      return res.status(404).json({ error: 'Application form not found or mobile mismatch.' });
    }
    if (formCurrent.review_status === 'REJECTED') {
      return res.status(400).json({ error: 'Application is rejected and cannot be edited.' });
    }
    if (formCurrent.review_status === 'APPROVED') {
      return res.status(400).json({ error: 'Application is approved and cannot be edited.' });
    }
    const correctionMode = formCurrent.review_status === 'CORRECTION_REQUESTED';
    if (formCurrent.submission_status === 'Submitted' && !correctionMode) {
      return res.status(400).json({ error: 'Application is already submitted and under review.' });
    }

    const kind = String(req.query?.kind || '').trim();
    const ext =
      kind === 'police_verification'
        ? extForQualificationFile(req.file.mimetype, req.file.originalname)
        : extFromMime(req.file.mimetype);
    const objectPath = `onboarding/${emp.id}/${kind}/${Date.now()}.${ext}`;

    const { error: upErr } = await supabaseAdmin.storage
      .from(BANK_PHOTO_DOCUMENTS_BUCKET)
      .upload(objectPath, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false,
      });
    if (upErr) throw upErr;

    const { data: pub } = supabaseAdmin.storage.from(BANK_PHOTO_DOCUMENTS_BUCKET).getPublicUrl(objectPath);
    const publicUrl = pub?.publicUrl;
    if (!publicUrl) {
      return res.status(500).json({ error: 'Could not resolve file URL' });
    }

    const field =
      kind === 'police_verification'
        ? 'bp_police_verification_url'
        : kind === 'pf_uan_face_auth'
          ? 'bp_pf_uan_face_auth_screenshot_url'
          : 'bp_passport_photo_url';
    const { error: dbErr } = await supabaseAdmin
      .from('job_app_form')
      .update({
        [field]: publicUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('employee_id', emp.id)
      .eq('mobile', mobile);
    if (dbErr) throw dbErr;

    return res.json({ url: publicUrl });
  } catch (err) {
    next(err);
  }
});

router.get('/job-app-form', async (req, res, next) => {
  try {
    const mobile = normalizeMobile(req.query?.mobile);
    const employeeIdFilter = String(req.query?.employee_id ?? '').trim();

    if (!TEN_DIGIT_REGEX.test(mobile)) {
      return res.status(400).json({ error: 'mobile must be a valid 10-digit number' });
    }

    const emp = await resolveOnboardingEmployee(mobile, employeeIdFilter || null);
    if (!emp) {
      return res.status(400).json({ error: 'No matching onboarding record for this mobile number.' });
    }

    const { data, error } = await supabaseAdmin
      .from('job_app_form')
      .select('*')
      .eq('employee_id', emp.id)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      return res.status(404).json({ error: 'Application form not found. Complete Aadhaar verification first.' });
    }

    return res.json({ form: await formWithClientFlags(data) });
  } catch (err) {
    next(err);
  }
});

router.post('/delete-document', async (req, res, next) => {
  try {
    const mobile = normalizeMobile(req.body?.mobile);
    const employeeIdFilter = String(req.body?.employee_id ?? '').trim();
    const field = String(req.body?.field ?? '').trim();
    const fieldConfig = ONBOARDING_DOCUMENT_FIELD_CONFIG[field];
    const requestedUrl = String(req.body?.url ?? '').trim();

    if (!TEN_DIGIT_REGEX.test(mobile)) {
      return res.status(400).json({ error: 'mobile must be a valid 10-digit number' });
    }
    if (!fieldConfig) {
      return res.status(400).json({ error: 'Unsupported document field.' });
    }

    const emp = await resolveOnboardingEmployee(mobile, employeeIdFilter || null);
    if (!emp) {
      return res.status(400).json({ error: 'No matching onboarding record for this mobile number.' });
    }

    const { data: formCurrent, error: formErr } = await supabaseAdmin
      .from('job_app_form')
      .select('*')
      .eq('employee_id', emp.id)
      .eq('mobile', mobile)
      .maybeSingle();
    if (formErr) throw formErr;
    if (!formCurrent) {
      return res.status(404).json({ error: 'Application form not found or mobile mismatch.' });
    }
    if (formCurrent.review_status === 'REJECTED') {
      return res.status(400).json({ error: 'Application is rejected and cannot be edited.' });
    }
    if (formCurrent.review_status === 'APPROVED') {
      return res.status(400).json({ error: 'Application is approved and cannot be edited.' });
    }
    const correctionMode = formCurrent.review_status === 'CORRECTION_REQUESTED';
    if (formCurrent.submission_status === 'Submitted' && !correctionMode) {
      return res.status(400).json({ error: 'Application is already submitted and under review.' });
    }

    let updatePayload = {};

    if (fieldConfig.mode === 'array') {
      const existing = normalizeAdditionalCertificateUrls(formCurrent[field]);
      const targetUrl = requestedUrl;
      if (!targetUrl) {
        return res.status(400).json({ error: 'Document URL is required for this field.' });
      }

      const storagePath = storagePathFromPublicUrl(targetUrl, fieldConfig.bucket);
      if (!storagePath) {
        return res.status(400).json({ error: 'Could not resolve file path from URL.' });
      }
      if (!storagePath.startsWith(`onboarding/${emp.id}/`)) {
        return res.status(400).json({ error: 'Invalid file path for this employee.' });
      }
      const { error: removeErr } = await supabaseAdmin.storage
        .from(fieldConfig.bucket)
        .remove([storagePath]);
      if (removeErr) throw removeErr;

      updatePayload = {
        [field]: existing.filter((u) => u !== targetUrl),
      };
    } else {
      const targetUrl = requestedUrl || String(formCurrent[field] ?? '').trim();
      if (!targetUrl) {
        return res.status(400).json({ error: 'No uploaded file found for this field.' });
      }

      const storagePath = storagePathFromPublicUrl(targetUrl, fieldConfig.bucket);
      if (!storagePath) {
        return res.status(400).json({ error: 'Could not resolve file path from URL.' });
      }
      if (!storagePath.startsWith(`onboarding/${emp.id}/`)) {
        return res.status(400).json({ error: 'Invalid file path for this employee.' });
      }
      const { error: removeErr } = await supabaseAdmin.storage
        .from(fieldConfig.bucket)
        .remove([storagePath]);
      if (removeErr) throw removeErr;

      updatePayload = {
        [field]: null,
      };
    }

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('job_app_form')
      .update({
        ...updatePayload,
        updated_at: new Date().toISOString(),
      })
      .eq('employee_id', emp.id)
      .eq('mobile', mobile)
      .select('*')
      .maybeSingle();
    if (updateErr) throw updateErr;
    if (!updated) {
      return res.status(404).json({ error: 'Application form not found or mobile mismatch.' });
    }

    return res.json({ ok: true, form: await formWithClientFlags(updated) });
  } catch (err) {
    next(err);
  }
});

router.get('/status', async (req, res, next) => {
  try {
    const mobile = normalizeMobile(req.query?.mobile);
    const employeeIdFilter = String(req.query?.employee_id ?? '').trim();
    const sessionToken = String(req.query?.session_token ?? '').trim();
    if (!TEN_DIGIT_REGEX.test(mobile)) {
      return res.status(400).json({ error: 'mobile must be a valid 10-digit number' });
    }
    if (!sessionToken) {
      return res.status(401).json({ error: 'session_token is required.' });
    }
    const emp = await resolveOnboardingEmployee(mobile, employeeIdFilter || null);
    if (!emp) {
      return res.status(400).json({ error: 'No matching onboarding record for this mobile number.' });
    }
    const authSession = statusAuthByToken.get(sessionToken);
    if (!authSession || Date.now() > authSession.expires) {
      return res.status(401).json({ error: 'Status session expired. Please login again.' });
    }
    if (authSession.employeeId !== emp.id || authSession.mobile !== mobile) {
      return res.status(403).json({ error: 'Invalid status session for this employee.' });
    }
    const { data: form, error: formErr } = await supabaseAdmin
      .from('job_app_form')
      .select('*')
      .eq('employee_id', emp.id)
      .maybeSingle();
    if (formErr) throw formErr;
    if (!form) {
      return res.status(404).json({ error: 'Application form not found. Complete onboarding first.' });
    }
    const { data: latestReview, error: reviewErr } = await supabaseAdmin
      .from('job_app_form_reviews')
      .select('decision_status, decision_reason, rejected_fields, reviewed_at, attempt_no')
      .eq('employee_id', emp.id)
      .order('reviewed_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (reviewErr) throw reviewErr;
    const { data: payrollLatestReview, error: payrollReviewErr } = await supabaseAdmin
      .from('job_app_form_payroll_reviews')
      .select('decision_status, decision_reason, rejected_fields, reviewed_at, cycle_no')
      .eq('employee_id', emp.id)
      .order('reviewed_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (payrollReviewErr) throw payrollReviewErr;
    return res.json({
      form,
      latest_review: latestReview ?? null,
      payroll_latest_review: payrollLatestReview ?? null,
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/job-app-form', async (req, res, next) => {
  try {
    const mobile = normalizeMobile(req.body?.mobile);
    const employeeIdFilter = String(req.body?.employee_id ?? '').trim();

    if (!TEN_DIGIT_REGEX.test(mobile)) {
      return res.status(400).json({ error: 'mobile must be a valid 10-digit number' });
    }

    const emp = await resolveOnboardingEmployee(mobile, employeeIdFilter || null);
    if (!emp) {
      return res.status(400).json({ error: 'No matching onboarding record for this mobile number.' });
    }

    const { data: formCurrent, error: formCurrentErr } = await supabaseAdmin
      .from('job_app_form')
      .select('*')
      .eq('employee_id', emp.id)
      .eq('mobile', mobile)
      .maybeSingle();
    if (formCurrentErr) throw formCurrentErr;
    if (!formCurrent) {
      return res.status(404).json({ error: 'Application form not found or mobile mismatch.' });
    }
    if (formCurrent.review_status === 'REJECTED') {
      return res.status(400).json({ error: 'Application is rejected and cannot be edited.' });
    }
    if (formCurrent.review_status === 'APPROVED') {
      return res.status(400).json({ error: 'Application is approved and cannot be edited.' });
    }
    const clientOnboardingFlags = await fetchClientOnboardingFlags(formCurrent.client_id);

    const correctionMode = formCurrent.review_status === 'CORRECTION_REQUESTED';
    const editableFields = editableFieldsFromFormRow(formCurrent);
    if (formCurrent.submission_status === 'Submitted' && !correctionMode) {
      return res.status(400).json({ error: 'Application is already submitted and under review.' });
    }
    const ensureCorrectionEditScope = (candidateUpdate) => {
      if (!correctionMode) return null;
      const attemptedNonEditable = [];
      for (const [key, nextVal] of Object.entries(candidateUpdate)) {
        if (!CORRECTION_FIELD_SET.has(key)) continue;
        if (editableFields.has(key)) continue;
        if (CORRECTION_OPTIONAL_FIELDS.has(key) && isEmptyValue(formCurrent[key])) continue;
        if (!isSameValue(formCurrent[key], nextVal)) {
          attemptedNonEditable.push(key);
        }
      }
      if (attemptedNonEditable.length > 0) {
        return `Only requested correction fields can be edited: ${attemptedNonEditable.join(', ')}`;
      }
      return null;
    };

    const body = req.body ?? {};
    const patchStepRaw = body.patch_step;
    const patchStep =
      patchStepRaw === 'qualification'
        ? 'qualification'
        : patchStepRaw === 'kyc'
          ? 'kyc'
          : patchStepRaw === 'bank_photo'
            ? 'bank_photo'
            : 'personal';
    const now = new Date().toISOString();

    if (patchStep === 'bank_photo') {
      const passportUrl = String(body.bp_passport_photo_url ?? '').trim();
      if (!passportUrl) {
        return res.status(400).json({ error: 'Passport size photo is required.' });
      }

      const esic = String(body.bp_esic_number ?? '').trim() || null;
      const pfUanRaw = String(body.bp_pf_uan_number ?? '').replace(/\s/g, '');
      if (!/^\d{12}$/.test(pfUanRaw)) {
        return res.status(400).json({ error: 'PF UAN number is required and must be exactly 12 digits.' });
      }
      const pfUan = pfUanRaw;

      const pfUanFaceAuthUrl = String(body.bp_pf_uan_face_auth_screenshot_url ?? '').trim();
      if (!pfUanFaceAuthUrl) {
        return res.status(400).json({
          error: 'PF UAN face authentication screenshot is required when you have a PF UAN number.',
        });
      }

      const policeRaw = String(body.bp_police_verification_url ?? '').trim();
      const policeUrl = policeRaw.length > 0 ? policeRaw : null;

      const nomineeNameIn = String(body.bp_nominee_name ?? '').trim();
      const nomineeRelationIn = String(body.bp_nominee_relation ?? '').trim();
      const nomineeMobileIn = normalizeMobile(body.bp_nominee_mobile);
      const nomineeName =
        correctionMode && !editableFields.has('bp_nominee_name')
          ? String(formCurrent.bp_nominee_name ?? '').trim()
          : nomineeNameIn;
      const nomineeRelation =
        correctionMode && !editableFields.has('bp_nominee_relation')
          ? String(formCurrent.bp_nominee_relation ?? '').trim()
          : nomineeRelationIn;
      const nomineeMobile =
        correctionMode && !editableFields.has('bp_nominee_mobile')
          ? normalizeMobile(formCurrent.bp_nominee_mobile)
          : nomineeMobileIn;

      const requireNominee =
        !correctionMode ||
        editableFields.has('bp_nominee_name') ||
        editableFields.has('bp_nominee_relation') ||
        editableFields.has('bp_nominee_mobile');
      if (requireNominee) {
        if (nomineeName.length < 2) {
          return res.status(400).json({ error: 'Nominee name is required.' });
        }
        if (nomineeRelation.length < 2) {
          return res.status(400).json({ error: 'Nominee relation is required.' });
        }
        if (!TEN_DIGIT_REGEX.test(nomineeMobile)) {
          return res.status(400).json({ error: 'Nominee mobile number must be 10 digits.' });
        }
      }

      const bankPhotoUpdate = {
        bp_passport_photo_url: passportUrl,
        bp_esic_number: esic,
        bp_pf_uan_number: pfUan,
        bp_pf_uan_face_auth_screenshot_url: pfUanFaceAuthUrl,
        bp_police_verification_url: policeUrl,
        bp_nominee_name: nomineeName || null,
        bp_nominee_relation: nomineeRelation || null,
        bp_nominee_mobile: TEN_DIGIT_REGEX.test(nomineeMobile) ? nomineeMobile : null,
      };
      const correctionScopeErr = ensureCorrectionEditScope(bankPhotoUpdate);
      if (correctionScopeErr) {
        return res.status(400).json({ error: correctionScopeErr });
      }

      let nextAttemptCount = Number(formCurrent.submission_attempt_count ?? 1);
      if (correctionMode) {
        if (nextAttemptCount >= MAX_SUBMISSION_ATTEMPTS) {
          return res.status(400).json({
            error: `Maximum ${MAX_SUBMISSION_ATTEMPTS} submission attempts reached.`
          });
        }
        nextAttemptCount += 1;
      }

      const { data, error } = await supabaseAdmin
        .from('job_app_form')
        .update({
          ...bankPhotoUpdate,
          submission_status: 'Submitted',
          submission_attempt_count: nextAttemptCount,
          review_status: 'SUBMITTED',
          editable_fields: [],
          review_reason: null,
          reviewed_by: null,
          reviewed_at: null,
          updated_at: now,
        })
        .eq('employee_id', emp.id)
        .eq('mobile', mobile)
        .select()
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        return res.status(404).json({ error: 'Application form not found or mobile mismatch.' });
      }

      const { error: empStatusErr } = await supabaseAdmin
        .from('employees')
        .update({ onboarding_status: 'Form Submitted' })
        .eq('id', emp.id);
      if (empStatusErr) throw empStatusErr;

      return res.json({ form: await formWithClientFlags(data) });
    }

    if (patchStep === 'kyc') {
      const front = String(body.kyc_aadhar_front_url ?? '').trim();
      const back = String(body.kyc_aadhar_back_url ?? '').trim();
      const pan = String(body.kyc_pan_number ?? '')
        .replace(/\s/g, '')
        .toUpperCase();
      const panUrl = String(body.kyc_pan_card_url ?? '').trim();
      const holder = String(body.kyc_account_holder_name ?? '').trim();
      const acct = String(body.kyc_account_number ?? '').replace(/\s/g, '');
      const ifsc = String(body.kyc_ifsc_code ?? '')
        .replace(/\s/g, '')
        .toUpperCase();
      const passUrl = String(body.kyc_bank_passbook_url ?? '').trim();
      const bankBranchConfirmedRaw = body.kyc_bank_branch_confirmed;
      const bankBranchConfirmed =
        bankBranchConfirmedRaw === true ||
        bankBranchConfirmedRaw === 'true' ||
        bankBranchConfirmedRaw === 'yes' ||
        bankBranchConfirmedRaw === 'YES';

      if (!front) {
        return res.status(400).json({ error: 'Aadhaar front image is required.' });
      }
      if (!back) {
        return res.status(400).json({ error: 'Aadhaar back image is required.' });
      }
      if (!PAN_NUMBER_REGEX.test(pan)) {
        return res.status(400).json({ error: 'Enter a valid PAN (e.g. ABCDE1234F).' });
      }
      if (!panUrl) {
        return res.status(400).json({ error: 'PAN card image is required.' });
      }
      if (holder.length < 2) {
        return res.status(400).json({ error: 'Account holder name is required.' });
      }
      if (!ACCOUNT_NUMBER_REGEX.test(acct) || PLACEHOLDER_ACCOUNT_REGEX.test(acct)) {
        return res.status(400).json({ error: 'Enter a valid account number (9–18 digits).' });
      }
      if (!IFSC_CODE_REGEX.test(ifsc) || PLACEHOLDER_IFSC_REGEX.test(ifsc)) {
        return res.status(400).json({ error: 'Enter a valid IFSC code.' });
      }
      if (!passUrl) {
        return res.status(400).json({ error: 'Bank passbook upload is required.' });
      }

      const bankFieldsInScope =
        !correctionMode ||
        editableFields.has('kyc_account_holder_name') ||
        editableFields.has('kyc_account_number') ||
        editableFields.has('kyc_ifsc_code');
      const storedAcct = String(formCurrent.kyc_account_number ?? '').replace(/\D/g, '');
      const storedIfsc = String(formCurrent.kyc_ifsc_code ?? '').replace(/\s/g, '').toUpperCase();
      const bankAlreadyVerified =
        formCurrent.kyc_bank_verified === true &&
        storedAcct === acct &&
        storedIfsc === ifsc;
      if (bankFieldsInScope && !bankAlreadyVerified) {
        return res.status(400).json({ error: 'Please verify bank account details before continuing.' });
      }

      const kycUpdate = {
        kyc_aadhar_front_url: front,
        kyc_aadhar_back_url: back,
        kyc_pan_number: pan,
        kyc_pan_card_url: panUrl,
        kyc_account_holder_name: holder,
        kyc_account_number: acct,
        kyc_ifsc_code: ifsc,
        kyc_bank_passbook_url: passUrl,
        kyc_pan_verified: true,
        kyc_bank_verified: bankAlreadyVerified,
        kyc_bank_branch_confirmed: bankBranchConfirmed,
      };
      const correctionScopeErr = ensureCorrectionEditScope(kycUpdate);
      if (correctionScopeErr) {
        return res.status(400).json({ error: correctionScopeErr });
      }

      const { data, error } = await supabaseAdmin
        .from('job_app_form')
        .update({
          ...kycUpdate,
          updated_at: now,
        })
        .eq('employee_id', emp.id)
        .eq('mobile', mobile)
        .select()
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        return res.status(404).json({ error: 'Application form not found or mobile mismatch.' });
      }

      return res.json({ form: await formWithClientFlags(data) });
    }

    if (patchStep === 'qualification') {
      const hq = String(body.qual_highest_qualification ?? '').trim();
      const hqDocUrl = String(body.qual_highest_qualification_doc_url ?? '').trim();
      const eduUrlIn = String(body.qual_education_certificate_url ?? '').trim();
      const eduUrl = clientOnboardingFlags.require_qualification_certificate_upload ? eduUrlIn : '';
      const extraArr = normalizeAdditionalCertificateUrls(body.qual_additional_certificates_url);

      if (!hq || !HIGHEST_QUALIFICATION_VALUES.has(hq)) {
        return res.status(400).json({ error: 'Please select a valid highest qualification.' });
      }
      if (!hqDocUrl) {
        return res.status(400).json({ error: 'Highest qualification document upload is required.' });
      }
      if (clientOnboardingFlags.require_qualification_certificate_upload && !eduUrl) {
        return res.status(400).json({ error: 'ITI/Diploma education certificate upload is required.' });
      }

      const qualUpdate = {
        qual_highest_qualification: hq,
        qual_highest_qualification_doc_url: hqDocUrl,
        qual_education_certificate_url: clientOnboardingFlags.require_qualification_certificate_upload ? eduUrl : null,
        qual_additional_certificates_url: extraArr,
      };
      const correctionScopeErr = ensureCorrectionEditScope(qualUpdate);
      if (correctionScopeErr) {
        return res.status(400).json({ error: correctionScopeErr });
      }

      const { data, error } = await supabaseAdmin
        .from('job_app_form')
        .update({
          ...qualUpdate,
          updated_at: now,
        })
        .eq('employee_id', emp.id)
        .eq('mobile', mobile)
        .select()
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        return res.status(404).json({ error: 'Application form not found or mobile mismatch.' });
      }

      return res.json({ form: await formWithClientFlags(data) });
    }

    const emergencyName = String(body.pd_emergency_contact_name ?? '').trim();
    const emergencyRelation = String(body.pd_emergency_contact_relation ?? '').trim();
    const emailIn = normalizeEmail(body.email);
    const secondaryMobileIn = normalizeMobile(body.pd_secondary_mobile);
    const emailFinal =
      correctionMode && !editableFields.has('email') ? normalizeEmail(formCurrent.email) : emailIn;
    const secondaryMobileFinal =
      correctionMode && !editableFields.has('pd_secondary_mobile')
        ? normalizeMobile(formCurrent.pd_secondary_mobile)
        : secondaryMobileIn;
    if (!EMAIL_REGEX.test(emailFinal)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }
    if (secondaryMobileFinal) {
      if (!TEN_DIGIT_REGEX.test(secondaryMobileFinal)) {
        return res.status(400).json({ error: 'Alternate mobile number must be 10 digits.' });
      }
      if (secondaryMobileFinal === mobile) {
        return res.status(400).json({ error: 'Alternate mobile must be different from your primary mobile number.' });
      }
    }
    const fatherName = String(body.pd_father_name ?? '').trim();
    const motherName = String(body.pd_mother_name ?? '').trim();
    const spouseNameRaw = String(body.pd_spouse_name ?? '').trim();
    const maritalStatus = String(body.pd_marital_status ?? '').trim();
    const isMarried = maritalStatus.toLowerCase() === 'married';
    const sameAsAadhaarRaw = body.pd_current_address_same_as_aadhaar;
    const sameAsAadhaar =
      sameAsAadhaarRaw === true ||
      sameAsAadhaarRaw === 'true' ||
      sameAsAadhaarRaw === 'yes' ||
      sameAsAadhaarRaw === 'YES'
        ? true
        : sameAsAadhaarRaw === false ||
            sameAsAadhaarRaw === 'false' ||
            sameAsAadhaarRaw === 'no' ||
            sameAsAadhaarRaw === 'NO'
          ? false
          : null;
    const currentAddressRaw = String(body.pd_current_address ?? '').trim();
    const currentStateRaw = String(body.pd_current_state ?? '').trim();
    const currentCityRaw = String(body.pd_current_city ?? '').trim();
    const currentPincodeRaw = String(body.pd_current_pincode ?? '').replace(/\D/g, '');
    if (emergencyName.length < 2) {
      return res.status(400).json({ error: 'Emergency contact name is required.' });
    }
    if (fatherName.length < 2) {
      return res.status(400).json({ error: "Father's name is required." });
    }
    if (motherName.length < 2) {
      return res.status(400).json({ error: "Mother's name is required." });
    }
    if (isMarried && spouseNameRaw.length < 2) {
      return res.status(400).json({ error: 'Spouse name is required for married candidates.' });
    }
    if (emergencyRelation.length < 2) {
      return res.status(400).json({ error: 'Emergency contact relation is required.' });
    }
    if (sameAsAadhaar == null) {
      return res.status(400).json({ error: 'Please choose whether current address is same as Aadhaar address.' });
    }
    const altern = String(body.pd_alternate_number ?? '').replace(/\D/g, '');
    if (altern.length !== 10) {
      return res.status(400).json({ error: 'Emergency contact number must be 10 digits.' });
    }
    if (secondaryMobileFinal && secondaryMobileFinal === altern) {
      return res.status(400).json({ error: 'Alternate mobile must be different from emergency contact number.' });
    }
    const alternNorm = altern;

    const requiresEmailVerification = !correctionMode || editableFields.has('email');
    if (requiresEmailVerification) {
      if (formCurrent.email_verified !== true || normalizeEmail(formCurrent.email) !== emailFinal) {
        return res.status(400).json({ error: 'Please verify your email address before continuing.' });
      }
    } else if (!formCurrent.email_verified || !EMAIL_REGEX.test(normalizeEmail(formCurrent.email))) {
      return res.status(400).json({ error: 'Email verification is required before continuing.' });
    }

    const dl = String(body.pd_driving_license ?? '').trim();
    const licenseUrl = clientOnboardingFlags.require_license_upload
      ? String(body.pd_driving_license_url ?? '').trim()
      : '';
    if (clientOnboardingFlags.require_license_upload && dl === 'Yes' && !licenseUrl) {
      return res.status(400).json({
        error: 'Driving license image is required when you have a driving license.',
      });
    }

    const { data: formSnap, error: snapErr } = await supabaseAdmin
      .from('job_app_form')
      .select('aad_dob, aad_district, aad_address, aad_state, aad_pincode')
      .eq('employee_id', emp.id)
      .eq('mobile', mobile)
      .maybeSingle();
    if (snapErr) throw snapErr;
    if (!formSnap) {
      return res.status(404).json({ error: 'Application form not found or mobile mismatch.' });
    }

    const pdCity = pdCityFromAadDistrict(formSnap.aad_district);
    const pdAge = computePdAgeFromAadDob(formSnap.aad_dob);
    const aadAddress = String(formSnap.aad_address ?? '').trim();
    const aadState = String(formSnap.aad_state ?? '').trim();
    const aadCity = String(formSnap.aad_district ?? '').trim();
    const aadPincode = String(formSnap.aad_pincode ?? '').replace(/\D/g, '');
    const currentAddress = sameAsAadhaar ? aadAddress : currentAddressRaw;
    const currentState = sameAsAadhaar ? aadState : currentStateRaw;
    const currentCity = sameAsAadhaar ? aadCity : currentCityRaw;
    const currentPincode = sameAsAadhaar ? aadPincode : currentPincodeRaw;
    if (!sameAsAadhaar && currentAddress.length < 10) {
      return res.status(400).json({ error: 'Please add your current address.' });
    }
    if (sameAsAadhaar && !currentAddress) {
      return res.status(400).json({ error: 'Aadhaar address is unavailable. Please choose No and enter current address.' });
    }
    if (!sameAsAadhaar && currentState.length < 2) {
      return res.status(400).json({ error: 'Please enter your current state.' });
    }
    if (sameAsAadhaar && !currentState) {
      return res.status(400).json({ error: 'Aadhaar state is unavailable. Please choose No and enter current state.' });
    }
    if (!sameAsAadhaar && currentCity.length < 2) {
      return res.status(400).json({ error: 'Please enter your current city.' });
    }
    if (sameAsAadhaar && !currentCity) {
      return res.status(400).json({ error: 'Aadhaar city is unavailable. Please choose No and enter current city.' });
    }
    if (!PINCODE_REGEX.test(currentPincode)) {
      return res.status(400).json({ error: 'Current pincode must be exactly 6 digits.' });
    }

    /** Personal step: sync pd_city / pd_age from Aadhaar snapshot (not sent by client). */
    const update = {
      email: emailFinal,
      email_verified: true,
      pd_secondary_mobile: secondaryMobileFinal || null,
      pd_secondary_mobile_verified: false,
      pd_father_name: fatherName,
      pd_mother_name: motherName,
      pd_spouse_name: isMarried ? spouseNameRaw : null,
      pd_alternate_number: alternNorm,
      pd_emergency_contact_name: emergencyName,
      pd_emergency_contact_relation: emergencyRelation,
      pd_current_address_same_as_aadhaar: sameAsAadhaar,
      pd_current_address: currentAddress || null,
      pd_current_state: currentState || null,
      pd_current_city: currentCity || null,
      pd_current_pincode: currentPincode || null,
      pd_marital_status: maritalStatus || null,
      pd_driving_license: clientOnboardingFlags.require_license_upload ? (dl || null) : null,
      pd_driving_license_url: clientOnboardingFlags.require_license_upload && dl === 'Yes' ? licenseUrl : null,
      pd_city: pdCity,
      pd_age: pdAge,
      updated_at: now,
    };
    const correctionScopeErr = ensureCorrectionEditScope(update);
    if (correctionScopeErr) {
      return res.status(400).json({ error: correctionScopeErr });
    }

    const { data, error } = await supabaseAdmin
      .from('job_app_form')
      .update(update)
      .eq('employee_id', emp.id)
      .eq('mobile', mobile)
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return res.status(404).json({ error: 'Application form not found or mobile mismatch.' });
    }

    return res.json({ form: await formWithClientFlags(data) });
  } catch (err) {
    next(err);
  }
});

export default router;
