import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';

const TEN_DIGIT_REGEX = /^\d{10}$/;
const SIX_DIGIT_REGEX = /^\d{6}$/;
const HIDDEN_FIELDS = new Set(['id', 'employee_id', 'client_id', 'created_at', 'updated_at']);
const ORDERED_FIELDS = [
  'name',
  'mobile',
  'email',
  'aadhaar_number',
  'aad_profile_photo',
  'aad_name',
  'aad_care_of',
  'aad_dob',
  'aad_gender',
  'aad_address',
  'aad_state',
  'aad_district',
  'aad_pincode',
  'pd_emergency_contact_name',
  'pd_emergency_contact_relation',
  'pd_alternate_number',
  'pd_current_address_same_as_aadhaar',
  'pd_current_address',
  'pd_marital_status',
  'pd_driving_license',
  'pd_driving_license_url',
  'pd_city',
  'pd_age',
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
  'bp_police_verification_url',
];

function normalizeMobile(raw) {
  return String(raw ?? '').replace(/\D/g, '').slice(-10);
}

function normalizeOtp(raw) {
  return String(raw ?? '').replace(/\D/g, '').slice(0, 6);
}

function prettifyKey(key) {
  if (key === 'pd_emergency_contact_name') return 'Emergency Contact Name';
  if (key === 'pd_emergency_contact_relation') return 'Emergency Contact Relation';
  if (key === 'pd_alternate_number') return 'Emergency Contact Number';
  if (key === 'pd_current_address_same_as_aadhaar') return 'Same As Aadhaar Address';
  if (key === 'pd_current_address') return 'Current Address';
  return String(key).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDisplayValue(key, val) {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'string' && val.trim() === '') return '—';
  if (Array.isArray(val)) {
    const urls = val.filter((x) => typeof x === 'string' && x.trim());
    if (urls.length === 0) return '—';
    return (
      <ul className="list-inside list-disc space-y-1 text-indigo-700">
        {urls.map((u, i) => (
          <li key={`${u}-${i}`}>
            <a
              href={u}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 underline underline-offset-2 hover:text-indigo-800"
            >
              View Document
            </a>
          </li>
        ))}
      </ul>
    );
  }
  if (typeof val === 'boolean') return val ? 'Yes' : 'No';
  const s = String(val);
  if (/_url$/i.test(key) && /^https?:\/\//i.test(s)) {
    return (
      <a
        href={s}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-indigo-600 underline underline-offset-2 hover:text-indigo-800"
      >
        View Document
      </a>
    );
  }
  return s;
}

function firstCorrectionStep(form) {
  const rejected = Array.isArray(form?.editable_fields) ? form.editable_fields : [];
  const first = String(rejected[0] ?? '');
  if (first.startsWith('qual_')) return 'qualification';
  if (first.startsWith('kyc_')) return 'kyc';
  if (first.startsWith('bp_')) return 'photo';
  return 'personal';
}

