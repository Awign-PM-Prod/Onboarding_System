import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';

const MOBILE_DIGITS_REGEX = /\D/g;
const TEN_DIGIT_REGEX = /^\d{10}$/;
const TWELVE_DIGIT_REGEX = /^\d{12}$/;
const SIX_DIGIT_REGEX = /^\d{6}$/;

const MARITAL_OPTIONS = ['Single', 'Married', 'Divorced', 'Widowed'];
const DRIVING_OPTIONS = ['Yes', 'No'];
const DRIVING_LICENSE_MAX_BYTES = 12 * 1024 * 1024;
const QUALIFICATION_MAX_BYTES = 12 * 1024 * 1024;
const KYC_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const KYC_PASSBOOK_MAX_BYTES = 12 * 1024 * 1024;
const BP_MAX_BYTES = 12 * 1024 * 1024;
const PAN_NUMBER_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const IFSC_CODE_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const ACCOUNT_NUMBER_REGEX = /^[0-9]{6,18}$/;
const PINCODE_REGEX = /^[0-9]{6}$/;

const HIGHEST_QUALIFICATION_OPTIONS = [
  '10th Pass',
  '12th Pass',
  'Diploma',
  'ITI',
  'Graduate',
  'Post Graduate',
  'Professional Degree',
  'Others',
];

function normalizeMobile(raw) {
  const digits = String(raw ?? '').replace(MOBILE_DIGITS_REGEX, '');
  if (digits.length >= 10) return digits.slice(-10);
  return digits;
}

function normalizeAadhaar(raw) {
  return String(raw ?? '').replace(/\D/g, '').slice(0, 12);
}

function normalizeOtp(raw) {
  return String(raw ?? '').replace(/\D/g, '').slice(0, 6);
}

function formatAadDob(isoDate) {
  if (!isoDate) return '—';
  const d = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(d.getTime())) return String(isoDate);
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatAadGender(code) {
  const c = String(code ?? '').trim().toUpperCase();
  if (c === 'M') return 'Male';
  if (c === 'F') return 'Female';
  if (c === 'T' || c === 'X') return 'Other';
  return code || '—';
}

function aadhaarKycFromForm(form) {
  const mapped = {
    aad_profile_photo: String(form?.aad_profile_photo ?? ''),
    aad_name: String(form?.aad_name ?? ''),
    aad_care_of: String(form?.aad_care_of ?? ''),
    aad_dob: form?.aad_dob ?? null,
    aad_gender: String(form?.aad_gender ?? ''),
    aad_address: String(form?.aad_address ?? ''),
    aad_state: String(form?.aad_state ?? ''),
    aad_district: String(form?.aad_district ?? ''),
    aad_pincode: String(form?.aad_pincode ?? ''),
  };
  const hasDetails = Object.values(mapped).some((v) => (typeof v === 'string' ? v.trim() : Boolean(v)));
  return hasDetails ? mapped : null;
}

function ageFromIsoDob(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  const t = new Date();
  let a = t.getFullYear() - d.getFullYear();
  const m = t.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < d.getDate())) a -= 1;
  return String(a);
}

function buildPersonalDraft(f) {
  const sameRaw = f.pd_current_address_same_as_aadhaar;
  const sameAsAadhaar =
    sameRaw === true || String(sameRaw).toLowerCase() === 'true'
      ? 'yes'
      : sameRaw === false || String(sameRaw).toLowerCase() === 'false'
        ? 'no'
        : '';
  return {
    email: f.email ?? '',
    pd_alternate_number: f.pd_alternate_number ? String(f.pd_alternate_number) : '',
    pd_emergency_contact_name: f.pd_emergency_contact_name ?? '',
    pd_emergency_contact_relation: f.pd_emergency_contact_relation ?? '',
    pd_current_address_same_as_aadhaar: sameAsAadhaar,
    pd_current_address: f.pd_current_address ?? '',
    pd_current_state: f.pd_current_state ?? '',
    pd_current_city: f.pd_current_city ?? '',
    pd_current_pincode: f.pd_current_pincode ? String(f.pd_current_pincode).replace(/\D/g, '').slice(0, 6) : '',
    pd_father_name: f.pd_father_name ?? '',
    pd_mother_name: f.pd_mother_name ?? '',
    pd_spouse_name: f.pd_spouse_name ?? '',
    pd_marital_status: f.pd_marital_status ?? '',
    pd_driving_license: f.pd_driving_license ?? '',
  };
}

function spouseLabelForGender(code) {
  const c = String(code ?? '').trim().toUpperCase();
  if (c === 'F') return "Husband's Name";
  return "Spouse's Name";
}

function clientRequiresLicenseUpload(form) {
  return form?.require_license_upload !== false;
}

function clientRequiresQualificationCertificateUpload(form) {
  return form?.require_qualification_certificate_upload !== false;
}

function cityFromJobForm(f) {
  return (f.pd_city ?? f.aad_district ?? '').trim() || '—';
}

function fieldClass(readOnly) {
  return readOnly
    ? 'w-full cursor-not-allowed rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-slate-800 select-none'
    : 'w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-slate-900';
}

function UploadedFileBanner({ href, onRemove, removing = false }) {
  if (!href) return null;
  return (
    <div
      className="mt-3 flex items-center gap-3 rounded-xl border-2 border-emerald-200 bg-emerald-50 p-4"
      role="status"
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100">
        <IconCheckCircle className="h-6 w-6 text-emerald-600" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-emerald-800">Document uploaded</p>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-0.5 block truncate text-xs font-medium text-indigo-600 underline underline-offset-2 hover:text-indigo-800"
        >
          View uploaded document ↗
        </a>
      </div>
      {typeof onRemove === 'function' && (
        <button
          type="button"
          onClick={onRemove}
          disabled={removing}
          className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {removing ? 'Removing…' : 'Remove'}
        </button>
      )}
    </div>
  );
}

const FILE_INPUT_CLASS =
  'block w-full cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 file:mr-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-60';

