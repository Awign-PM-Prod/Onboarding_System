import { Router } from 'express';
import multer from 'multer';
import { supabaseAdmin } from '../supabase.js';

const router = Router();

const DRIVING_LICENSE_BUCKET = 'driving-licenses';
const QUALIFICATION_BUCKET = 'qualification-certificates';
const KYC_DOCUMENTS_BUCKET = 'kyc-documents';
const BANK_PHOTO_DOCUMENTS_BUCKET = 'bank-photo-documents';
const MAX_DRIVING_LICENSE_BYTES = 12 * 1024 * 1024;
const MAX_QUALIFICATION_BYTES = 12 * 1024 * 1024;
const MAX_KYC_DOCUMENT_BYTES = 12 * 1024 * 1024;
const MAX_BANK_PHOTO_DOCUMENT_BYTES = 12 * 1024 * 1024;

const PAN_NUMBER_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const IFSC_CODE_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const ACCOUNT_NUMBER_REGEX = /^[0-9]{6,18}$/;
const MAX_SUBMISSION_ATTEMPTS = 3;

const CORRECTION_FIELD_SET = new Set([
  'email',
  'pd_alternate_number',
  'pd_marital_status',
  'pd_driving_license',
  'pd_driving_license_url',
  'qual_highest_qualification',
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
  'bp_police_verification_url'
]);
const CORRECTION_OPTIONAL_FIELDS = new Set([
  'pd_alternate_number',
  'qual_additional_certificates_url',
  'bp_esic_number',
  'bp_pf_uan_number',
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

function isAllowedKycBankPassbookMime(mime) {
  const m = String(mime || '').toLowerCase();
  return m.startsWith('image/') || m === 'application/pdf';
}

function extForKycBankFile(mime, originalname) {
  const m = String(mime || '').toLowerCase();
  if (m === 'application/pdf') return 'pdf';
  const fromMime = extFromMime(mime);
  if (fromMime !== 'img') return fromMime;
  const match = /\.([a-z0-9]+)$/i.exec(String(originalname || ''));
  return match ? match[1].toLowerCase().slice(0, 8) : 'bin';
}

const kycImageOnlyUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_KYC_DOCUMENT_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!String(file.mimetype || '').startsWith('image/')) {
      cb(new Error('Only image files are allowed'));
      return;
    }
    cb(null, true);
  },
});

const kycBankPassbookUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_KYC_DOCUMENT_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!isAllowedKycBankPassbookMime(file.mimetype)) {
      cb(new Error('Bank passbook must be an image or PDF'));
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
/** Fixed demo OTP until SMS / UIDAI integration; replace with generated OTP in production. */
const DEMO_AADHAAR_OTP = '101010';
/** Fixed demo OTP for onboarding status login until SMS integration. */
const DEMO_STATUS_OTP = '123123';
const STATUS_SESSION_TTL_MS = 60 * 60 * 1000;

/**
 * Placeholder KYC until real Aadhaar API — replace with API response fields.
 * Photo must be a direct image URL.
 */
const DEMO_AADHAAR_KYC = {
  aad_profile_photo:
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=256&h=256&fit=crop&q=80',
  aad_name: 'Tanmay Gupta',
  aad_care_of: 'C/O: Manoj Kumar Gupta',
  aad_dob: '2004-11-22',
  aad_gender: 'M',
  aad_address:
    'JA-4A, MIG Flats, Phase-1, Ashok Vihar, Saraswati Vihar, North West Delhi, Delhi, 110052',
  aad_state: 'Delhi',
  aad_district: 'North West Delhi',
  aad_pincode: '110052',
};

/** @type {Map<string, { otp: string, aadhaar: string, expires: number }>} */
const aadhaarOtpBySession = new Map();
/** @type {Map<string, { otp: string, expires: number }>} */
const statusOtpBySession = new Map();
/** @type {Map<string, { employeeId: string, mobile: string, expires: number }>} */
const statusAuthByToken = new Map();

function sessionKey(employeeId, mobile) {
  return `${employeeId}:${mobile}`;
}

function createStatusSessionToken(employeeId, mobile) {
  return `status_${employeeId}_${mobile}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
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

    const otp = DEMO_AADHAAR_OTP;
    const key = sessionKey(row.id, mobile);
    aadhaarOtpBySession.set(key, {
      otp,
      aadhaar: aadhaarDigits,
      expires: Date.now() + OTP_TTL_MS
    });

    if (process.env.NODE_ENV !== 'production') {
      console.log(
        `[public/onboarding] Aadhaar demo OTP for employee ${row.id}: ${otp} (fixed until SMS is wired)`
      );
    }

    return res.json({ ok: true });
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

    const key = sessionKey(row.id, mobile);
    const entry = aadhaarOtpBySession.get(key);
    if (!entry || Date.now() > entry.expires) {
      return res.status(400).json({ error: 'OTP expired or not found. Request a new OTP.' });
    }
    if (entry.otp !== otpIn) {
      return res.status(400).json({ error: 'Invalid OTP' });
    }

    aadhaarOtpBySession.delete(key);

    const now = new Date().toISOString();
    const kyc = { ...DEMO_AADHAAR_KYC };
    const { error: upsertErr } = await supabaseAdmin.from('job_app_form').upsert(
      {
        employee_id: row.id,
        client_id: row.client_id,
        name: row.name,
        mobile: row.mobile,
        email: row.email ?? null,
        designation: row.designation ?? null,
        aadhaar_number: entry.aadhaar,
        ...kyc,
        pd_city: pdCityFromAadDistrict(kyc.aad_district),
        pd_age: computePdAgeFromAadDob(kyc.aad_dob),
        updated_at: now,
      },
      { onConflict: 'employee_id' }
    );

    if (upsertErr) throw upsertErr;

    return res.json({ verified: true, aadhaarDetails: DEMO_AADHAAR_KYC });
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
    const key = sessionKey(row.id, mobile);
    statusOtpBySession.set(key, { otp: DEMO_STATUS_OTP, expires: Date.now() + OTP_TTL_MS });
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[public/onboarding] Status demo OTP for employee ${row.id}: ${DEMO_STATUS_OTP}`);
    }
    return res.json({ ok: true });
  } catch (err) {
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

router.post('/driving-license-upload', (req, res, next) => {
  licenseUpload.single('file')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File must be 12 MB or smaller' });
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
  qualificationUpload.single('file')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File must be 12 MB or smaller' });
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

    const ext = extForQualificationFile(req.file.mimetype, req.file.originalname);
    const objectPath = `onboarding/${emp.id}/${Date.now()}.${ext}`;

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

    return res.json({ url: publicUrl });
  } catch (err) {
    next(err);
  }
});

const KYC_UPLOAD_KINDS = new Set(['aadhaar_front', 'aadhaar_back', 'pan_card', 'bank_passbook']);

router.post('/kyc-document-upload', (req, res, next) => {
  const kind = String(req.query?.kind || '').trim();
  if (!KYC_UPLOAD_KINDS.has(kind)) {
    return res.status(400).json({
      error: 'Invalid kind. Use ?kind=aadhaar_front, aadhaar_back, pan_card, or bank_passbook',
    });
  }
  const multerMw = kind === 'bank_passbook' ? kycBankPassbookUpload : kycImageOnlyUpload;
  multerMw.single('file')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File must be 12 MB or smaller' });
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
    const ext =
      kind === 'bank_passbook'
        ? extForKycBankFile(req.file.mimetype, req.file.originalname)
        : extFromMime(req.file.mimetype);
    const objectPath = `onboarding/${emp.id}/${kind}/${Date.now()}.${ext}`;

    const { error: upErr } = await supabaseAdmin.storage
      .from(KYC_DOCUMENTS_BUCKET)
      .upload(objectPath, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false,
      });
    if (upErr) throw upErr;

    const { data: pub } = supabaseAdmin.storage.from(KYC_DOCUMENTS_BUCKET).getPublicUrl(objectPath);
    const publicUrl = pub?.publicUrl;
    if (!publicUrl) {
      return res.status(500).json({ error: 'Could not resolve file URL' });
    }

    return res.json({ url: publicUrl });
  } catch (err) {
    next(err);
  }
});