function statusBadge(form) {
  const review = String(form?.review_status ?? '').trim();
  const payroll = String(form?.payroll_review_status ?? '').trim();

  if (review === 'REJECTED') {
    return { text: 'Rejected', cls: 'bg-rose-100 text-rose-800 border-rose-200' };
  }
  if (review === 'CORRECTION_REQUESTED') {
    return { text: 'Correction Requested', cls: 'bg-amber-100 text-amber-800 border-amber-200' };
  }

  if (review === 'APPROVED') {
    if (payroll === 'PAYROLL_REJECTED') {
      return {
        text: 'Rejected',
        cls: 'bg-rose-100 text-rose-800 border-rose-200',
      };
    }
    if (payroll === 'PAYROLL_APPROVED') {
      return { text: 'Approved', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
    }
    // PM approved — awaiting Payroll Lead (includes PENDING_PAYROLL_LEAD and legacy null)
    if (payroll === 'PENDING_PAYROLL_LEAD' || payroll === '') {
      return {
        text: 'Under review by Payroll Lead',
        cls: 'bg-sky-100 text-sky-900 border-sky-200',
      };
    }
    return { text: 'Approved', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
  }

  if (String(form?.submission_status ?? '').trim() === 'Submitted') {
    return { text: 'Submitted - Under Review', cls: 'bg-sky-100 text-sky-800 border-sky-200' };
  }
  return { text: 'In Progress', cls: 'bg-slate-100 text-slate-700 border-slate-200' };
}

function sectionNameForField(key) {
  if (key === 'bp_passport_photo_url') return 'Photo';
  if (key === 'bp_esic_number' || key === 'bp_pf_uan_number') return 'Employment History';
  if (key === 'bp_police_verification_url') return 'Security Check';
  if (key === 'name' || key === 'mobile' || key === 'email' || key === 'aadhaar_number' || key.startsWith('aad_')) {
    return 'Basic Information';
  }
  if (key.startsWith('pd_')) return 'Personal Info';
  if (key.startsWith('qual_')) return 'Qualification';
  if (key.startsWith('kyc_')) return 'KYC Documents';
  if (key.startsWith('bp_')) return 'Bank & Photo';
  return null;
}

function sortedFormKeys(form) {
  if (!form || typeof form !== 'object') return [];
  const known = ORDERED_FIELDS.filter((k) => !HIDDEN_FIELDS.has(k));
  const extra = Object.keys(form).filter((k) => !HIDDEN_FIELDS.has(k) && !known.includes(k));
  return [...known, ...extra];
}

export default function OnboardingStatusPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const employeeId = searchParams.get('employee_id') || '';
  const [mobile, setMobile] = useState(() => normalizeMobile(searchParams.get('mobile') || ''));
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [sessionToken, setSessionToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [statusData, setStatusData] = useState(null);

  const form = statusData?.form ?? null;
  const latestReview = statusData?.latest_review ?? null;
  const payrollLatestReview = statusData?.payroll_latest_review ?? null;
  const badge = statusBadge(form);
  const keys = useMemo(() => sortedFormKeys(form), [form]);
  const grouped = useMemo(() => {
    const groups = [];
    let lastSection = null;
    for (const key of keys) {
      const section = sectionNameForField(key);
      if (!section) continue;
      if (section !== lastSection) {
        groups.push({ title: section, keys: [key] });
        lastSection = section;
      } else {
        groups[groups.length - 1].keys.push(key);
      }
    }
    return groups;
  }, [keys]);
  const groupedRejectedFields = useMemo(() => {
    if (!latestReview || String(latestReview.decision_status ?? '').trim() !== 'CORRECTION_REQUESTED') {
      return [];
    }
    const rejected = Array.isArray(latestReview.rejected_fields) ? latestReview.rejected_fields : [];
    const groups = [];
    const indexByTitle = new Map();
    for (const rawField of rejected) {
      const key = String(rawField ?? '').trim();
      if (!key) continue;
      const title = sectionNameForField(key) || 'Other';
      if (!indexByTitle.has(title)) {
        indexByTitle.set(title, groups.length);
        groups.push({ title, keys: [key] });
      } else {
        groups[indexByTitle.get(title)].keys.push(key);
      }
    }
    return groups;
  }, [latestReview]);

  const sendOtp = async () => {
    if (!TEN_DIGIT_REGEX.test(mobile) || loading) return;
    setLoading(true);
    setError('');
    try {
      await api.sendOnboardingStatusOtp({ mobile, employeeId });
      setOtpSent(true);
      setOtp('');
    } catch (err) {
      setError(err.message || 'Could not send OTP.');
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    if (!SIX_DIGIT_REGEX.test(otp) || loading) return;
    setLoading(true);
    setError('');
    try {
      const verify = await api.verifyOnboardingStatusOtp({ mobile, employeeId, otp });
      const token = verify.session_token;
      setSessionToken(token);
      const data = await api.getOnboardingStatus({ mobile, employeeId, sessionToken: token });
      setStatusData(data);
    } catch (err) {
      setError(err.message || 'Could not verify OTP.');
    } finally {
      setLoading(false);
    }
  };

  const refreshStatus = async () => {
    if (!sessionToken) return;
    setLoading(true);
    setError('');
    try {
      const data = await api.getOnboardingStatus({ mobile, employeeId, sessionToken });
      setStatusData(data);
    } catch (err) {
      setError(err.message || 'Could not refresh status.');
    } finally {
      setLoading(false);
    }
  };

  const showResubmitCta =
    String(form?.review_status ?? '').trim() === 'CORRECTION_REQUESTED' &&
    Number(form?.submission_attempt_count ?? 1) < 3;

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-5">
          <h1 className="text-2xl font-semibold text-slate-900">Application Status</h1>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-8">
        {!form && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <h2 className="mb-2 text-xl font-semibold text-slate-900">Login with Mobile OTP</h2>
            <p className="mb-6 text-sm text-slate-600">Use the same mobile number used for onboarding.</p>
            <label className="mb-2 block text-sm font-medium text-slate-800">Mobile Number</label>
            <input
              type="text"
              value={mobile}
              onChange={(e) => setMobile(normalizeMobile(e.target.value))}
              maxLength={10}
              inputMode="numeric"
              className="w-full rounded-lg border border-slate-300 px-4 py-3 text-slate-900"
              placeholder="10-digit mobile number"
            />
            {!otpSent && (
              <button
                type="button"
                onClick={sendOtp}
                disabled={!TEN_DIGIT_REGEX.test(mobile) || loading}
                className="mt-4 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? 'Sending...' : 'Send OTP'}
              </button>
            )}
            {otpSent && (
              <>
                <label className="mb-2 mt-6 block text-sm font-medium text-slate-800">OTP</label>
                <input
                  type="text"
                  value={otp}
                  onChange={(e) => setOtp(normalizeOtp(e.target.value))}
                  maxLength={6}
                  inputMode="numeric"
                  className="w-full max-w-xs rounded-lg border border-slate-300 px-4 py-3 text-slate-900"
                  placeholder="6-digit OTP"
                />
                <p className="mt-2 text-xs text-slate-500">Demo OTP is configured by backend.</p>
                <button
                  type="button"
                  onClick={verifyOtp}
                  disabled={!SIX_DIGIT_REGEX.test(otp) || loading}
                  className="mt-4 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? 'Verifying...' : 'Verify & View Status'}
                </button>
              </>
            )}
            {error && <p className="mt-4 text-sm text-rose-600">{error}</p>}
          </div>
        )}

        {form && (
          <div className="space-y-5">
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xl font-semibold text-slate-900">{form.name || 'Employee'}</h2>
                <span className={`rounded-full border px-3 py-1 text-sm font-semibold ${badge.cls}`}>{badge.text}</span>
              </div>
              <p className="mt-2 text-sm text-slate-600">Mobile: {form.mobile}</p>
              <p className="mt-1 text-sm text-slate-600">Submission Attempt: {form.submission_attempt_count ?? 1}</p>
              <button
                type="button"
                onClick={refreshStatus}
                disabled={loading}
                className="mt-4 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
              >
                Refresh Status
              </button>
            </section>

            {payrollLatestReview && String(form?.review_status ?? '').trim() === 'APPROVED' && (
              <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-slate-900">Latest Payroll Lead response</h3>
                <div className="mt-3 space-y-2 text-sm text-slate-800">
                  <p>
                    <span className="font-medium">Decision:</span> {payrollLatestReview.decision_status}
                  </p>
                  <p>
                    <span className="font-medium">Reason:</span> {payrollLatestReview.decision_reason || '—'}
                  </p>
                </div>
              </section>
            )}

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-900">Latest PM Response</h3>
              {!latestReview && <p className="mt-2 text-sm text-slate-600">No review yet. Your form is under process.</p>}
              {latestReview && (
                <div className="mt-3 space-y-2 text-sm text-slate-800">
                  <p>
                    <span className="font-medium">Decision:</span> {latestReview.decision_status}
                  </p>
                  <p>
                    <span className="font-medium">Reason:</span> {latestReview.decision_reason || '—'}
                  </p>
                </div>
              )}
              {String(latestReview?.decision_status ?? '').trim() === 'CORRECTION_REQUESTED' &&
                groupedRejectedFields.length > 0 && (
                  <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/70 p-4">
                    <h4 className="text-sm font-semibold text-amber-900">Please fix these fields</h4>
                    <div className="mt-3 space-y-3">
                      {groupedRejectedFields.map((group) => (
                        <div key={group.title}>
                          <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">{group.title}</p>
                          <ul className="mt-1 list-inside list-disc space-y-1 text-sm text-amber-900">
                            {group.keys.map((fieldKey) => (
                              <li key={fieldKey}>{prettifyKey(fieldKey)}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              {showResubmitCta && (
                <button
                  type="button"
                  onClick={() => {
                    const step = firstCorrectionStep(form);
                    const q = new URLSearchParams();
                    if (employeeId) q.set('employee_id', employeeId);
                    q.set('resume', 'true');
                    q.set('step', step);
                    navigate(`/onboardingform?${q.toString()}`);
                  }}
                  className="mt-5 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white"
                >
                  Edit and Resubmit
                </button>
              )}
              {String(form?.review_status ?? '').trim() === 'CORRECTION_REQUESTED' &&
                Number(form?.submission_attempt_count ?? 1) >= 3 && (
                  <p className="mt-5 text-sm text-amber-700">
                    Maximum submission attempts reached. Your application is awaiting final PM decision.
                  </p>
                )}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="mb-3 text-lg font-semibold text-slate-900">Your Submitted Response</h3>
              <div className="space-y-5">
                {grouped.map((group) => (
                  <section key={group.title} className="rounded-xl border border-slate-200 bg-slate-50/60">
                    <div className="border-b border-slate-200 px-4 py-2.5">
                      <h4 className="text-sm font-semibold text-slate-800">{group.title}</h4>
                    </div>
                    <dl className="divide-y divide-slate-100 px-4">
                      {group.keys.map((k) => (
                        <div key={k} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,220px)_1fr] sm:gap-4">
                          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            {prettifyKey(k)}
                          </dt>
                          <dd className="text-sm text-slate-900">{formatDisplayValue(k, form[k])}</dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                ))}
              </div>
            </section>
            {error && <p className="text-sm text-rose-600">{error}</p>}
          </div>
        )}
      </main>
    </div>
  );
}