function DocUploadField({
  label,
  required = false,
  inputId,
  accept,
  uploading = false,
  uploadingLabel = 'Uploading…',
  error,
  hint,
  url,
  onRemove,
  removing = false,
  onChange,
  children,
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-slate-800" htmlFor={inputId}>
        {label}
        {required && <span className="text-rose-500"> *</span>}
      </label>
      {!url && !uploading && (
        <>
          <input
            id={inputId}
            type="file"
            accept={accept}
            onChange={onChange}
            className={FILE_INPUT_CLASS}
          />
          {hint && <p className="mt-1.5 text-xs text-slate-500">{hint}</p>}
        </>
      )}
      {children}
      {uploading && <p className="mt-2 text-sm text-slate-600">{uploadingLabel}</p>}
      {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
      {url && !uploading && (
        <UploadedFileBanner href={url} onRemove={onRemove} removing={removing} />
      )}
    </div>
  );
}

function parseAdditionalCertificateUrls(form) {
  const v = form?.qual_additional_certificates_url;
  if (Array.isArray(v)) return v.filter((u) => typeof u === 'string' && u.trim()).map((u) => u.trim());
  if (typeof v === 'string' && v.trim()) {
    try {
      const p = JSON.parse(v);
      return Array.isArray(p) ? parseAdditionalCertificateUrls({ qual_additional_certificates_url: p }) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function isEmptyForCorrection(v) {
  if (v == null) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.filter((x) => typeof x === 'string' && x.trim()).length === 0;
  return false;
}

const STEP_ORDER = ['personal', 'qualification', 'kyc', 'photo'];
const STEP_PREFIX_RULES = {
  personal: ['email', 'pd_'],
  qualification: ['qual_'],
  kyc: ['kyc_'],
  photo: ['bp_']
};
const STEP_OPTIONAL_FIELDS = {
  personal: [],
  qualification: ['qual_additional_certificates_url'],
  kyc: [],
  photo: ['bp_esic_number', 'bp_police_verification_url']
};
const STEP_ALL_FIELDS = {
  personal: [
    'email',
    'pd_father_name',
    'pd_mother_name',
    'pd_spouse_name',
    'pd_emergency_contact_name',
    'pd_emergency_contact_relation',
    'pd_alternate_number',
    'pd_current_address_same_as_aadhaar',
    'pd_current_address',
    'pd_current_state',
    'pd_current_city',
    'pd_current_pincode',
    'pd_marital_status',
    'pd_driving_license',
    'pd_driving_license_url'
  ],
  qualification: [
    'qual_highest_qualification',
    'qual_highest_qualification_doc_url',
    'qual_education_certificate_url',
    'qual_additional_certificates_url'
  ],
  kyc: [
    'kyc_aadhar_front_url',
    'kyc_aadhar_back_url',
    'kyc_pan_number',
    'kyc_pan_card_url',
    'kyc_account_holder_name',
    'kyc_account_number',
    'kyc_ifsc_code',
    'kyc_bank_passbook_url'
  ],
  photo: ['bp_passport_photo_url', 'bp_esic_number', 'bp_pf_uan_number', 'bp_police_verification_url']
};

function isAllowedQualificationFile(file) {
  const m = String(file.type || '').toLowerCase();
  if (m.startsWith('image/')) return true;
  if (m === 'application/pdf') return true;
  if (m === 'application/msword') return true;
  if (m === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return true;
  return false;
}

function IconCheckCircle({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function IconShield({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
      />
    </svg>
  );
}

function IconArrowLeft({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
    </svg>
  );
}

function IconCamera({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.716-1.017H8.25a2.192 2.192 0 00-1.716 1.017l-.822 1.316a2.31 2.31 0 01-1.64 1.055z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z"
      />
    </svg>
  );
}

function FormStepper({ currentStep }) {
  const steps = [
    { n: 1, label: 'Personal' },
    { n: 2, label: 'Qualification' },
    { n: 3, label: 'KYC' },
    { n: 4, label: 'Final Compliance Details' },
  ];
  return (
    <nav className="mb-8" aria-label="Form progress">
      <div className="flex items-start justify-between gap-1 sm:gap-2">
        {steps.map((s) => {
          const done = currentStep > s.n;
          const active = currentStep === s.n;
          return (
            <div key={s.n} className="flex min-w-0 flex-1 flex-col items-center">
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                  done
                    ? 'bg-emerald-500 text-white'
                    : active
                      ? 'bg-indigo-600 text-white ring-4 ring-indigo-100'
                      : 'bg-slate-200 text-slate-500'
                }`}
              >
                {done ? (
                  <IconCheckCircle className="h-5 w-5" />
                ) : active && s.n === 4 ? (
                  <IconCamera className="h-5 w-5" />
                ) : (
                  s.n
                )}
              </div>
              <span className="mt-2 max-w-[4.5rem] text-center text-[10px] font-medium leading-tight text-slate-600 sm:max-w-none sm:text-xs">
                {s.label}
              </span>
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-center text-sm text-slate-500">
        Step {currentStep} of 4 · {steps[currentStep - 1]?.label ?? ''}
      </p>
    </nav>
  );
}

function IconDocument({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
      />
    </svg>
  );
}

function QualificationForm({ jobForm, mobile, employeeId, onPrevious, onSaveSuccess, correction }) {
  const requireQualificationCertificate = clientRequiresQualificationCertificateUpload(jobForm);
  const [highest, setHighest] = useState(() => jobForm.qual_highest_qualification ?? '');
  const [highestDocUrl, setHighestDocUrl] = useState(() => jobForm.qual_highest_qualification_doc_url ?? '');
  const [eduUrl, setEduUrl] = useState(() => jobForm.qual_education_certificate_url ?? '');
  const [additionalUrls, setAdditionalUrls] = useState(() => parseAdditionalCertificateUrls(jobForm));
  const [highestDocUploading, setHighestDocUploading] = useState(false);
  const [eduUploading, setEduUploading] = useState(false);
  const [addUploading, setAddUploading] = useState(false);
  const [highestDocRemoving, setHighestDocRemoving] = useState(false);
  const [eduRemoving, setEduRemoving] = useState(false);
  const [additionalRemoving, setAdditionalRemoving] = useState([]);
  const [highestDocError, setHighestDocError] = useState('');
  const [eduError, setEduError] = useState('');
  const [addError, setAddError] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const visible = correction?.active ? correction.visibleFields : null;
    setHighest(visible?.has('qual_highest_qualification') ? '' : (jobForm.qual_highest_qualification ?? ''));
    setHighestDocUrl(
      visible?.has('qual_highest_qualification_doc_url') ? '' : (jobForm.qual_highest_qualification_doc_url ?? '')
    );
    setEduUrl(visible?.has('qual_education_certificate_url') ? '' : (jobForm.qual_education_certificate_url ?? ''));
    setAdditionalUrls(visible?.has('qual_additional_certificates_url') ? [] : parseAdditionalCertificateUrls(jobForm));
    setHighestDocError('');
    setEduError('');
    setAddError('');
    setError('');
    setHighestDocRemoving(false);
    setEduRemoving(false);
    setAdditionalRemoving([]);
  }, [jobForm, correction]);

  const shouldShow = (field) => {
    if (field === 'qual_education_certificate_url' && !requireQualificationCertificate) return false;
    return !correction?.active || correction.visibleFields.has(field);
  };
  const isRequired = (field, fallbackRequired = false) => {
    if (field === 'qual_education_certificate_url' && !requireQualificationCertificate) return false;
    return correction?.active ? correction.requiredFields.has(field) : fallbackRequired;
  };
  const highestSelected = String(highest).trim();
  const effectiveHighestSelected = correction?.active
    ? (highestSelected || String(jobForm.qual_highest_qualification ?? '').trim())
    : highestSelected;
  const shouldShowHighestDoc = shouldShow('qual_highest_qualification_doc_url') && Boolean(effectiveHighestSelected);
  const canNext = (
    (!isRequired('qual_highest_qualification', true) || Boolean(String(highest).trim())) &&
    (!isRequired('qual_highest_qualification_doc_url', true) || Boolean(String(highestDocUrl).trim())) &&
    (!isRequired('qual_education_certificate_url', true) || Boolean(String(eduUrl).trim()))
  );

  const uploadIfValid = async (file, kind) => {
    if (!isAllowedQualificationFile(file)) {
      throw new Error('Use an image, PDF, or Word document (.doc / .docx).');
    }
    if (file.size > QUALIFICATION_MAX_BYTES) {
      throw new Error('File must be 12 MB or smaller.');
    }
    const { url } = await api.uploadQualificationCertificate({ mobile, employeeId, file, kind });
    return url ?? '';
  };

  const handleEducationFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setEduError('');
    setEduUploading(true);
    try {
      const url = await uploadIfValid(file, 'iti_diploma_doc');
      setEduUrl(url);
    } catch (err) {
      setEduError(err.message || 'Upload failed.');
    } finally {
      setEduUploading(false);
    }
  };

  const handleHighestDocFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setHighestDocError('');
    setHighestDocUploading(true);
    try {
      const url = await uploadIfValid(file, 'highest_qualification_doc');
      setHighestDocUrl(url);
    } catch (err) {
      setHighestDocError(err.message || 'Upload failed.');
    } finally {
      setHighestDocUploading(false);
    }
  };

  const handleAdditionalFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setAddError('');
    setAddUploading(true);
    try {
      const url = await uploadIfValid(file, 'additional_doc');
      setAdditionalUrls((prev) => [...prev, url]);
    } catch (err) {
      setAddError(err.message || 'Upload failed.');
    } finally {
      setAddUploading(false);
    }
  };

  const handleRemoveEducationFile = async () => {
    if (!eduUrl || eduRemoving) return;
    setEduError('');
    setEduRemoving(true);
    try {
      await api.deleteOnboardingDocument({
        mobile,
        employeeId,
        field: 'qual_education_certificate_url',
        url: eduUrl,
      });
      setEduUrl('');
    } catch (err) {
      setEduError(err.message || 'Could not remove file.');
    } finally {
      setEduRemoving(false);
    }
  };

  const handleRemoveHighestDocFile = async () => {
    if (!highestDocUrl || highestDocRemoving) return;
    setHighestDocError('');
    setHighestDocRemoving(true);
    try {
      await api.deleteOnboardingDocument({
        mobile,
        employeeId,
        field: 'qual_highest_qualification_doc_url',
        url: highestDocUrl,
      });
      setHighestDocUrl('');
    } catch (err) {
      setHighestDocError(err.message || 'Could not remove file.');
    } finally {
      setHighestDocRemoving(false);
    }
  };

  const handleRemoveAdditionalFile = async (url, idx) => {
    if (!url) return;
    if (additionalRemoving.includes(url)) return;
    setAddError('');
    setAdditionalRemoving((prev) => [...prev, url]);
    try {
      await api.deleteOnboardingDocument({
        mobile,
        employeeId,
        field: 'qual_additional_certificates_url',
        url,
      });
      setAdditionalUrls((prev) => prev.filter((_, i) => i !== idx));
    } catch (err) {
      setAddError(err.message || 'Could not remove file.');
    } finally {
      setAdditionalRemoving((prev) => prev.filter((u) => u !== url));
    }
  };

  const handleNext = async () => {
    if (!canNext || saving) return;
    setSaving(true);
    setError('');
    try {
      const { form } = await api.patchJobAppForm({
        mobile,
        employee_id: employeeId || null,
        patch_step: 'qualification',
        qual_highest_qualification: String(highest).trim(),
        qual_highest_qualification_doc_url: String(highestDocUrl).trim(),
        qual_education_certificate_url: requireQualificationCertificate ? String(eduUrl).trim() : null,
        qual_additional_certificates_url: additionalUrls,
      });
      onSaveSuccess?.(form);
    } catch (err) {
      setError(err.message || 'Could not save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      <FormStepper currentStep={2} />

      <div className="flex items-center gap-2 text-slate-900">
        <IconDocument className="h-8 w-8 text-indigo-600" />
        <h2 className="text-xl font-semibold sm:text-2xl">Qualification</h2>
      </div>

      <div className="space-y-6">
        {shouldShow('qual_highest_qualification') && <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-800" htmlFor="qual-highest">
            Highest Qualification <span className="text-rose-500">*</span>
          </label>
          <select
            id="qual-highest"
            className={fieldClass(false)}
            value={highest}
            onChange={(e) => {
              const next = e.target.value;
              setHighest(next);
              setHighestDocUrl('');
              setHighestDocError('');
            }}
          >
            <option value="">Select Highest Qualification</option>
            {HIGHEST_QUALIFICATION_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>}

        {shouldShowHighestDoc && (
          <DocUploadField
            label={`Highest Qualification Certificate (${effectiveHighestSelected})`}
            required={isRequired('qual_highest_qualification_doc_url', true)}
            inputId="qual-highest-doc"
            accept="image/*,.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            uploading={highestDocUploading}
            error={highestDocError}
            hint="Max file size: 12MB. Supported: image/*, application/pdf, .doc, .docx"
            url={highestDocUrl}
            onRemove={handleRemoveHighestDocFile}
            removing={highestDocRemoving}
            onChange={handleHighestDocFile}
          />
        )}

        {shouldShow('qual_education_certificate_url') && (
          <DocUploadField
            label="ITI/Diploma Education Certificate"
            required={isRequired('qual_education_certificate_url', true)}
            inputId="qual-edu-cert"
            accept="image/*,.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            uploading={eduUploading}
            error={eduError}
            hint="Max file size: 12MB. Supported: image/*, application/pdf, .doc, .docx"
            url={eduUrl}
            onRemove={handleRemoveEducationFile}
            removing={eduRemoving}
            onChange={handleEducationFile}
          />
        )}

        {shouldShow('qual_additional_certificates_url') && <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-800">Additional Certificates (Optional)</label>
          <div className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/80 px-4 py-8 text-center">
            <p className="mb-3 text-sm text-slate-600">Add Certificate</p>
            <input
              type="file"
              accept="image/*,.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              disabled={addUploading}
              onChange={handleAdditionalFile}
              className="mx-auto block max-w-full cursor-pointer text-sm text-slate-700 file:mr-2 file:rounded-lg file:border-0 file:bg-indigo-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            />
            <p className="mt-2 text-xs text-slate-500">Same limits as above. You can add multiple files.</p>
          </div>
          {addUploading && <p className="mt-2 text-sm text-slate-600">Uploading…</p>}
          {addError && <p className="mt-2 text-sm text-rose-600">{addError}</p>}
          {additionalUrls.length > 0 && (
            <ul className="mt-3 space-y-2">
              {additionalUrls.map((u, idx) => (
                <li
                  key={`${u}-${idx}`}
                  className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3 sm:flex-row sm:items-start sm:justify-between sm:gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <UploadedFileBanner
                      href={u}
                      onRemove={() => handleRemoveAdditionalFile(u, idx)}
                      removing={additionalRemoving.includes(u)}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>}
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <div className="flex flex-col gap-4 border-t border-slate-200 pt-6 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={onPrevious}
          className="inline-flex items-center justify-center gap-1 rounded-xl border-2 border-indigo-600 bg-white px-5 py-3 text-sm font-semibold text-indigo-600 hover:bg-indigo-50"
        >
          <span aria-hidden>‹</span> Previous
        </button>
        <button
          type="button"
          disabled={!canNext || saving}
          onClick={handleNext}
          className="inline-flex items-center justify-center gap-1 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Next'} <span aria-hidden>›</span>
        </button>
      </div>
      <p className="text-center text-xs text-slate-500">Step 2 of 4 · Qualification</p>
    </div>
  );
}

function isAllowedKycPassbookFile(file) {
  const m = String(file.type || '').toLowerCase();
  return m.startsWith('image/') || m === 'application/pdf';
}

function isAllowedOcrImageFile(file) {
  const m = String(file?.type || '').toLowerCase();
  return m === 'image/jpeg' || m === 'image/jpg' || m === 'image/png' || m === 'image/webp';
}

function kycKindLabel(kind) {
  if (kind === 'aadhaar_front') return 'Aadhaar front';
  if (kind === 'aadhaar_back') return 'Aadhaar back';
  return 'PAN';
}

function kycValidationHint(kind, validation) {
  const explicitWarnings = Array.isArray(validation?.warnings)
    ? validation.warnings.map((item) => String(item ?? '').trim()).filter(Boolean)
    : [];
  if (!validation?.checked) {
    return {
      tone: 'warn',
      text:
        explicitWarnings[0] ||
        'Could not auto-check this document right now. You can continue, but upload a clear image.',
    };
  }

  const result = validation?.result ?? {};
  const docLabel = kycKindLabel(kind);
  if (result?.is_expected_kind === false) {
    return {
      tone: 'warn',
      text: `This does not look like a ${docLabel} image. Please upload the correct image.`,
    };
  }

  if (kind === 'aadhaar_front' && result?.matches?.aadhaar_number_match === false) {
    return {
      tone: 'warn',
      text: 'This does not seem to match the Aadhaar number added by you.',
    };
  }
  if (kind === 'pan_card' && result?.matches?.pan_number_match === false) {
    return {
      tone: 'warn',
      text: 'This does not seem to match the PAN number added by you.',
    };
  }

  if (kind === 'aadhaar_front' && result?.matches?.aadhaar_number_match === true) {
    return { tone: 'success', text: 'Aadhaar front verified.' };
  }
  if (kind === 'pan_card' && result?.matches?.pan_number_match === true) {
    return { tone: 'success', text: 'PAN card verified.' };
  }
  if (kind === 'aadhaar_back') {
    return { tone: 'success', text: 'Aadhaar back verified.' };
  }

  const modelWarnings = Array.isArray(result?.warnings)
    ? result.warnings.map((item) => String(item ?? '').trim()).filter(Boolean)
    : [];
  if (modelWarnings.length > 0) {
    return { tone: 'warn', text: modelWarnings[0] };
  }
  return { tone: 'success', text: `${docLabel} image looks correct.` };
}

function KycDocumentsForm({ jobForm, mobile, employeeId, onPrevious, onSaveSuccess, correction }) {
  const aadhaarVerified = Boolean(
    String(jobForm?.aadhaar_number ?? '').trim() || String(jobForm?.aad_name ?? '').trim()
  );

  const [frontUrl, setFrontUrl] = useState(() => jobForm.kyc_aadhar_front_url ?? '');
  const [backUrl, setBackUrl] = useState(() => jobForm.kyc_aadhar_back_url ?? '');
  const [panCardUrl, setPanCardUrl] = useState(() => jobForm.kyc_pan_card_url ?? '');
  const [passbookUrl, setPassbookUrl] = useState(() => jobForm.kyc_bank_passbook_url ?? '');

  const [panNumber, setPanNumber] = useState(() =>
    String(jobForm.kyc_pan_number ?? '')
      .replace(/\s/g, '')
      .toUpperCase()
  );
  const [accountHolder, setAccountHolder] = useState(() => jobForm.kyc_account_holder_name ?? '');
  const [accountNumber, setAccountNumber] = useState(() =>
    String(jobForm.kyc_account_number ?? '').replace(/\s/g, '')
  );
  const [ifsc, setIfsc] = useState(() =>
    String(jobForm.kyc_ifsc_code ?? '')
      .replace(/\s/g, '')
      .toUpperCase()
  );

  const [frontUp, setFrontUp] = useState(false);
  const [backUp, setBackUp] = useState(false);
  const [panCardUp, setPanCardUp] = useState(false);
  const [passUp, setPassUp] = useState(false);
  const [frontRemoving, setFrontRemoving] = useState(false);
  const [backRemoving, setBackRemoving] = useState(false);
  const [panCardRemoving, setPanCardRemoving] = useState(false);
  const [passRemoving, setPassRemoving] = useState(false);
  const [frontErr, setFrontErr] = useState('');
  const [backErr, setBackErr] = useState('');
  const [panCardErr, setPanCardErr] = useState('');
  const [passErr, setPassErr] = useState('');
  const [frontHint, setFrontHint] = useState(null);
  const [backHint, setBackHint] = useState(null);
  const [panCardHint, setPanCardHint] = useState(null);

  const [panVerified, setPanVerified] = useState(false);
  const [panVerifying, setPanVerifying] = useState(false);
  const [panVerifyMsg, setPanVerifyMsg] = useState('');
  const [bankVerified, setBankVerified] = useState(false);
  const [bankVerifying, setBankVerifying] = useState(false);
  const [bankVerifyMsg, setBankVerifyMsg] = useState('');
  const [bankBranchSummary, setBankBranchSummary] = useState(null);
  const [bankBranchConfirmed, setBankBranchConfirmed] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const visible = correction?.active ? correction.visibleFields : null;
    setFrontUrl(visible?.has('kyc_aadhar_front_url') ? '' : (jobForm.kyc_aadhar_front_url ?? ''));
    setBackUrl(visible?.has('kyc_aadhar_back_url') ? '' : (jobForm.kyc_aadhar_back_url ?? ''));
    setPanCardUrl(visible?.has('kyc_pan_card_url') ? '' : (jobForm.kyc_pan_card_url ?? ''));
    setPassbookUrl(visible?.has('kyc_bank_passbook_url') ? '' : (jobForm.kyc_bank_passbook_url ?? ''));
    setPanNumber(visible?.has('kyc_pan_number') ? '' : String(jobForm.kyc_pan_number ?? '').replace(/\s/g, '').toUpperCase());
    setAccountHolder(visible?.has('kyc_account_holder_name') ? '' : (jobForm.kyc_account_holder_name ?? ''));
    setAccountNumber(visible?.has('kyc_account_number') ? '' : String(jobForm.kyc_account_number ?? '').replace(/\s/g, ''));
    setIfsc(visible?.has('kyc_ifsc_code') ? '' : String(jobForm.kyc_ifsc_code ?? '').replace(/\s/g, '').toUpperCase());
    setFrontErr('');
    setBackErr('');
    setPanCardErr('');
    setPassErr('');
    setFrontHint(null);
    setBackHint(null);
    setPanCardHint(null);
    const panLoaded = visible?.has('kyc_pan_number')
      ? ''
      : String(jobForm.kyc_pan_number ?? '').replace(/\s/g, '').toUpperCase();
    const panFlagLoaded = !visible?.has('kyc_pan_verified') && jobForm?.kyc_pan_verified === true;
    setPanVerified(Boolean(panFlagLoaded || PAN_NUMBER_REGEX.test(panLoaded)));
    setPanVerifyMsg('');

    const hLoaded = visible?.has('kyc_account_holder_name') ? '' : String(jobForm.kyc_account_holder_name ?? '').trim();
    const acctLoaded = visible?.has('kyc_account_number') ? '' : String(jobForm.kyc_account_number ?? '').replace(/\s/g, '');
    const ifscLoaded = visible?.has('kyc_ifsc_code') ? '' : String(jobForm.kyc_ifsc_code ?? '').replace(/\s/g, '').toUpperCase();
    const bankFlagLoaded = !visible?.has('kyc_bank_verified') && jobForm?.kyc_bank_verified === true;
    const branchConfirmedLoaded = !visible?.has('kyc_bank_branch_confirmed') && jobForm?.kyc_bank_branch_confirmed === true;
    setBankVerified(
      Boolean(
        bankFlagLoaded || (
          hLoaded.length >= 2 &&
          ACCOUNT_NUMBER_REGEX.test(acctLoaded) &&
          IFSC_CODE_REGEX.test(ifscLoaded)
        )
      )
    );
    setBankBranchConfirmed(Boolean(branchConfirmedLoaded || bankFlagLoaded));
    setBankVerifyMsg('');
    const branchLoaded = !visible?.has('kyc_bank_ifsc_details')
      ? String(jobForm?.kyc_bank_ifsc_details ?? '').trim()
      : '';
    setBankBranchSummary(branchLoaded ? {
      bankName: '',
      branch: branchLoaded,
      state: ''
    } : null);
    setError('');
    setFrontRemoving(false);
    setBackRemoving(false);
    setPanCardRemoving(false);
    setPassRemoving(false);
  }, [jobForm, correction]);

  const uploadKyc = async (kind, file) => {
    const { url } = await api.uploadKycDocument({ mobile, employeeId, file, kind });
    return url ?? '';
  };

  const validateKyc = async (kind, file) => {
    try {
      const validation = await api.validateKycDocument({ mobile, employeeId, file, kind });
      return kycValidationHint(kind, validation);
    } catch {
      return {
        tone: 'warn',
        text: 'Could not auto-check this document right now. You can continue, but upload a clear image.',
      };
    }
  };

  const handleAadhaarFront = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!isAllowedOcrImageFile(file)) {
      setFrontErr('Only JPG, JPEG, PNG, or WEBP images are allowed.');
      return;
    }
    if (file.size > KYC_IMAGE_MAX_BYTES) {
      setFrontErr('File must be 5 MB or smaller.');
      return;
    }
    setFrontErr('');
    setFrontHint(null);
    setFrontUp(true);
    try {
      setFrontHint(await validateKyc('aadhaar_front', file));
      setFrontUrl(await uploadKyc('aadhaar_front', file));
    } catch (err) {
      setFrontErr(err.message || 'Upload failed.');
    } finally {
      setFrontUp(false);
    }
  };

  const handleAadhaarBack = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!isAllowedOcrImageFile(file)) {
      setBackErr('Only JPG, JPEG, PNG, or WEBP images are allowed.');
      return;
    }
    if (file.size > KYC_IMAGE_MAX_BYTES) {
      setBackErr('File must be 5 MB or smaller.');
      return;
    }
    setBackErr('');
    setBackHint(null);
    setBackUp(true);
    try {
      setBackHint(await validateKyc('aadhaar_back', file));
      setBackUrl(await uploadKyc('aadhaar_back', file));
    } catch (err) {
      setBackErr(err.message || 'Upload failed.');
    } finally {
      setBackUp(false);
    }
  };

  const handlePanCard = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!panVerified || !PAN_NUMBER_REGEX.test(panNumber.trim())) {
      setPanCardErr('Please verify PAN number first, then upload PAN card image.');
      return;
    }
    if (!isAllowedOcrImageFile(file)) {
      setPanCardErr('Only JPG, JPEG, PNG, or WEBP images are allowed.');
      return;
    }
    if (file.size > KYC_IMAGE_MAX_BYTES) {
      setPanCardErr('File must be 5 MB or smaller.');
      return;
    }
    setPanCardErr('');
    setPanCardHint(null);
    setPanCardUp(true);
    try {
      setPanCardHint(await validateKyc('pan_card', file));
      setPanCardUrl(await uploadKyc('pan_card', file));
    } catch (err) {
      setPanCardErr(err.message || 'Upload failed.');
    } finally {
      setPanCardUp(false);
    }
  };

  const handlePassbook = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!isAllowedKycPassbookFile(file)) {
      setPassErr('Upload an image or PDF.');
      return;
    }
    if (file.size > KYC_PASSBOOK_MAX_BYTES) {
      setPassErr('File must be 12 MB or smaller.');
      return;
    }
    setPassErr('');
    setPassUp(true);
    try {
      setPassbookUrl(await uploadKyc('bank_passbook', file));
    } catch (err) {
      setPassErr(err.message || 'Upload failed.');
    } finally {
      setPassUp(false);
    }
  };

  const handleRemoveKycDocument = async ({ field, url, setUrl, setErr, setRemoving, onRemoved }) => {
    if (!url) return;
    setErr?.('');
    setRemoving(true);
    try {
      await api.deleteOnboardingDocument({
        mobile,
        employeeId,
        field,
        url,
      });
      setUrl('');
      onRemoved?.();
    } catch (err) {
      setErr?.(err.message || 'Could not remove file.');
    } finally {
      setRemoving(false);
    }
  };

  const handleVerifyPan = () => {
    if (panVerifying) return;
    setPanVerifyMsg('');
    const p = panNumber.trim();
    if (!PAN_NUMBER_REGEX.test(p)) {
      setPanVerified(false);
      setPanVerifyMsg('Enter a valid PAN (e.g. ABCDE1234F).');
      return;
    }
    setPanVerifying(true);
    api
      .verifyPan({
        mobile,
        employeeId,
        panNumber: p,
      })
      .then((result) => {
        setPanNumber((result.pan_number ?? p).toUpperCase());
        setPanVerified(true);
        setPanVerifyMsg('');
      })
      .catch((err) => {
        setPanVerified(false);
        setPanVerifyMsg(err.message || 'PAN verification failed. Please check details and try again.');
      })
      .finally(() => {
        setPanVerifying(false);
      });
  };

  const handleVerifyBank = () => {
    if (bankVerifying) return;
    setBankVerifyMsg('');
    const h = String(accountHolder).trim();
    const acct = String(accountNumber).replace(/\s/g, '');
    const ifscNorm = String(ifsc)
      .replace(/\s/g, '')
      .toUpperCase();
    if (h.length < 2) {
      setBankVerified(false);
      setBankVerifyMsg('Enter the account holder name.');
      return;
    }
    if (!ACCOUNT_NUMBER_REGEX.test(acct)) {
      setBankVerified(false);
      setBankVerifyMsg('Account number must be 6–18 digits.');
      return;
    }
    if (!IFSC_CODE_REGEX.test(ifscNorm)) {
      setBankVerified(false);
      setBankVerifyMsg('Enter a valid IFSC (e.g. HDFC0001234).');
      return;
    }
    setBankVerifying(true);
    api
      .verifyBankAccount({
        mobile,
        employeeId,
        accountHolderName: h,
        accountNumber: acct,
        ifsc: ifscNorm,
      })
      .then((result) => {
        setAccountHolder(result.account_holder_name ?? h);
        setAccountNumber(result.account_number ?? acct);
        setIfsc(result.ifsc ?? ifscNorm);
        const ifscDetails = result.ifsc_details ?? {};
        setBankBranchSummary({
          bankName: String(ifscDetails.bank_name ?? ifscDetails.bank ?? '').trim(),
          branch: String(ifscDetails.branch ?? '').trim(),
          state: String(ifscDetails.state ?? '').trim()
        });
        setBankBranchConfirmed(true);
        setBankVerified(true);
        setBankVerifyMsg('');
      })
      .catch((err) => {
        setBankVerified(false);
        setBankBranchSummary(null);
        setBankBranchConfirmed(false);
        setBankVerifyMsg(err.message || 'Bank verification failed. Please check details and try again.');
      })
      .finally(() => {
        setBankVerifying(false);
      });
  };

  const shouldShow = (field) => !correction?.active || correction.visibleFields.has(field);
  const isRequired = (field, fallbackRequired = false) =>
    correction?.active ? correction.requiredFields.has(field) : fallbackRequired;
  const docsOk =
    (!isRequired('kyc_aadhar_front_url', true) || Boolean(String(frontUrl).trim())) &&
    (!isRequired('kyc_aadhar_back_url', true) || Boolean(String(backUrl).trim())) &&
    (!isRequired('kyc_pan_card_url', true) || Boolean(String(panCardUrl).trim())) &&
    (!isRequired('kyc_bank_passbook_url', true) || Boolean(String(passbookUrl).trim()));
  const panOk = !isRequired('kyc_pan_number', true) || (panVerified && PAN_NUMBER_REGEX.test(panNumber.trim()));
  const bankRequired =
    isRequired('kyc_account_holder_name', true) ||
    isRequired('kyc_account_number', true) ||
    isRequired('kyc_ifsc_code', true);
  const bankOk = !bankRequired || bankVerified;
  const canNext = docsOk && panOk && bankOk;

  const handleNext = async () => {
    if (!canNext || saving) return;
    setSaving(true);
    setError('');
    try {
      const { form } = await api.patchJobAppForm({
        mobile,
        employee_id: employeeId || null,
        patch_step: 'kyc',
        kyc_aadhar_front_url: String(frontUrl).trim(),
        kyc_aadhar_back_url: String(backUrl).trim(),
        kyc_pan_number: panNumber.trim(),
        kyc_pan_card_url: String(panCardUrl).trim(),
        kyc_account_holder_name: String(accountHolder).trim(),
        kyc_account_number: String(accountNumber).replace(/\s/g, ''),
        kyc_ifsc_code: String(ifsc)
          .replace(/\s/g, '')
          .toUpperCase(),
        kyc_bank_passbook_url: String(passbookUrl).trim(),
        kyc_bank_branch_confirmed: bankVerified ? true : false,
      });
      onSaveSuccess?.(form);
    } catch (err) {
      setError(err.message || 'Could not save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      <FormStepper currentStep={3} />

      <div className="flex items-center gap-2 text-slate-900">
        <IconDocument className="h-8 w-8 text-indigo-600" />
        <h2 className="text-xl font-semibold sm:text-2xl">KYC Documents</h2>
      </div>

      {aadhaarVerified && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Your Aadhaar is already verified from the earlier step. Upload clear photos of your Aadhaar card
          (front and back) below.
        </div>
      )}

      {(shouldShow('kyc_aadhar_front_url') || shouldShow('kyc_aadhar_back_url')) && (
      <section className="space-y-5 rounded-xl border border-slate-200 bg-slate-50/60 p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Aadhaar card</h3>
        <div className="grid gap-5 sm:grid-cols-2">
          {shouldShow('kyc_aadhar_front_url') && (
            <DocUploadField
              label="Aadhaar front"
              required={isRequired('kyc_aadhar_front_url', true)}
              inputId="kyc-aad-front"
              accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/jpg,image/png,image/webp"
              uploading={frontUp}
              error={frontErr}
              hint="Only JPG, JPEG, PNG, WEBP allowed · max 5MB"
              url={frontUrl}
              onRemove={() => handleRemoveKycDocument({
                field: 'kyc_aadhar_front_url',
                url: frontUrl,
                setUrl: setFrontUrl,
                setErr: setFrontErr,
                setRemoving: setFrontRemoving,
                onRemoved: () => setFrontHint(null),
              })}
              removing={frontRemoving}
              onChange={handleAadhaarFront}
            >
              {frontHint && (
                <p className={`mt-2 text-sm ${frontHint.tone === 'success' ? 'text-emerald-700' : 'text-amber-700'}`}>
                  {frontHint.text}
                </p>
              )}
            </DocUploadField>
          )}
          {shouldShow('kyc_aadhar_back_url') && (
            <DocUploadField
              label="Aadhaar back"
              required={isRequired('kyc_aadhar_back_url', true)}
              inputId="kyc-aad-back"
              accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/jpg,image/png,image/webp"
              uploading={backUp}
              error={backErr}
              hint="Only JPG, JPEG, PNG, WEBP allowed · max 5MB"
              url={backUrl}
              onRemove={() => handleRemoveKycDocument({
                field: 'kyc_aadhar_back_url',
                url: backUrl,
                setUrl: setBackUrl,
                setErr: setBackErr,
                setRemoving: setBackRemoving,
                onRemoved: () => setBackHint(null),
              })}
              removing={backRemoving}
              onChange={handleAadhaarBack}
            >
              {backHint && (
                <p className={`mt-2 text-sm ${backHint.tone === 'success' ? 'text-emerald-700' : 'text-amber-700'}`}>
                  {backHint.text}
                </p>
              )}
            </DocUploadField>
          )}
        </div>
      </section>
      )}

      {(shouldShow('kyc_pan_number') || shouldShow('kyc_pan_card_url')) && (
      <section className="space-y-5 rounded-xl border border-slate-200 bg-slate-50/60 p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">PAN</h3>
        {shouldShow('kyc_pan_number') && <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <label className="mb-1.5 block text-sm font-medium text-slate-800" htmlFor="kyc-pan-num">
              PAN number {isRequired('kyc_pan_number', true) && <span className="text-rose-500">*</span>}
            </label>
            <input
              id="kyc-pan-num"
              type="text"
              value={panNumber}
              onChange={(e) => {
                const v = e.target.value.replace(/\s/g, '').toUpperCase().slice(0, 10);
                setPanNumber(v);
                setPanVerified(false);
                setPanVerifyMsg('');
              }}
              className={fieldClass(false)}
              placeholder="ABCDE1234F"
              maxLength={10}
              autoComplete="off"
            />
          </div>
          <button
            type="button"
            onClick={handleVerifyPan}
            disabled={panVerifying || panVerified}
            className={`shrink-0 rounded-lg px-4 py-3 text-sm font-semibold text-white ${
              panVerified
                ? 'cursor-not-allowed bg-emerald-600'
                : 'bg-indigo-600 hover:bg-indigo-700'
            }`}
          >
            {panVerifying ? 'Verifying…' : panVerified ? 'Verified' : 'Verify PAN'}
          </button>
        </div>}
        {shouldShow('kyc_pan_number') && panVerifyMsg && (
          <p className={`text-sm ${panVerified ? 'text-emerald-700' : 'text-rose-600'}`}>{panVerifyMsg}</p>
        )}
        {shouldShow('kyc_pan_card_url') && (
          <DocUploadField
            label="PAN card image"
            required={isRequired('kyc_pan_card_url', true)}
            inputId="kyc-pan-card"
            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/jpg,image/png,image/webp"
            uploading={panCardUp}
            error={panCardErr}
            hint={panVerified ? 'Only JPG, JPEG, PNG, WEBP allowed · max 5MB' : 'Verify PAN number above before uploading'}
            url={panCardUrl}
            onRemove={() => handleRemoveKycDocument({
              field: 'kyc_pan_card_url',
              url: panCardUrl,
              setUrl: setPanCardUrl,
              setErr: setPanCardErr,
              setRemoving: setPanCardRemoving,
              onRemoved: () => setPanCardHint(null),
            })}
            removing={panCardRemoving}
            onChange={!panVerified ? undefined : handlePanCard}
          >
            {!panVerified && !panCardUrl && (
              <p className="mt-1.5 text-xs text-amber-700">Verify PAN number first to enable upload.</p>
            )}
            {panCardHint && (
              <p className={`mt-2 text-sm ${panCardHint.tone === 'success' ? 'text-emerald-700' : 'text-amber-700'}`}>
                {panCardHint.text}
              </p>
            )}
          </DocUploadField>
        )}
      </section>
      )}

      {(shouldShow('kyc_account_holder_name') || shouldShow('kyc_account_number') || shouldShow('kyc_ifsc_code') || shouldShow('kyc_bank_passbook_url')) && (
      <section className="space-y-5 rounded-xl border border-slate-200 bg-slate-50/60 p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Bank account</h3>
        {shouldShow('kyc_account_holder_name') && <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-800" htmlFor="kyc-acc-name">
            Account holder name {isRequired('kyc_account_holder_name', true) && <span className="text-rose-500">*</span>}
          </label>
          <input
            id="kyc-acc-name"
            type="text"
            value={accountHolder}
            onChange={(e) => {
              setAccountHolder(e.target.value);
              setBankVerified(false);
              setBankVerifyMsg('');
              setBankBranchSummary(null);
              setBankBranchConfirmed(false);
            }}
            className={fieldClass(false)}
            placeholder="Name as on bank account"
            autoComplete="name"
          />
        </div>}
        {(shouldShow('kyc_account_number') || shouldShow('kyc_ifsc_code')) && <div className="grid gap-4 sm:grid-cols-2">
          {shouldShow('kyc_account_number') && <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-800" htmlFor="kyc-acc-no">
              Account number {isRequired('kyc_account_number', true) && <span className="text-rose-500">*</span>}
            </label>
            <input
              id="kyc-acc-no"
              type="text"
              inputMode="numeric"
              value={accountNumber}
              onChange={(e) => {
                setAccountNumber(e.target.value.replace(/\D/g, '').slice(0, 18));
                setBankVerified(false);
                setBankVerifyMsg('');
                setBankBranchSummary(null);
                setBankBranchConfirmed(false);
              }}
              className={fieldClass(false)}
              placeholder="Account number"
              autoComplete="off"
            />
          </div>}
          {shouldShow('kyc_ifsc_code') && <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-800" htmlFor="kyc-ifsc">
              IFSC {isRequired('kyc_ifsc_code', true) && <span className="text-rose-500">*</span>}
            </label>
            <input
              id="kyc-ifsc"
              type="text"
              value={ifsc}
              onChange={(e) => {
                setIfsc(e.target.value.replace(/\s/g, '').toUpperCase().slice(0, 11));
                setBankVerified(false);
                setBankVerifyMsg('');
                setBankBranchSummary(null);
                setBankBranchConfirmed(false);
              }}
              className={fieldClass(false)}
              placeholder="HDFC0001234"
              autoComplete="off"
            />
          </div>}
        </div>}
        {(shouldShow('kyc_account_holder_name') || shouldShow('kyc_account_number') || shouldShow('kyc_ifsc_code')) && <button
          type="button"
          onClick={handleVerifyBank}
          disabled={bankVerifying || bankVerified}
          className={`rounded-lg px-4 py-3 text-sm font-semibold text-white ${
            bankVerified
              ? 'cursor-not-allowed bg-emerald-600'
              : 'bg-indigo-600 hover:bg-indigo-700'
          }`}
        >
          {bankVerifying ? 'Verifying…' : bankVerified ? 'Verified' : 'Verify bank'}
        </button>}
        {(shouldShow('kyc_account_holder_name') || shouldShow('kyc_account_number') || shouldShow('kyc_ifsc_code')) && (
          <p className="text-xs text-slate-500">
            Bank verification may take up to 40 seconds. If it fails, re-enter account number and IFSC, then verify again.
          </p>
        )}
        {(shouldShow('kyc_account_holder_name') || shouldShow('kyc_account_number') || shouldShow('kyc_ifsc_code')) && bankVerifyMsg && (
          <p className={`text-sm ${bankVerified ? 'text-emerald-700' : 'text-rose-600'}`}>{bankVerifyMsg}</p>
        )}
        {(shouldShow('kyc_account_holder_name') || shouldShow('kyc_account_number') || shouldShow('kyc_ifsc_code')) &&
          bankVerified &&
          (bankBranchSummary || bankBranchConfirmed) && (
            <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-3">
              {bankBranchSummary && (
                <p className="text-sm font-medium text-sky-900">
                  {bankBranchSummary.bankName || '—'}, {bankBranchSummary.branch || '—'}, {bankBranchSummary.state || '—'}
                </p>
              )}
              <label className="mt-2 inline-flex items-start gap-2 text-sm text-slate-800">
                <input
                  type="checkbox"
                  checked={bankBranchConfirmed}
                  onChange={(e) => setBankBranchConfirmed(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span>I confirm this is my bank branch.</span>
              </label>
              {!bankBranchConfirmed && (
                <p className="mt-1 text-xs text-amber-700">
                  Please confirm the bank branch details to continue.
                </p>
              )}
            </div>
          )}
        {shouldShow('kyc_bank_passbook_url') && (
          <DocUploadField
            label="Bank passbook / statement"
            required={isRequired('kyc_bank_passbook_url', true)}
            inputId="kyc-passbook"
            accept="image/*,.pdf,application/pdf"
            uploading={passUp}
            error={passErr}
            hint="Image or PDF · max 12MB"
            url={passbookUrl}
            onRemove={() => handleRemoveKycDocument({
              field: 'kyc_bank_passbook_url',
              url: passbookUrl,
              setUrl: setPassbookUrl,
              setErr: setPassErr,
              setRemoving: setPassRemoving,
            })}
            removing={passRemoving}
            onChange={handlePassbook}
          />
        )}
      </section>
      )}

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <div className="flex flex-col gap-4 border-t border-slate-200 pt-6 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={onPrevious}
          className="inline-flex items-center justify-center gap-1 rounded-xl border-2 border-indigo-600 bg-white px-5 py-3 text-sm font-semibold text-indigo-600 hover:bg-indigo-50"
        >
          <span aria-hidden>‹</span> Previous
        </button>
        <button
          type="button"
          disabled={!canNext || saving}
          onClick={handleNext}
          className="inline-flex items-center justify-center gap-1 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Next'} <span aria-hidden>›</span>
        </button>
      </div>
      <p className="text-center text-xs text-slate-500">Step 3 of 4 · KYC</p>
    </div>
  );
}

function BankPhotoForm({ jobForm, mobile, employeeId, onPrevious, onSubmitted, onGoToStatus, correction }) {
  const PF_UAN_DEMO_VIDEO_URL = 'https://samplelib.com/lib/preview/mp4/sample-5s.mp4';
  const [photoUrl, setPhotoUrl] = useState(() => jobForm.bp_passport_photo_url ?? '');
  const [esic, setEsic] = useState(() => jobForm.bp_esic_number ?? '');
  const [pfUan, setPfUan] = useState(() => String(jobForm.bp_pf_uan_number ?? '').replace(/\D/g, ''));
  const [hasPfUan, setHasPfUan] = useState(() => (String(jobForm.bp_pf_uan_number ?? '').replace(/\D/g, '').length === 12 ? 'yes' : ''));
  const [policeUrl, setPoliceUrl] = useState(() => jobForm.bp_police_verification_url ?? '');
  const [photoUp, setPhotoUp] = useState(false);
  const [policeUp, setPoliceUp] = useState(false);
  const [photoRemoving, setPhotoRemoving] = useState(false);
  const [policeRemoving, setPoliceRemoving] = useState(false);
  const [photoErr, setPhotoErr] = useState('');
  const [policeErr, setPoliceErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(
    () => String(jobForm?.submission_status ?? '').trim() === 'Submitted'
  );

  useEffect(() => {
    const visible = correction?.active ? correction.visibleFields : null;
    setPhotoUrl(visible?.has('bp_passport_photo_url') ? '' : (jobForm.bp_passport_photo_url ?? ''));
    setEsic(visible?.has('bp_esic_number') ? '' : (jobForm.bp_esic_number ?? ''));
    const nextPfUan = visible?.has('bp_pf_uan_number') ? '' : String(jobForm.bp_pf_uan_number ?? '').replace(/\D/g, '');
    setPfUan(nextPfUan);
    setHasPfUan(nextPfUan.length === 12 ? 'yes' : '');
    setPoliceUrl(visible?.has('bp_police_verification_url') ? '' : (jobForm.bp_police_verification_url ?? ''));
    setPhotoErr('');
    setPoliceErr('');
    setPhotoRemoving(false);
    setPoliceRemoving(false);
    setError('');
    if (!correction?.active && String(jobForm.submission_status ?? '').trim() === 'Submitted') {
      setSubmitted(true);
    } else if (correction?.active) {
      setSubmitted(false);
    }
  }, [jobForm, correction]);

  const handlePassportFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setPhotoErr('Only image files are allowed.');
      return;
    }
    if (file.size > BP_MAX_BYTES) {
      setPhotoErr('File must be 12 MB or smaller.');
      return;
    }
    setPhotoErr('');
    setPhotoUp(true);
    try {
      const { url } = await api.uploadBpDocument({ mobile, employeeId, file, kind: 'passport_photo' });
      setPhotoUrl(url ?? '');
    } catch (err) {
      setPhotoErr(err.message || 'Upload failed.');
    } finally {
      setPhotoUp(false);
    }
  };

  const handlePoliceFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!isAllowedQualificationFile(file)) {
      setPoliceErr('Use an image, PDF, or Word document (.doc / .docx).');
      return;
    }
    if (file.size > BP_MAX_BYTES) {
      setPoliceErr('File must be 12 MB or smaller.');
      return;
    }
    setPoliceErr('');
    setPoliceUp(true);
    try {
      const { url } = await api.uploadBpDocument({ mobile, employeeId, file, kind: 'police_verification' });
      setPoliceUrl(url ?? '');
    } catch (err) {
      setPoliceErr(err.message || 'Upload failed.');
    } finally {
      setPoliceUp(false);
    }
  };

  const handleRemoveBankPhotoDocument = async ({ field, currentUrl, setUrl, setErr, setRemoving }) => {
    if (!currentUrl) return;
    setErr?.('');
    setRemoving(true);
    try {
      await api.deleteOnboardingDocument({
        mobile,
        employeeId,
        field,
        url: currentUrl,
      });
      setUrl('');
    } catch (err) {
      setErr?.(err.message || 'Could not remove file.');
    } finally {
      setRemoving(false);
    }
  };

  const shouldShow = (field) => !correction?.active || correction.visibleFields.has(field);
  const isRequired = (field, fallbackRequired = false) =>
    correction?.active ? correction.requiredFields.has(field) : fallbackRequired;
  const canSubmit = !isRequired('bp_passport_photo_url', true) || Boolean(String(photoUrl).trim());
  const pfUanRequired = isRequired('bp_pf_uan_number', true);
  const hasPfUanError =
    pfUanRequired && hasPfUan !== 'yes' ? 'PF UAN number is mandatory to submit the form.' : '';
  const pfUanError =
    hasPfUan === 'yes' && pfUan.length !== 12 ? 'PF UAN must be exactly 12 digits.' : '';

  const handleSubmit = async () => {
    if (!canSubmit || saving || hasPfUanError || pfUanError) return;
    setSaving(true);
    setError('');
    try {
      const { form } = await api.patchJobAppForm({
        mobile,
        employee_id: employeeId || null,
        patch_step: 'bank_photo',
        bp_passport_photo_url: String(photoUrl).trim(),
        bp_esic_number: String(esic).trim() || null,
        bp_pf_uan_number: pfUan,
        bp_police_verification_url: String(policeUrl).trim() || null,
      });
      setSubmitted(true);
      onSubmitted?.(form);
    } catch (err) {
      setError(err.message || 'Could not submit. Try again.');
    } finally {
      setSaving(false);
    }
  };

  if (submitted) {
    return (
      <div className="mx-auto max-w-lg py-2 sm:py-4">
        <div className="rounded-2xl border border-slate-100 bg-white px-6 py-10 text-center shadow-lg sm:px-10 sm:py-12">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
            <IconCheckCircle className="h-9 w-9 text-emerald-600" aria-hidden />
          </div>
          <h2 className="mt-6 text-xl font-bold text-emerald-600 sm:text-2xl">Application Submitted Successfully!</h2>
          <p className="mt-4 text-sm leading-relaxed text-slate-800 sm:text-base">
            Thank you for applying with us. Our HR team will review your application and contact you within 3-5
            business days.
          </p>
          <div className="mt-8 rounded-xl border border-blue-200 bg-blue-50 px-4 py-4 text-center text-sm leading-relaxed text-blue-900 sm:text-base">
            <p>
              <span className="font-bold">Important:</span> Please keep your phone accessible as we may call you for
              further verification or interview scheduling.
            </p>
          </div>
          <button
            type="button"
            onClick={onGoToStatus}
            className="mt-6 w-full rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            Go to Next Page
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <FormStepper currentStep={4} />

      <div className="flex items-center gap-2 text-slate-900">
        <IconCamera className="h-8 w-8 text-indigo-600" />
        <h2 className="text-xl font-semibold sm:text-2xl">Bank &amp; Photo</h2>
      </div>

      <div className="space-y-6">
        {shouldShow('bp_passport_photo_url') && (
          <DocUploadField
            label="Passport Size Photo"
            required={isRequired('bp_passport_photo_url', true)}
            inputId="bp-passport-photo"
            accept="image/*"
            uploading={photoUp}
            error={photoErr}
            hint="Max file size: 12MB. Supported: image/*"
            url={photoUrl}
            onRemove={() => handleRemoveBankPhotoDocument({
              field: 'bp_passport_photo_url',
              currentUrl: photoUrl,
              setUrl: setPhotoUrl,
              setErr: setPhotoErr,
              setRemoving: setPhotoRemoving,
            })}
            removing={photoRemoving}
            onChange={handlePassportFile}
          />
        )}

        {(shouldShow('bp_esic_number') || shouldShow('bp_pf_uan_number') || shouldShow('bp_police_verification_url')) && (
        <div className="border-t border-slate-200 pt-6">
          <p className="mb-4 text-sm font-medium text-slate-700">Additional information</p>
          <div className="space-y-4">
            {shouldShow('bp_esic_number') && <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-800" htmlFor="bp-esic">
                ESIC Number (Optional)
              </label>
              <input
                id="bp-esic"
                type="text"
                value={esic}
                onChange={(e) => setEsic(e.target.value)}
                className={fieldClass(false)}
                placeholder="ESIC Number (Optional)"
                autoComplete="off"
              />
            </div>}
            {shouldShow('bp_pf_uan_number') && <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-800" htmlFor="bp-pf-uan">
                Do you have PF UAN number? <span className="text-rose-500">*</span>
              </label>
              <div className="flex flex-wrap items-center gap-5">
                <label className="inline-flex items-center gap-2 text-sm text-slate-800" htmlFor="bp-pf-uan-yes">
                  <input
                    id="bp-pf-uan-yes"
                    type="radio"
                    name="bp-has-pf-uan"
                    value="yes"
                    checked={hasPfUan === 'yes'}
                    onChange={() => setHasPfUan('yes')}
                    className="h-4 w-4 border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  Yes
                </label>
                <label className="inline-flex items-center gap-2 text-sm text-slate-800" htmlFor="bp-pf-uan-no">
                  <input
                    id="bp-pf-uan-no"
                    type="radio"
                    name="bp-has-pf-uan"
                    value="no"
                    checked={hasPfUan === 'no'}
                    onChange={() => {
                      setHasPfUan('no');
                      setPfUan('');
                    }}
                    className="h-4 w-4 border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  No
                </label>
              </div>
              {hasPfUan === 'yes' && (
              <input
                id="bp-pf-uan"
                type="text"
                inputMode="numeric"
                maxLength={12}
                value={pfUan}
                onChange={(e) => setPfUan(e.target.value.replace(/\D/g, '').slice(0, 12))}
                className={`${fieldClass(false)} mt-2`}
                placeholder="Enter your 12-digit PF UAN number"
                autoComplete="off"
              />
              )}
              {hasPfUan === 'no' && (
                <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  <p>Refer to the video and generate one PF UAN for yourself.</p>
                  <a
                    href={PF_UAN_DEMO_VIDEO_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex items-center text-sm font-medium text-indigo-700 underline decoration-indigo-300 underline-offset-2 hover:text-indigo-800"
                  >
                    Watch demo video
                  </a>
                </div>
              )}
              {hasPfUanError && <p className="mt-1.5 text-sm text-rose-600">{hasPfUanError}</p>}
              {pfUanError && <p className="mt-1.5 text-sm text-rose-600">{pfUanError}</p>}
            </div>}
            {shouldShow('bp_police_verification_url') && (
              <DocUploadField
                label="Police Verification Document (Optional)"
                required={false}
                inputId="bp-police"
                accept="image/*,.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                uploading={policeUp}
                error={policeErr}
                hint="Max file size: 12MB. Supported: image/*, application/pdf, .doc, .docx"
                url={policeUrl}
                onRemove={() => handleRemoveBankPhotoDocument({
                  field: 'bp_police_verification_url',
                  currentUrl: policeUrl,
                  setUrl: setPoliceUrl,
                  setErr: setPoliceErr,
                  setRemoving: setPoliceRemoving,
                })}
                removing={policeRemoving}
                onChange={handlePoliceFile}
              />
            )}
          </div>
        </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-100 px-4 py-4">
        <h3 className="text-sm font-semibold text-slate-800">Verification Status</h3>
        <ul className="mt-3 space-y-2">
          <li className="flex items-center gap-2 text-sm text-slate-800">
            <IconCheckCircle className="h-5 w-5 shrink-0 text-emerald-500" aria-hidden />
            Aadhaar
          </li>
          <li className="flex items-center gap-2 text-sm text-slate-800">
            <IconCheckCircle className="h-5 w-5 shrink-0 text-emerald-500" aria-hidden />
            PAN
          </li>
          <li className="flex items-center gap-2 text-sm text-slate-800">
            <IconCheckCircle className="h-5 w-5 shrink-0 text-emerald-500" aria-hidden />
            Bank Account
          </li>
        </ul>
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <div className="flex flex-col gap-4 border-t border-slate-200 pt-6 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={onPrevious}
          className="inline-flex items-center justify-center gap-1 rounded-xl border-2 border-indigo-600 bg-white px-5 py-3 text-sm font-semibold text-indigo-600 hover:bg-indigo-50"
        >
          <span aria-hidden>‹</span> Previous
        </button>
        <button
          type="button"
          disabled={!canSubmit || saving || Boolean(hasPfUanError) || Boolean(pfUanError)}
          onClick={handleSubmit}
          className="inline-flex items-center justify-center gap-1 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? 'Submitting…' : 'Submit'}
        </button>
      </div>
      <p className="text-center text-xs text-slate-500">Step 4 of 4 · Final Compliance Details</p>
    </div>
  );
}

function PersonalDetailsForm({ jobForm, mobile, employeeId, onSaveSuccess, correction }) {
  const requireLicenseUpload = clientRequiresLicenseUpload(jobForm);
  const [draft, setDraft] = useState(() => buildPersonalDraft(jobForm));
  const [licenseImageUrl, setLicenseImageUrl] = useState(() => jobForm.pd_driving_license_url ?? '');
  const [licenseUploading, setLicenseUploading] = useState(false);
  const [licenseRemoving, setLicenseRemoving] = useState(false);
  const [licenseError, setLicenseError] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const base = buildPersonalDraft(jobForm);
    if (correction?.active) {
      const visible = correction.visibleFields;
      setDraft({
        email: visible.has('email') ? '' : base.email,
        pd_father_name: visible.has('pd_father_name') ? '' : base.pd_father_name,
        pd_mother_name: visible.has('pd_mother_name') ? '' : base.pd_mother_name,
        pd_spouse_name: visible.has('pd_spouse_name') ? '' : base.pd_spouse_name,
        pd_emergency_contact_name: visible.has('pd_emergency_contact_name') ? '' : base.pd_emergency_contact_name,
        pd_emergency_contact_relation: visible.has('pd_emergency_contact_relation') ? '' : base.pd_emergency_contact_relation,
        pd_alternate_number: visible.has('pd_alternate_number') ? '' : base.pd_alternate_number,
        pd_current_address_same_as_aadhaar: visible.has('pd_current_address_same_as_aadhaar')
          ? ''
          : base.pd_current_address_same_as_aadhaar,
        pd_current_address: visible.has('pd_current_address') ? '' : base.pd_current_address,
        pd_current_state: visible.has('pd_current_state') ? '' : base.pd_current_state,
        pd_current_city: visible.has('pd_current_city') ? '' : base.pd_current_city,
        pd_current_pincode: visible.has('pd_current_pincode') ? '' : base.pd_current_pincode,
        pd_marital_status: visible.has('pd_marital_status') ? '' : base.pd_marital_status,
        pd_driving_license: visible.has('pd_driving_license') ? '' : base.pd_driving_license
      });
      setLicenseImageUrl(visible.has('pd_driving_license_url') ? '' : (jobForm.pd_driving_license_url ?? ''));
    } else {
      setDraft(base);
      setLicenseImageUrl(jobForm.pd_driving_license_url ?? '');
    }
    setLicenseError('');
    setLicenseRemoving(false);
  }, [jobForm, correction]);

  const dobIso = jobForm.aad_dob ? String(jobForm.aad_dob).slice(0, 10) : '';
  const ageDisplay = ageFromIsoDob(dobIso) || (jobForm.pd_age != null ? String(jobForm.pd_age) : '');

  const dl = String(draft.pd_driving_license).trim();
  const needsLicenseImage = dl === 'Yes';
  const licenseImageOk = !needsLicenseImage || Boolean(String(licenseImageUrl).trim());
  const sameAsAadhaarChoice = String(draft.pd_current_address_same_as_aadhaar ?? '').toLowerCase();
  const sameAsAadhaarSelected = sameAsAadhaarChoice === 'yes' || sameAsAadhaarChoice === 'no';
  const currentAddressValue = String(draft.pd_current_address ?? '').trim();
  const currentStateValue = String(draft.pd_current_state ?? '').trim();
  const currentCityValue = String(draft.pd_current_city ?? '').trim();
  const currentPincodeValue = String(draft.pd_current_pincode ?? '').replace(/\D/g, '');
  const fatherName = String(draft.pd_father_name ?? '').trim();
  const motherName = String(draft.pd_mother_name ?? '').trim();
  const spouseName = String(draft.pd_spouse_name ?? '').trim();
  const isMarried = String(draft.pd_marital_status ?? '').trim().toLowerCase() === 'married';
  const spouseLabel = spouseLabelForGender(jobForm.aad_gender);
  const aadCurrentState = String(jobForm?.aad_state ?? '').trim();
  const aadCurrentCity = cityFromJobForm(jobForm);
  const aadCurrentPincode = String(jobForm?.aad_pincode ?? '').replace(/\D/g, '');
  const currentAddressOk =
    sameAsAadhaarChoice === 'yes'
      ? Boolean(String(jobForm?.aad_address ?? '').trim())
      : sameAsAadhaarChoice === 'no'
        ? currentAddressValue.length > 0
        : false;
  const currentStateOk =
    sameAsAadhaarChoice === 'yes'
      ? Boolean(aadCurrentState)
      : sameAsAadhaarChoice === 'no'
        ? currentStateValue.length > 0
        : false;
  const currentCityOk =
    sameAsAadhaarChoice === 'yes'
      ? Boolean(aadCurrentCity && aadCurrentCity !== '—')
      : sameAsAadhaarChoice === 'no'
        ? currentCityValue.length > 0
        : false;
  const currentPincodeOk =
    sameAsAadhaarChoice === 'yes'
      ? PINCODE_REGEX.test(aadCurrentPincode)
      : sameAsAadhaarChoice === 'no'
        ? PINCODE_REGEX.test(currentPincodeValue)
        : false;
  const shouldShow = (field) => {
    if ((field === 'pd_driving_license' || field === 'pd_driving_license_url') && !requireLicenseUpload) return false;
    return !correction?.active || correction.visibleFields.has(field);
  };
  const isRequired = (field, fallbackRequired = false) => {
    if ((field === 'pd_driving_license' || field === 'pd_driving_license_url') && !requireLicenseUpload) return false;
    return correction?.active ? correction.requiredFields.has(field) : fallbackRequired;
  };

  const requiredOk =
    (!isRequired('email', true) || String(draft.email).trim()) &&
    (!isRequired('pd_father_name', true) || fatherName) &&
    (!isRequired('pd_mother_name', true) || motherName) &&
    (!isRequired('pd_spouse_name', true) || !isMarried || spouseName) &&
    (!isRequired('pd_emergency_contact_name', true) || String(draft.pd_emergency_contact_name).trim()) &&
    (!isRequired('pd_emergency_contact_relation', true) || String(draft.pd_emergency_contact_relation).trim()) &&
    (!isRequired('pd_alternate_number', true) || TEN_DIGIT_REGEX.test(String(draft.pd_alternate_number))) &&
    (!isRequired('pd_current_address_same_as_aadhaar', true) || sameAsAadhaarSelected) &&
    (!isRequired('pd_current_address', true) || currentAddressOk) &&
    (!isRequired('pd_current_state', true) || currentStateOk) &&
    (!isRequired('pd_current_city', true) || currentCityOk) &&
    (!isRequired('pd_current_pincode', true) || currentPincodeOk) &&
    (!isRequired('pd_marital_status', true) || String(draft.pd_marital_status).trim()) &&
    (!isRequired('pd_driving_license', true) || Boolean(dl)) &&
    (!isRequired('pd_driving_license_url', true) || licenseImageOk);

  const handleLicenseFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setLicenseError('Only image files are allowed.');
      return;
    }
    if (file.size > DRIVING_LICENSE_MAX_BYTES) {
      setLicenseError('File must be 12 MB or smaller.');
      return;
    }
    setLicenseError('');
    setLicenseUploading(true);
    try {
      const { url } = await api.uploadDrivingLicense({ mobile, employeeId, file });
      setLicenseImageUrl(url ?? '');
    } catch (err) {
      setLicenseError(err.message || 'Upload failed.');
    } finally {
      setLicenseUploading(false);
    }
  };

  const handleRemoveLicenseFile = async () => {
    if (!licenseImageUrl || licenseRemoving) return;
    setLicenseError('');
    setLicenseRemoving(true);
    try {
      await api.deleteOnboardingDocument({
        mobile,
        employeeId,
        field: 'pd_driving_license_url',
        url: licenseImageUrl,
      });
      setLicenseImageUrl('');
    } catch (err) {
      setLicenseError(err.message || 'Could not remove file.');
    } finally {
      setLicenseRemoving(false);
    }
  };

  const handleSave = async () => {
    if (!requiredOk || saving) return;
    setSaving(true);
    setError('');
    try {
      const alt = String(draft.pd_alternate_number).replace(/\D/g, '');
      if (alt.length !== 10) {
        setError('Emergency contact number must be 10 digits.');
        setSaving(false);
        return;
      }
      if (fatherName.length < 2) {
        setError("Father's name is required.");
        setSaving(false);
        return;
      }
      if (motherName.length < 2) {
        setError("Mother's name is required.");
        setSaving(false);
        return;
      }
      if (isMarried && spouseName.length < 2) {
        setError(`${spouseLabel} is required for married candidates.`);
        setSaving(false);
        return;
      }
      if (!sameAsAadhaarSelected) {
        setError('Please choose whether current address is same as Aadhaar address.');
        setSaving(false);
        return;
      }
      if (sameAsAadhaarChoice === 'no' && !currentAddressValue) {
        setError('Please add your current address.');
        setSaving(false);
        return;
      }
      const currentAddressPayload =
        sameAsAadhaarChoice === 'yes'
          ? String(jobForm?.aad_address ?? '').trim()
          : currentAddressValue;
      const currentStatePayload =
        sameAsAadhaarChoice === 'yes'
          ? aadCurrentState
          : currentStateValue;
      const currentCityPayload =
        sameAsAadhaarChoice === 'yes'
          ? aadCurrentCity === '—' ? '' : aadCurrentCity
          : currentCityValue;
      const currentPincodePayload =
        sameAsAadhaarChoice === 'yes'
          ? aadCurrentPincode
          : currentPincodeValue;
      if (!currentStatePayload) {
        setError('Please add your current state.');
        setSaving(false);
        return;
      }
      if (!currentCityPayload) {
        setError('Please add your current city.');
        setSaving(false);
        return;
      }
      if (!PINCODE_REGEX.test(currentPincodePayload)) {
        setError('Current pincode must be exactly 6 digits.');
        setSaving(false);
        return;
      }
      const { form } = await api.patchJobAppForm({
        mobile,
        employee_id: employeeId || null,
        patch_step: 'personal',
        email: String(draft.email).trim(),
        pd_father_name: fatherName,
        pd_mother_name: motherName,
        pd_spouse_name: isMarried ? spouseName : null,
        pd_emergency_contact_name: String(draft.pd_emergency_contact_name).trim(),
        pd_emergency_contact_relation: String(draft.pd_emergency_contact_relation).trim(),
        pd_alternate_number: alt,
        pd_current_address_same_as_aadhaar: sameAsAadhaarChoice === 'yes',
        pd_current_address: currentAddressPayload,
        pd_current_state: currentStatePayload,
        pd_current_city: currentCityPayload,
        pd_current_pincode: currentPincodePayload,
        pd_marital_status: String(draft.pd_marital_status).trim(),
        pd_driving_license: requireLicenseUpload ? dl : null,
        pd_driving_license_url: requireLicenseUpload && needsLicenseImage ? String(licenseImageUrl).trim() : null,
      });
      onSaveSuccess?.(form);
    } catch (err) {
      setError(err.message || 'Could not save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  if (correction?.active) {
    return (
      <div className="space-y-8">
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Please correct the highlighted fields and resubmit your form.
        </div>
        <div className="space-y-4">
          {shouldShow('email') && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-800">
                Email Address {isRequired('email', true) && <span className="text-rose-500">*</span>}
              </label>
              <input
                type="email"
                autoComplete="email"
                className={fieldClass(false)}
                placeholder="example@example.com"
                value={draft.email}
                onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
              />
            </div>
          )}
          {(shouldShow('pd_father_name') || shouldShow('pd_mother_name') || (isMarried && shouldShow('pd_spouse_name'))) && (
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-700">Family Details</h4>
              <div className="space-y-3">
                {shouldShow('pd_father_name') && (
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-800">
                      Father&apos;s Name {isRequired('pd_father_name', true) && <span className="text-rose-500">*</span>}
                    </label>
                    <input
                      type="text"
                      className={fieldClass(false)}
                      placeholder="Enter father's name"
                      value={draft.pd_father_name}
                      onChange={(e) => setDraft((d) => ({ ...d, pd_father_name: e.target.value }))}
                    />
                  </div>
                )}
                {shouldShow('pd_mother_name') && (
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-800">
                      Mother&apos;s Name {isRequired('pd_mother_name', true) && <span className="text-rose-500">*</span>}
                    </label>
                    <input
                      type="text"
                      className={fieldClass(false)}
                      placeholder="Enter mother's name"
                      value={draft.pd_mother_name}
                      onChange={(e) => setDraft((d) => ({ ...d, pd_mother_name: e.target.value }))}
                    />
                  </div>
                )}
                {isMarried && shouldShow('pd_spouse_name') && (
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-800">
                      {spouseLabel} {isRequired('pd_spouse_name', true) && <span className="text-rose-500">*</span>}
                    </label>
                    <input
                      type="text"
                      className={fieldClass(false)}
                      placeholder={`Enter ${spouseLabel.toLowerCase()}`}
                      value={draft.pd_spouse_name}
                      onChange={(e) => setDraft((d) => ({ ...d, pd_spouse_name: e.target.value }))}
                    />
                  </div>
                )}
              </div>
            </div>
          )}
          {(shouldShow('pd_current_address_same_as_aadhaar') ||
            shouldShow('pd_current_address') ||
            shouldShow('pd_current_state') ||
            shouldShow('pd_current_city') ||
            shouldShow('pd_current_pincode')) && (
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-700">Current Address</h4>
              {shouldShow('pd_current_address_same_as_aadhaar') && (
                <div>
                  <p className="mb-2 text-sm font-medium text-slate-800">
                    Same as Aadhaar Address? {isRequired('pd_current_address_same_as_aadhaar', true) && <span className="text-rose-500">*</span>}
                  </p>
                  <div className="flex items-center gap-5">
                    <label className="inline-flex items-center gap-2 text-sm text-slate-800">
                      <input
                        type="radio"
                        name="corr-current-address-same"
                        checked={sameAsAadhaarChoice === 'yes'}
                        onChange={() =>
                          setDraft((d) => ({
                            ...d,
                            pd_current_address_same_as_aadhaar: 'yes',
                            pd_current_address: String(jobForm?.aad_address ?? ''),
                            pd_current_state: aadCurrentState,
                            pd_current_city: aadCurrentCity === '—' ? '' : aadCurrentCity,
                            pd_current_pincode: aadCurrentPincode,
                          }))
                        }
                      />
                      Yes
                    </label>
                    <label className="inline-flex items-center gap-2 text-sm text-slate-800">
                      <input
                        type="radio"
                        name="corr-current-address-same"
                        checked={sameAsAadhaarChoice === 'no'}
                        onChange={() =>
                          setDraft((d) => ({
                            ...d,
                            pd_current_address_same_as_aadhaar: 'no',
                            pd_current_address: d.pd_current_address_same_as_aadhaar === 'yes' ? '' : d.pd_current_address,
                            pd_current_state: d.pd_current_address_same_as_aadhaar === 'yes' ? '' : d.pd_current_state,
                            pd_current_city: d.pd_current_address_same_as_aadhaar === 'yes' ? '' : d.pd_current_city,
                            pd_current_pincode: d.pd_current_address_same_as_aadhaar === 'yes' ? '' : d.pd_current_pincode,
                          }))
                        }
                      />
                      No
                    </label>
                  </div>
                </div>
              )}
              {shouldShow('pd_current_address') && (
                <div className="mt-3">
                  {sameAsAadhaarChoice === 'no' && (
                    <p className="mb-1.5 text-xs text-amber-700">Please add your current address.</p>
                  )}
                  <textarea
                    rows={3}
                    className={`${fieldClass(sameAsAadhaarChoice === 'yes')} resize-none`}
                    value={sameAsAadhaarChoice === 'yes' ? String(jobForm?.aad_address ?? '') : draft.pd_current_address}
                    onChange={(e) => setDraft((d) => ({ ...d, pd_current_address: e.target.value }))}
                    readOnly={sameAsAadhaarChoice === 'yes'}
                    placeholder="Enter your full current address"
                  />
                </div>
              )}
              {shouldShow('pd_current_state') && (
                <div className="mt-3">
                  <label className="mb-1.5 block text-sm font-medium text-slate-800">
                    Current State {isRequired('pd_current_state', true) && <span className="text-rose-500">*</span>}
                  </label>
                  <input
                    type="text"
                    className={fieldClass(sameAsAadhaarChoice === 'yes')}
                    value={sameAsAadhaarChoice === 'yes' ? aadCurrentState : draft.pd_current_state}
                    onChange={(e) => setDraft((d) => ({ ...d, pd_current_state: e.target.value }))}
                    readOnly={sameAsAadhaarChoice === 'yes'}
                    placeholder="Enter current state"
                  />
                </div>
              )}
              {shouldShow('pd_current_city') && (
                <div className="mt-3">
                  <label className="mb-1.5 block text-sm font-medium text-slate-800">
                    Current City {isRequired('pd_current_city', true) && <span className="text-rose-500">*</span>}
                  </label>
                  <input
                    type="text"
                    className={fieldClass(sameAsAadhaarChoice === 'yes')}
                    value={sameAsAadhaarChoice === 'yes' ? (aadCurrentCity === '—' ? '' : aadCurrentCity) : draft.pd_current_city}
                    onChange={(e) => setDraft((d) => ({ ...d, pd_current_city: e.target.value }))}
                    readOnly={sameAsAadhaarChoice === 'yes'}
                    placeholder="Enter current city"
                  />
                </div>
              )}
              {shouldShow('pd_current_pincode') && (
                <div className="mt-3">
                  <label className="mb-1.5 block text-sm font-medium text-slate-800">
                    Current Pincode {isRequired('pd_current_pincode', true) && <span className="text-rose-500">*</span>}
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    className={fieldClass(sameAsAadhaarChoice === 'yes')}
                    value={sameAsAadhaarChoice === 'yes' ? aadCurrentPincode : draft.pd_current_pincode}
                    onChange={(e) => setDraft((d) => ({ ...d, pd_current_pincode: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
                    readOnly={sameAsAadhaarChoice === 'yes'}
                    placeholder="6-digit pincode"
                  />
                </div>
              )}
            </div>
          )}
          {shouldShow('pd_marital_status') && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-800">
                Marital Status {isRequired('pd_marital_status', true) && <span className="text-rose-500">*</span>}
              </label>
              <select
                className={fieldClass(false)}
                value={draft.pd_marital_status}
                onChange={(e) => {
                  const next = e.target.value;
                  setDraft((d) => ({ ...d, pd_marital_status: next, pd_spouse_name: next === 'Married' ? d.pd_spouse_name : '' }));
                }}
              >
                <option value="">Select Marital Status</option>
                {MARITAL_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          )}
          {shouldShow('pd_driving_license') && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-800">
                Do you have a Driving License? {isRequired('pd_driving_license', true) && <span className="text-rose-500">*</span>}
              </label>
              <select
                className={fieldClass(false)}
                value={draft.pd_driving_license}
                onChange={(e) => {
                  const v = e.target.value;
                  setDraft((d) => ({ ...d, pd_driving_license: v }));
                  if (v !== 'Yes') {
                    setLicenseImageUrl('');
                    setLicenseError('');
                  }
                }}
              >
                <option value="">Select</option>
                {DRIVING_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          )}
          {shouldShow('pd_driving_license_url') && needsLicenseImage && (
            <DocUploadField
              label="Upload Driving License Image"
              required={isRequired('pd_driving_license_url', true)}
              inputId="driving-license-file"
              accept="image/*"
              uploading={licenseUploading}
              error={licenseError}
              hint="Max file size: 12MB. Supported: image/*"
              url={licenseImageUrl}
              onRemove={handleRemoveLicenseFile}
              removing={licenseRemoving}
              onChange={handleLicenseFile}
            />
          )}
          {(shouldShow('pd_emergency_contact_name') ||
            shouldShow('pd_alternate_number') ||
            shouldShow('pd_emergency_contact_relation')) && (
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-700">Emergency Contact</h4>
              <div className="space-y-3">
                {shouldShow('pd_emergency_contact_name') && (
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-800">
                      Name {isRequired('pd_emergency_contact_name', true) && <span className="text-rose-500">*</span>}
                    </label>
                    <input
                      type="text"
                      className={fieldClass(false)}
                      placeholder="Enter emergency contact name"
                      value={draft.pd_emergency_contact_name}
                      onChange={(e) => setDraft((d) => ({ ...d, pd_emergency_contact_name: e.target.value }))}
                    />
                  </div>
                )}
                {shouldShow('pd_alternate_number') && (
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-800">
                      Number {isRequired('pd_alternate_number', true) && <span className="text-rose-500">*</span>}
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={10}
                      className={fieldClass(false)}
                      placeholder="10-digit emergency contact number"
                      value={draft.pd_alternate_number}
                      onChange={(e) => setDraft((d) => ({ ...d, pd_alternate_number: normalizeMobile(e.target.value) }))}
                    />
                  </div>
                )}
                {shouldShow('pd_emergency_contact_relation') && (
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-800">
                      Relation {isRequired('pd_emergency_contact_relation', true) && <span className="text-rose-500">*</span>}
                    </label>
                    <input
                      type="text"
                      className={fieldClass(false)}
                      placeholder="e.g. Father, Mother, Spouse"
                      value={draft.pd_emergency_contact_relation}
                      onChange={(e) => setDraft((d) => ({ ...d, pd_emergency_contact_relation: e.target.value }))}
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <button
          type="button"
          disabled={!requiredOk || saving}
          onClick={handleSave}
          className="mt-2 w-full rounded-xl bg-indigo-600 py-4 text-base font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? 'Saving...' : 'Save & continue'}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <div className="text-center">
        <h2 className="text-2xl font-semibold text-slate-900">Personal Info</h2>
        <p className="mt-2 text-sm text-slate-600">Confirm details from your Aadhaar and add emergency contact details.</p>
      </div>

      {/* Section A — read-only Aadhaar-matched */}
      <section>
        <div className="mb-5 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <IconCheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <p>Fields below are auto-filled from your Aadhaar verification and cannot be edited.</p>
        </div>

        <div className="space-y-4">
          <div className="cursor-not-allowed">
            <label className="mb-1.5 block cursor-inherit text-sm font-medium text-slate-800">
              Full Name (As per Aadhaar) <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              readOnly
              tabIndex={-1}
              className={fieldClass(true)}
              value={jobForm.aad_name ?? ''}
            />
          </div>
          <div className="cursor-not-allowed">
            <label className="mb-1.5 block cursor-inherit text-sm font-medium text-slate-800">
              Mobile Number <span className="text-rose-500">*</span>
            </label>
            <div className="select-none rounded-lg border border-sky-200 bg-sky-50 px-4 py-3">
              <p className="font-medium tabular-nums text-slate-900">{mobile}</p>
              <p className="mt-1 text-xs text-sky-900">This mobile number is locked and cannot be changed.</p>
            </div>
          </div>
        </div>
      </section>

      <hr className="border-slate-200" />

      {/* Section B — Aadhaar-locked identity + editable application fields */}
      <section>
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <IconCheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <p>
            State, city, address, pincode, date of birth, age, and gender come from your Aadhaar record and cannot be
            edited here.
          </p>
        </div>
        <h3 className="mb-4 text-lg font-semibold text-slate-900">Personal Details</h3>
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-800">
              Email Address <span className="text-rose-500">*</span>
            </label>
            <input
              type="email"
              autoComplete="email"
              className={fieldClass(false)}
              placeholder="example@example.com"
              value={draft.email}
              onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-800">
              Father&apos;s Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              className={fieldClass(false)}
              placeholder="Enter father's name"
              value={draft.pd_father_name}
              onChange={(e) => setDraft((d) => ({ ...d, pd_father_name: e.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-800">
              Mother&apos;s Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              className={fieldClass(false)}
              placeholder="Enter mother's name"
              value={draft.pd_mother_name}
              onChange={(e) => setDraft((d) => ({ ...d, pd_mother_name: e.target.value }))}
            />
          </div>
          <div className="cursor-not-allowed">
            <label className="mb-1.5 block cursor-inherit text-sm font-medium text-slate-800">
              Complete Address (As per Aadhaar) <span className="text-rose-500">*</span>
            </label>
            <textarea
              readOnly
              tabIndex={-1}
              rows={3}
              className={`${fieldClass(true)} resize-none`}
              value={jobForm.aad_address ?? ''}
            />
          </div>
          <div className="cursor-not-allowed">
            <label className="mb-1.5 block cursor-inherit text-sm font-medium text-slate-800">
              State <span className="text-rose-500">*</span>
            </label>
            <input type="text" readOnly tabIndex={-1} className={fieldClass(true)} value={jobForm.aad_state ?? ''} />
          </div>
          <div className="cursor-not-allowed">
            <label className="mb-1.5 block cursor-inherit text-sm font-medium text-slate-800">
              City <span className="text-rose-500">*</span>
            </label>
            <input type="text" readOnly tabIndex={-1} className={fieldClass(true)} value={cityFromJobForm(jobForm)} />
          </div>
          <div className="cursor-not-allowed">
            <label className="mb-1.5 block cursor-inherit text-sm font-medium text-slate-800">
              Pincode <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              readOnly
              tabIndex={-1}
              className={`${fieldClass(true)} tabular-nums`}
              value={jobForm.aad_pincode ?? ''}
            />
          </div>
          <div>
            <h4 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-700">Current Address</h4>
            <p className="mb-2 text-sm font-medium text-slate-800">
              Same as Aadhaar Address? <span className="text-rose-500">*</span>
            </p>
            <div className="mb-3 flex items-center gap-5">
              <label className="inline-flex items-center gap-2 text-sm text-slate-800">
                <input
                  type="radio"
                  name="current-address-same"
                  checked={sameAsAadhaarChoice === 'yes'}
                  onChange={() =>
                    setDraft((d) => ({
                      ...d,
                      pd_current_address_same_as_aadhaar: 'yes',
                      pd_current_address: String(jobForm?.aad_address ?? ''),
                      pd_current_state: aadCurrentState,
                      pd_current_city: aadCurrentCity === '—' ? '' : aadCurrentCity,
                      pd_current_pincode: aadCurrentPincode,
                    }))
                  }
                />
                Yes
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-slate-800">
                <input
                  type="radio"
                  name="current-address-same"
                  checked={sameAsAadhaarChoice === 'no'}
                  onChange={() =>
                    setDraft((d) => ({
                      ...d,
                      pd_current_address_same_as_aadhaar: 'no',
                      pd_current_address: d.pd_current_address_same_as_aadhaar === 'yes' ? '' : d.pd_current_address,
                      pd_current_state: d.pd_current_address_same_as_aadhaar === 'yes' ? '' : d.pd_current_state,
                      pd_current_city: d.pd_current_address_same_as_aadhaar === 'yes' ? '' : d.pd_current_city,
                      pd_current_pincode: d.pd_current_address_same_as_aadhaar === 'yes' ? '' : d.pd_current_pincode,
                    }))
                  }
                />
                No
              </label>
            </div>
            {sameAsAadhaarChoice === 'no' && (
              <p className="mb-1.5 text-xs text-amber-700">Please add your current address.</p>
            )}
            <textarea
              rows={3}
              className={`${fieldClass(sameAsAadhaarChoice === 'yes')} resize-none`}
              value={sameAsAadhaarChoice === 'yes' ? String(jobForm?.aad_address ?? '') : draft.pd_current_address}
              onChange={(e) => setDraft((d) => ({ ...d, pd_current_address: e.target.value }))}
              readOnly={sameAsAadhaarChoice === 'yes'}
              placeholder="Enter your full current address"
            />
            <div className="mt-3">
              <label className="mb-1.5 block text-sm font-medium text-slate-800">
                Current State <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                className={fieldClass(sameAsAadhaarChoice === 'yes')}
                value={sameAsAadhaarChoice === 'yes' ? aadCurrentState : draft.pd_current_state}
                onChange={(e) => setDraft((d) => ({ ...d, pd_current_state: e.target.value }))}
                readOnly={sameAsAadhaarChoice === 'yes'}
                placeholder="Enter current state"
              />
            </div>
            <div className="mt-3">
              <label className="mb-1.5 block text-sm font-medium text-slate-800">
                Current City <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                className={fieldClass(sameAsAadhaarChoice === 'yes')}
                value={sameAsAadhaarChoice === 'yes' ? (aadCurrentCity === '—' ? '' : aadCurrentCity) : draft.pd_current_city}
                onChange={(e) => setDraft((d) => ({ ...d, pd_current_city: e.target.value }))}
                readOnly={sameAsAadhaarChoice === 'yes'}
                placeholder="Enter current city"
              />
            </div>
            <div className="mt-3">
              <label className="mb-1.5 block text-sm font-medium text-slate-800">
                Current Pincode <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                className={fieldClass(sameAsAadhaarChoice === 'yes')}
                value={sameAsAadhaarChoice === 'yes' ? aadCurrentPincode : draft.pd_current_pincode}
                onChange={(e) => setDraft((d) => ({ ...d, pd_current_pincode: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
                readOnly={sameAsAadhaarChoice === 'yes'}
                placeholder="6-digit pincode"
              />
            </div>
          </div>
          <div className="cursor-not-allowed">
            <label className="mb-1.5 block cursor-inherit text-sm font-medium text-slate-800">
              Date of Birth <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              readOnly
              tabIndex={-1}
              className={`${fieldClass(true)} tabular-nums`}
              value={formatAadDob(jobForm.aad_dob)}
            />
          </div>
          <div className="cursor-not-allowed">
            <label className="mb-1.5 block cursor-inherit text-sm font-medium text-slate-800">Age</label>
            <input type="text" readOnly tabIndex={-1} className={fieldClass(true)} value={ageDisplay} placeholder="—" />
          </div>
          <div className="cursor-not-allowed">
            <label className="mb-1.5 block cursor-inherit text-sm font-medium text-slate-800">Gender</label>
            <input
              type="text"
              readOnly
              tabIndex={-1}
              className={fieldClass(true)}
              value={formatAadGender(jobForm.aad_gender)}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-800">
              Marital Status <span className="text-rose-500">*</span>
            </label>
            <select
              className={fieldClass(false)}
              value={draft.pd_marital_status}
              onChange={(e) => {
                const next = e.target.value;
                setDraft((d) => ({ ...d, pd_marital_status: next, pd_spouse_name: next === 'Married' ? d.pd_spouse_name : '' }));
              }}
            >
              <option value="">Select Marital Status</option>
              {MARITAL_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          {isMarried && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-800">
                {spouseLabel} <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                className={fieldClass(false)}
                placeholder={`Enter ${spouseLabel.toLowerCase()}`}
                value={draft.pd_spouse_name}
                onChange={(e) => setDraft((d) => ({ ...d, pd_spouse_name: e.target.value }))}
              />
            </div>
          )}
          {shouldShow('pd_driving_license') && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-800">
                Do you have a Driving License? <span className="text-rose-500">*</span>
              </label>
              <select
                className={fieldClass(false)}
                value={draft.pd_driving_license}
                onChange={(e) => {
                  const v = e.target.value;
                  setDraft((d) => ({ ...d, pd_driving_license: v }));
                  if (v !== 'Yes') {
                    setLicenseImageUrl('');
                    setLicenseError('');
                  }
                }}
              >
                <option value="">Select</option>
                {DRIVING_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          )}

          {shouldShow('pd_driving_license_url') && needsLicenseImage && (
            <DocUploadField
              label="Upload Driving License Image"
              required
              inputId="driving-license-file"
              accept="image/*"
              uploading={licenseUploading}
              error={licenseError}
              hint="Max file size: 12MB. Supported: image/* (JPEG, PNG, WebP, GIF, HEIC, etc.)"
              url={licenseImageUrl}
              onRemove={handleRemoveLicenseFile}
              removing={licenseRemoving}
              onChange={handleLicenseFile}
            />
          )}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-700">Emergency Contact</h4>
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-800">
                  Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  className={fieldClass(false)}
                  placeholder="Enter emergency contact name"
                  value={draft.pd_emergency_contact_name}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, pd_emergency_contact_name: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-800">
                  Number <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={10}
                  className={fieldClass(false)}
                  placeholder="10-digit emergency contact number"
                  value={draft.pd_alternate_number}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, pd_alternate_number: normalizeMobile(e.target.value) }))
                  }
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-800">
                  Relation <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  className={fieldClass(false)}
                  placeholder="e.g. Father, Mother, Spouse"
                  value={draft.pd_emergency_contact_relation}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, pd_emergency_contact_relation: e.target.value }))
                  }
                />
              </div>
            </div>
          </div>
        </div>

        {error && <p className="text-sm text-rose-600">{error}</p>}

        <button
          type="button"
          disabled={!requiredOk || saving}
          onClick={handleSave}
          className="mt-8 w-full rounded-xl bg-indigo-600 py-4 text-base font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? 'Saving...' : 'Save & continue'}
        </button>
      </section>
    </div>
  );
}

export default function OnboardingForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const employeeId = searchParams.get('employee_id') || '';
  const resumeMode = searchParams.get('resume') === 'true';
  const resumeStep = searchParams.get('step') || '';
  const employeeSpecificLink = Boolean(employeeId);

  const [mobile, setMobile] = useState('');
  const [mobileVerified, setMobileVerified] = useState(false);
  const [mobileSubmitting, setMobileSubmitting] = useState(false);
  const [mobileError, setMobileError] = useState('');
  const [prefillLoading, setPrefillLoading] = useState(employeeSpecificLink);

  const [aadhaar, setAadhaar] = useState('');
  const [aadhaarPhase, setAadhaarPhase] = useState(null);
  const [otp, setOtp] = useState('');
  const [aadhaarSubmitting, setAadhaarSubmitting] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [aadhaarError, setAadhaarError] = useState('');

  const [aadhaarComplete, setAadhaarComplete] = useState(false);
  const [aadhaarKyc, setAadhaarKyc] = useState(null);
  const [aadhaarResumeFlow, setAadhaarResumeFlow] = useState(false);

  const [formView, setFormView] = useState('onboarding');
  const [jobFormRow, setJobFormRow] = useState(null);
  const [proceedLoading, setProceedLoading] = useState(false);
  const [proceedError, setProceedError] = useState('');
  const correctionModeActive =
    resumeMode && String(jobFormRow?.review_status ?? '').trim() === 'CORRECTION_REQUESTED';

  const visibleSteps = (() => {
    if (!correctionModeActive || !jobFormRow) return STEP_ORDER;
    const editable = new Set(Array.isArray(jobFormRow.editable_fields) ? jobFormRow.editable_fields : []);
    const hasEditableForStep = (step) => {
      const rules = STEP_PREFIX_RULES[step] || [];
      for (const field of editable) {
        const f = String(field ?? '').trim();
        if (!f) continue;
        if (rules.some((prefix) => (prefix.endsWith('_') ? f.startsWith(prefix) : f === prefix))) return true;
      }
      return false;
    };
    const hasOptionalMissingForStep = (step) => {
      const optionalFields = STEP_OPTIONAL_FIELDS[step] || [];
      return optionalFields.some((k) => isEmptyForCorrection(jobFormRow?.[k]));
    };
    const filtered = STEP_ORDER.filter((step) => hasEditableForStep(step) || hasOptionalMissingForStep(step));
    if (filtered.length === 0) return ['personal', 'photo'];
    if (!filtered.includes('photo')) filtered.push('photo');
    return filtered;
  })();

  const nextVisibleStep = (current) => {
    const idx = visibleSteps.indexOf(current);
    if (idx < 0) return visibleSteps[0] || 'personal';
    return visibleSteps[idx + 1] || current;
  };

  const previousVisibleStep = (current) => {
    const idx = visibleSteps.indexOf(current);
    if (idx <= 0) return current;
    return visibleSteps[idx - 1] || current;
  };
  const correctionConfigForStep = (step) => {
    if (!correctionModeActive || !jobFormRow) {
      return { active: false, visibleFields: new Set(), requiredFields: new Set() };
    }
    const requiredFields = new Set(
      (Array.isArray(jobFormRow.editable_fields) ? jobFormRow.editable_fields : []).filter((f) =>
        (STEP_ALL_FIELDS[step] || []).includes(String(f ?? '').trim())
      )
    );
    const visibleFields = new Set(requiredFields);
    if (step === 'personal') {
      if (!String(jobFormRow?.pd_emergency_contact_name ?? '').trim()) {
        visibleFields.add('pd_emergency_contact_name');
        requiredFields.add('pd_emergency_contact_name');
      }
      if (!String(jobFormRow?.pd_emergency_contact_relation ?? '').trim()) {
        visibleFields.add('pd_emergency_contact_relation');
        requiredFields.add('pd_emergency_contact_relation');
      }
      if (!TEN_DIGIT_REGEX.test(String(jobFormRow?.pd_alternate_number ?? ''))) {
        visibleFields.add('pd_alternate_number');
        requiredFields.add('pd_alternate_number');
      }
      const sameAsAad = jobFormRow?.pd_current_address_same_as_aadhaar;
      const sameAsAadChoice =
        sameAsAad === true || String(sameAsAad).toLowerCase() === 'true'
          ? 'yes'
          : sameAsAad === false || String(sameAsAad).toLowerCase() === 'false'
            ? 'no'
            : '';
      if (!sameAsAadChoice) {
        visibleFields.add('pd_current_address_same_as_aadhaar');
        requiredFields.add('pd_current_address_same_as_aadhaar');
      }
      if (sameAsAadChoice === 'no' && !String(jobFormRow?.pd_current_address ?? '').trim()) {
        visibleFields.add('pd_current_address');
        requiredFields.add('pd_current_address');
      }
    }
    if (step === 'photo') {
      if (!TWELVE_DIGIT_REGEX.test(String(jobFormRow?.bp_pf_uan_number ?? ''))) {
        visibleFields.add('bp_pf_uan_number');
        requiredFields.add('bp_pf_uan_number');
      }
    }
    for (const optionalField of STEP_OPTIONAL_FIELDS[step] || []) {
      if (isEmptyForCorrection(jobFormRow?.[optionalField])) {
        visibleFields.add(optionalField);
      }
    }
    return { active: true, visibleFields, requiredFields };
  };

  const navigateToStatus = (mobileValue) => {
    const q = new URLSearchParams();
    q.set('mobile', mobileValue || mobile);
    if (employeeId) q.set('employee_id', employeeId);
    navigate(`/onboarding-status?${q.toString()}`);
  };

  const resolveResumeFormView = () => {
    const requested = resumeStep === 'qualification' || resumeStep === 'kyc' || resumeStep === 'photo' ? resumeStep : 'personal';
    if (visibleSteps.includes(requested)) return requested;
    return visibleSteps[0] || 'personal';
  };

  const hasValidMobile = TEN_DIGIT_REGEX.test(mobile);
  const hasValidAadhaar = TWELVE_DIGIT_REGEX.test(aadhaar);
  const hasValidOtp = SIX_DIGIT_REGEX.test(otp);

  const setupAadhaarStepFromForm = (form) => {
    const savedAadhaar = normalizeAadhaar(form?.aadhaar_number ?? '');
    const savedKyc = aadhaarKycFromForm(form);
    const canUseResumeFlow = form?.aadhaar_verified === true && TWELVE_DIGIT_REGEX.test(savedAadhaar);

    setAadhaar(savedAadhaar);
    setOtp('');
    setAadhaarError('');
    setAadhaarComplete(false);

    if (canUseResumeFlow) {
      setAadhaarResumeFlow(true);
      setAadhaarPhase('resume_input');
      setAadhaarKyc(savedKyc);
      return;
    }

    setAadhaarResumeFlow(false);
    setAadhaarKyc(null);
    setAadhaarPhase('input');
  };

  useEffect(() => {
    if (!employeeSpecificLink) {
      setPrefillLoading(false);
      return;
    }

    let cancelled = false;
    const loadEmployeeSummary = async () => {
      setPrefillLoading(true);
      setMobileError('');
      try {
        const result = await api.getOnboardingEmployeeSummary({ employeeId });
        const fetchedMobile = normalizeMobile(result?.employee?.mobile ?? '');
        if (!TEN_DIGIT_REGEX.test(fetchedMobile)) {
          throw new Error('Could not load a valid mobile number for this onboarding link.');
        }
        if (cancelled) return;
        const { form } = await api.getJobAppForm({ mobile: fetchedMobile, employeeId });
        const reviewStatus = String(form?.review_status ?? '').trim();
        const submitted = String(form?.submission_status ?? '').trim() === 'Submitted';
        const isFinalized = reviewStatus === 'APPROVED' || reviewStatus === 'REJECTED';
        const isWaitingForPm = submitted && reviewStatus !== 'CORRECTION_REQUESTED';
        if (isFinalized || isWaitingForPm) {
          navigateToStatus(fetchedMobile);
          return;
        }
        setMobile(fetchedMobile);
        setMobileVerified(true);
        if (resumeMode && reviewStatus === 'CORRECTION_REQUESTED') {
          setAadhaarResumeFlow(false);
          setAadhaarComplete(true);
          setJobFormRow(form);
          setFormView(resolveResumeFormView());
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        }
        setupAadhaarStepFromForm(form);
      } catch (err) {
        if (cancelled) return;
        setMobileError(err.message || 'Unable to validate this onboarding link right now.');
      } finally {
        if (cancelled) return;
        setPrefillLoading(false);
      }
    };
    loadEmployeeSummary();

    return () => {
      cancelled = true;
    };
  }, [employeeId, employeeSpecificLink]);

  const handleMobileContinue = async () => {
    if (!hasValidMobile || mobileSubmitting) return;
    setMobileSubmitting(true);
    setMobileError('');
    try {
      const result = await api.lookupOnboardingMobile({ mobile, employeeId });
      if (!result.matched) {
        setMobileError('This mobile number is not associated with a valid onboarding form.');
        return;
      }
      const { form } = await api.getJobAppForm({ mobile, employeeId });
      const reviewStatus = String(form?.review_status ?? '').trim();
      const submitted = String(form?.submission_status ?? '').trim() === 'Submitted';
      const isFinalized = reviewStatus === 'APPROVED' || reviewStatus === 'REJECTED';
      const isWaitingForPm = submitted && reviewStatus !== 'CORRECTION_REQUESTED';
      if (isFinalized || isWaitingForPm) {
        navigateToStatus(mobile);
        return;
      }
      if (resumeMode && reviewStatus === 'CORRECTION_REQUESTED') {
        setMobileVerified(true);
        setAadhaarResumeFlow(false);
        setAadhaarComplete(true);
        setJobFormRow(form);
        setFormView(resolveResumeFormView());
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      setMobileVerified(true);
      setupAadhaarStepFromForm(form);
    } catch (err) {
      setMobileError(err.message || 'Unable to verify mobile number right now.');
    } finally {
      setMobileSubmitting(false);
    }
  };

  const handleSendAadhaarOtp = async () => {
    if (!hasValidAadhaar || aadhaarSubmitting || !mobileVerified) return;
    setAadhaarSubmitting(true);
    setAadhaarError('');
    try {
      await api.sendAadhaarOtp({ mobile, employeeId, aadhaar });
      setOtp('');
      setAadhaarPhase('otp');
    } catch (err) {
      setAadhaarError(err.message || 'Could not send OTP. Try again.');
    } finally {
      setAadhaarSubmitting(false);
    }
  };

  const handleSendAadhaarResumeOtp = async () => {
    if (aadhaarSubmitting || !mobileVerified) return;
    setAadhaarSubmitting(true);
    setAadhaarError('');
    try {
      await api.sendAadhaarResumeOtp({ mobile, employeeId });
      setOtp('');
      setAadhaarPhase('resume_otp');
    } catch (err) {
      setAadhaarError(err.message || 'Could not send OTP. Try again.');
    } finally {
      setAadhaarSubmitting(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!hasValidOtp || otpVerifying) return;
    setOtpVerifying(true);
    setAadhaarError('');
    try {
      const result = aadhaarResumeFlow
        ? await api.verifyAadhaarResumeOtp({ mobile, employeeId, otp })
        : await api.verifyAadhaarOtp({ mobile, employeeId, otp });
      if (result?.aadhaar_number) {
        setAadhaar(normalizeAadhaar(result.aadhaar_number));
      }
      setAadhaarKyc(result.aadhaarDetails ?? aadhaarKyc ?? null);
      // Read back persisted form immediately so the flow reflects saved DB state.
      try {
        const { form } = await api.getJobAppForm({ mobile, employeeId });
        if (form?.aadhaar_number) setAadhaar(normalizeAadhaar(form.aadhaar_number));
        setAadhaarKyc(aadhaarKycFromForm(form) ?? result.aadhaarDetails ?? aadhaarKyc ?? null);
      } catch {
        // Ignore refresh failures here; OTP verification already succeeded.
      }
      setAadhaarComplete(true);
    } catch (err) {
      setAadhaarError(err.message || 'Verification failed.');
    } finally {
      setOtpVerifying(false);
    }
  };

  const handleProceedToPersonal = async () => {
    setProceedError('');
    setProceedLoading(true);
    try {
      const { form } = await api.getJobAppForm({ mobile, employeeId });
      const reviewStatus = String(form?.review_status ?? '').trim();
      const submitted = String(form?.submission_status ?? '').trim() === 'Submitted';
      const isFinalized = reviewStatus === 'APPROVED' || reviewStatus === 'REJECTED';
      const isWaitingForPm = submitted && reviewStatus !== 'CORRECTION_REQUESTED';
      if (isFinalized || isWaitingForPm) {
        navigateToStatus(mobile);
        return;
      }
      setJobFormRow(form);
      setFormView(resumeMode ? resolveResumeFormView() : 'personal');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setProceedError(err.message || 'Could not load personal details.');
    } finally {
      setProceedLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-5">
          <h1 className="text-2xl font-semibold text-slate-900">Job Application Form</h1>
          <button
            type="button"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
          >
            English
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        {formView === 'photo' && jobFormRow ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <BankPhotoForm
              jobForm={jobFormRow}
              mobile={mobile}
              employeeId={employeeId}
              correction={correctionConfigForStep('photo')}
              onPrevious={() => {
                setFormView(previousVisibleStep('photo'));
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onSubmitted={(form) => {
                setJobFormRow(form);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onGoToStatus={() => navigateToStatus(mobile)}
            />
          </div>
        ) : formView === 'kyc' && jobFormRow ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <KycDocumentsForm
              jobForm={jobFormRow}
              mobile={mobile}
              employeeId={employeeId}
              correction={correctionConfigForStep('kyc')}
              onPrevious={() => {
                setFormView(previousVisibleStep('kyc'));
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onSaveSuccess={(form) => {
                setJobFormRow(form);
                setFormView(nextVisibleStep('kyc'));
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          </div>
        ) : formView === 'qualification' && jobFormRow ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <QualificationForm
              jobForm={jobFormRow}
              mobile={mobile}
              employeeId={employeeId}
              correction={correctionConfigForStep('qualification')}
              onPrevious={() => {
                setFormView(previousVisibleStep('qualification'));
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onSaveSuccess={(form) => {
                setJobFormRow(form);
                setFormView(nextVisibleStep('qualification'));
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          </div>
        ) : formView === 'personal' && jobFormRow ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <FormStepper currentStep={1} />
            <PersonalDetailsForm
              jobForm={jobFormRow}
              mobile={mobile}
              employeeId={employeeId}
              correction={correctionConfigForStep('personal')}
              onSaveSuccess={(form) => {
                setJobFormRow(form);
                setFormView(nextVisibleStep('personal'));
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="mb-8 text-center">
              <p className="mb-4 text-sm font-semibold text-indigo-600">Onboarding Portal</p>
              <h2 className="mb-2 text-3xl font-semibold text-slate-900">Welcome to Our Job Portal</h2>
              <p className="text-slate-600">
                {prefillLoading
                  ? 'Validating your secure onboarding link...'
                  : !mobileVerified
                  ? 'Please enter your mobile number to begin your application'
                  : aadhaarComplete
                    ? 'Your Aadhaar has been verified. Review your details below.'
                    : aadhaarResumeFlow
                      ? 'Aadhaar already verified. Confirm with OTP to continue.'
                      : 'Verify your Aadhaar to continue your application'}
              </p>
            </div>

            <div className="mx-auto max-w-xl">
              <div className={mobileVerified ? 'cursor-not-allowed' : undefined}>
                <label
                  htmlFor="onboarding-mobile"
                  className={`mb-2 block text-xl font-medium text-slate-800 ${mobileVerified ? 'cursor-inherit' : ''}`}
                >
                  Mobile Number <span className="text-rose-500">*</span>
                </label>
                <input
                  id="onboarding-mobile"
                  type="text"
                  value={mobile}
                  onChange={(e) => {
                    if (employeeSpecificLink || mobileVerified || prefillLoading) return;
                    setMobile(normalizeMobile(e.target.value));
                  }}
                  inputMode="numeric"
                  maxLength={10}
                  readOnly={employeeSpecificLink || mobileVerified || prefillLoading}
                  className={`w-full rounded-xl border px-5 py-4 text-2xl text-slate-900 ${
                    employeeSpecificLink || mobileVerified || prefillLoading
                      ? 'cursor-not-allowed select-none border-slate-200 bg-sky-50'
                      : 'border-slate-300 bg-white'
                  }`}
                  placeholder={employeeSpecificLink ? 'Registered mobile number' : 'Enter 10-digit mobile number'}
                />

                {!mobileVerified && !employeeSpecificLink && !prefillLoading && (
                  <button
                    type="button"
                    onClick={handleMobileContinue}
                    disabled={!hasValidMobile || mobileSubmitting}
                    className="mt-5 w-full rounded-xl bg-indigo-600 py-4 text-xl font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {mobileSubmitting ? 'Checking...' : 'Continue'}
                  </button>
                )}

                {mobileVerified && (
                  <div className="mt-4 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-900">
                    <IconCheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                    <p className="text-sm font-medium">
                      Mobile number verified: <span className="tabular-nums">{mobile}</span>
                    </p>
                  </div>
                )}

                {!employeeSpecificLink && !mobileVerified && mobile.length > 0 && !hasValidMobile && (
                  <p className="mt-3 text-sm text-rose-600">Please enter a valid 10-digit mobile number.</p>
                )}
                {mobileError && <p className="mt-3 text-sm text-rose-600">{mobileError}</p>}
              </div>

              {!mobileVerified && !employeeSpecificLink && !prefillLoading && (
                <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  <span className="font-semibold">Note:</span> Make sure you enter a valid mobile number. This number
                  will be used for all future communications.
                </div>
              )}

              {mobileVerified && !aadhaarComplete && (
                <>
                  <hr className="my-10 border-slate-200" />

                  <div className="mb-4 flex items-center gap-2 text-slate-900">
                    <IconShield className="h-7 w-7 text-indigo-600" />
                    <h3 className="text-lg font-semibold">Aadhaar Verification</h3>
                  </div>

                  {aadhaarResumeFlow && (aadhaarPhase === 'resume_input' || aadhaarPhase === 'resume_otp') && (
                    <>
                      <div className="cursor-not-allowed">
                        <label
                          htmlFor="onboarding-aadhaar-resume"
                          className="mb-2 block cursor-inherit text-xl font-medium text-slate-800"
                        >
                          Aadhaar Number
                        </label>
                        <input
                          id="onboarding-aadhaar-resume"
                          type="text"
                          value={aadhaar}
                          readOnly
                          className="w-full cursor-not-allowed select-none rounded-xl border border-slate-200 bg-sky-50 px-5 py-4 text-2xl tabular-nums tracking-widest text-slate-900"
                        />
                        <div className="mt-4 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-900">
                          <IconCheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                          <p className="text-sm font-medium">Aadhaar already verified</p>
                        </div>
                      </div>

                      <div className="mt-8 rounded-xl border border-indigo-100 bg-indigo-50 p-5">
                        {aadhaarPhase === 'resume_input' ? (
                          <>
                            <p className="mb-4 text-sm text-indigo-900">
                              To continue, we will send a one-time password to your registered mobile{' '}
                              <span className="font-semibold tabular-nums">{mobile}</span>.
                            </p>
                            <button
                              type="button"
                              onClick={handleSendAadhaarResumeOtp}
                              disabled={aadhaarSubmitting}
                              className="w-full rounded-xl bg-indigo-600 py-3.5 text-base font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:px-10"
                            >
                              {aadhaarSubmitting ? 'Sending OTP...' : 'Send OTP'}
                            </button>
                          </>
                        ) : (
                          <>
                            <p className="mb-4 text-sm text-indigo-900">
                              OTP sent to your mobile{' '}
                              <span className="font-semibold tabular-nums">{mobile}</span>. Enter it below.
                            </p>
                            <label htmlFor="onboarding-resume-otp" className="mb-2 block text-sm font-medium text-slate-800">
                              Enter OTP <span className="text-rose-500">*</span>
                            </label>
                            <input
                              id="onboarding-resume-otp"
                              type="text"
                              value={otp}
                              onChange={(e) => setOtp(normalizeOtp(e.target.value))}
                              inputMode="numeric"
                              maxLength={6}
                              className="mb-4 w-full max-w-xs rounded-lg border border-slate-300 bg-white px-4 py-3 text-center text-xl tracking-[0.3em] text-slate-900 tabular-nums"
                              placeholder="6-digit OTP"
                              autoComplete="one-time-code"
                            />
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                              <button
                                type="button"
                                onClick={handleVerifyOtp}
                                disabled={!hasValidOtp || otpVerifying}
                                className="rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {otpVerifying ? 'Verifying...' : 'Verify OTP'}
                              </button>
                              <button
                                type="button"
                                onClick={handleSendAadhaarResumeOtp}
                                disabled={aadhaarSubmitting}
                                className="inline-flex items-center justify-center rounded-lg border border-indigo-400 bg-white px-6 py-2.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {aadhaarSubmitting ? 'Resending...' : 'Resend OTP'}
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </>
                  )}

                  {!aadhaarResumeFlow && aadhaarPhase === 'input' && (
                    <>
                      <p className="mb-4 text-sm text-slate-600">
                        Enter the 12-digit Aadhaar number linked to your mobile{' '}
                        <span className="tabular-nums">{mobile}</span>. We will send an OTP to your Aadhaar-registered
                        mobile number.
                      </p>
                      <label htmlFor="onboarding-aadhaar" className="mb-2 block text-sm font-medium text-slate-800">
                        Aadhaar Number <span className="text-rose-500">*</span>
                      </label>
                      <input
                        id="onboarding-aadhaar"
                        type="text"
                        value={aadhaar}
                        onChange={(e) => setAadhaar(normalizeAadhaar(e.target.value))}
                        inputMode="numeric"
                        maxLength={12}
                        className="w-full rounded-lg border border-slate-300 px-4 py-3 text-lg tracking-widest text-slate-900 tabular-nums"
                        placeholder="12-digit Aadhaar"
                        autoComplete="off"
                      />
                      <button
                        type="button"
                        onClick={handleSendAadhaarOtp}
                        disabled={!hasValidAadhaar || aadhaarSubmitting}
                        className="mt-5 w-full rounded-xl bg-indigo-600 py-3.5 text-base font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:px-8"
                      >
                        {aadhaarSubmitting ? 'Sending...' : 'Send OTP'}
                      </button>
                    </>
                  )}

                  {!aadhaarResumeFlow && aadhaarPhase === 'otp' && (
                    <>
                      <div className="mb-5 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
                        OTP sent to your Aadhaar-registered mobile number.
                      </div>

                      <label htmlFor="onboarding-aadhaar-otp" className="mb-2 block text-sm font-medium text-slate-800">
                        Enter OTP <span className="text-rose-500">*</span>
                      </label>
                      <input
                        id="onboarding-aadhaar-otp"
                        type="text"
                        value={otp}
                        onChange={(e) => setOtp(normalizeOtp(e.target.value))}
                        inputMode="numeric"
                        maxLength={6}
                        className="mb-6 w-full max-w-xs rounded-lg border border-slate-300 px-4 py-3 text-center text-xl tracking-[0.3em] text-slate-900 tabular-nums"
                        placeholder="6-digit OTP"
                        autoComplete="one-time-code"
                      />

                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                        <button
                          type="button"
                          onClick={handleVerifyOtp}
                          disabled={!hasValidOtp || otpVerifying}
                          className="rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {otpVerifying ? 'Verifying...' : 'Verify OTP'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setAadhaarPhase('input');
                            setOtp('');
                            setAadhaarError('');
                          }}
                          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-indigo-600 bg-white px-6 py-2.5 text-sm font-semibold text-indigo-600 hover:bg-indigo-50"
                        >
                          <IconArrowLeft className="h-4 w-4" />
                          Change Number
                        </button>
                      </div>
                    </>
                  )}

                  {aadhaarError && <p className="mt-4 text-sm text-rose-600">{aadhaarError}</p>}
                </>
              )}

              {aadhaarComplete && aadhaarKyc && (
                <>
                  <hr className="my-10 border-slate-200" />
                  <div>
                    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-slate-900">
                        <IconShield className="h-7 w-7 text-indigo-600" />
                        <h3 className="text-lg font-semibold">Aadhaar Verification</h3>
                      </div>
                      <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-800">
                        Verified
                      </span>
                    </div>

                    <div className="mb-6 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-900">
                      <IconCheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                      <p className="text-sm font-semibold">Aadhaar Verified Successfully</p>
                    </div>

                    <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
                      <div className="shrink-0 sm:pt-0.5">
                        <img
                          src={aadhaarKyc.aad_profile_photo}
                          alt="Aadhaar profile photo"
                          className="h-32 w-32 rounded-xl border border-slate-200 object-cover shadow-sm"
                          width={128}
                          height={128}
                        />
                      </div>
                      <dl className="min-w-0 flex-1 space-y-4 text-sm">
                        <div>
                          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Name</dt>
                          <dd className="mt-0.5 text-base font-medium text-slate-900">{aadhaarKyc.aad_name}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Father / Guardian</dt>
                          <dd className="mt-0.5 text-slate-800">{aadhaarKyc.aad_care_of}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Date of birth</dt>
                          <dd className="mt-0.5 font-medium tabular-nums text-slate-900">
                            {formatAadDob(aadhaarKyc.aad_dob)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Gender</dt>
                          <dd className="mt-0.5 text-slate-800">{formatAadGender(aadhaarKyc.aad_gender)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Address</dt>
                          <dd className="mt-0.5 whitespace-pre-line text-slate-800">{aadhaarKyc.aad_address}</dd>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-3">
                          <div>
                            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">State</dt>
                            <dd className="mt-0.5 text-slate-800">{aadhaarKyc.aad_state}</dd>
                          </div>
                          <div>
                            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">District</dt>
                            <dd className="mt-0.5 text-slate-800">{aadhaarKyc.aad_district}</dd>
                          </div>
                          <div>
                            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Pincode</dt>
                            <dd className="mt-0.5 font-medium tabular-nums text-slate-800">{aadhaarKyc.aad_pincode}</dd>
                          </div>
                        </div>
                      </dl>
                    </div>

                    <p className="mb-2 mt-6 text-xs text-slate-500">
                      Aadhaar KYC details are fetched from verification response and stored on your application record.
                    </p>
                    {proceedError && <p className="mt-2 text-sm text-rose-600">{proceedError}</p>}
                    <button
                      type="button"
                      onClick={handleProceedToPersonal}
                      disabled={proceedLoading}
                      className="mt-2 w-full rounded-xl bg-indigo-600 py-4 text-base font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {proceedLoading ? 'Loading...' : (
                        <>
                          Proceed to Personal Details <span aria-hidden>›</span>
                        </>
                      )}
                    </button>
                  </div>
                </>
              )}

              {aadhaarComplete && !aadhaarKyc && (
                <div className="mt-8 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-4 text-emerald-900">
                  <div className="flex items-start gap-2">
                    <IconCheckCircle className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" />
                    <div>
                      <p className="font-semibold">Aadhaar verified</p>
                      <p className="mt-1 text-sm text-emerald-800">
                        Your identity has been confirmed. Refresh the page if details do not appear.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