const BP_UPLOAD_KINDS = new Set(['passport_photo', 'police_verification']);

router.post('/bp-document-upload', (req, res, next) => {
  const kind = String(req.query?.kind || '').trim();
  if (!BP_UPLOAD_KINDS.has(kind)) {
    return res.status(400).json({
      error: 'Invalid kind. Use ?kind=passport_photo or police_verification',
    });
  }
  const multerMw = kind === 'police_verification' ? bpPoliceVerificationUpload : bpPassportPhotoUpload;
  multerMw.single('file')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File must be 12 MB or smaller' });
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

    return res.json({ form: data });
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
      const pfUan = pfUanRaw.length > 0 ? pfUanRaw : null;
      if (pfUan && !/^\d{12}$/.test(pfUan)) {
        return res.status(400).json({ error: 'PF UAN must be exactly 12 digits if provided.' });
      }

      const policeRaw = String(body.bp_police_verification_url ?? '').trim();
      const policeUrl = policeRaw.length > 0 ? policeRaw : null;

      const bankPhotoUpdate = {
        bp_passport_photo_url: passportUrl,
        bp_esic_number: esic,
        bp_pf_uan_number: pfUan,
        bp_police_verification_url: policeUrl,
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

      return res.json({ form: data });
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
      if (!ACCOUNT_NUMBER_REGEX.test(acct)) {
        return res.status(400).json({ error: 'Enter a valid account number (6–18 digits).' });
      }
      if (!IFSC_CODE_REGEX.test(ifsc)) {
        return res.status(400).json({ error: 'Enter a valid IFSC code.' });
      }
      if (!passUrl) {
        return res.status(400).json({ error: 'Bank passbook upload is required.' });
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

      return res.json({ form: data });
    }

    if (patchStep === 'qualification') {
      const hq = String(body.qual_highest_qualification ?? '').trim();
      const eduUrl = String(body.qual_education_certificate_url ?? '').trim();
      const extraArr = normalizeAdditionalCertificateUrls(body.qual_additional_certificates_url);

      if (!hq || !HIGHEST_QUALIFICATION_VALUES.has(hq)) {
        return res.status(400).json({ error: 'Please select a valid highest qualification.' });
      }
      if (!eduUrl) {
        return res.status(400).json({ error: 'ITI/Diploma education certificate upload is required.' });
      }

      const qualUpdate = {
        qual_highest_qualification: hq,
        qual_education_certificate_url: eduUrl,
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

      return res.json({ form: data });
    }

    const altern = String(body.pd_alternate_number ?? '').replace(/\D/g, '');
    if (altern.length > 0 && altern.length !== 10) {
      return res.status(400).json({ error: 'Alternate number must be 10 digits or empty' });
    }
    const alternNorm = altern.length === 10 ? altern : null;

    const dl = String(body.pd_driving_license ?? '').trim();
    const licenseUrl = String(body.pd_driving_license_url ?? '').trim();
    if (dl === 'Yes' && !licenseUrl) {
      return res.status(400).json({
        error: 'Driving license image is required when you have a driving license.',
      });
    }

    const { data: formSnap, error: snapErr } = await supabaseAdmin
      .from('job_app_form')
      .select('aad_dob, aad_district')
      .eq('employee_id', emp.id)
      .eq('mobile', mobile)
      .maybeSingle();
    if (snapErr) throw snapErr;
    if (!formSnap) {
      return res.status(404).json({ error: 'Application form not found or mobile mismatch.' });
    }

    const pdCity = pdCityFromAadDistrict(formSnap.aad_district);
    const pdAge = computePdAgeFromAadDob(formSnap.aad_dob);

    /** Personal step: sync pd_city / pd_age from Aadhaar snapshot (not sent by client). */
    const update = {
      email: String(body.email ?? '').trim() || null,
      pd_alternate_number: alternNorm,
      pd_marital_status: String(body.pd_marital_status ?? '').trim() || null,
      pd_driving_license: dl || null,
      pd_driving_license_url: dl === 'Yes' ? licenseUrl : null,
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

    return res.json({ form: data });
  } catch (err) {
    next(err);
  }
});

export default router;
