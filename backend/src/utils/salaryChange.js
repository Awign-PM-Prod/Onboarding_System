import { supabaseAdmin } from '../supabase.js';

export const SALARY_CHANGE_BUCKET = 'salary-change-documents';
export const SALARY_CHANGE_MAX_BYTES = 5 * 1024 * 1024;
export const SALARY_CHANGE_SIGNED_URL_SECONDS = 10 * 60;

const ALLOWED_MIME = new Map([
  ['application/pdf', 'pdf'],
  ['application/msword', 'doc'],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx'],
  ['image/jpeg', 'jpg'],
  ['image/png', 'png']
]);

const EXT_TO_MIME = new Map([
  ['.pdf', 'application/pdf'],
  ['.doc', 'application/msword'],
  ['.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png']
]);

export function validateSalaryFields(raw) {
  const errors = [];
  const payType = String(raw.pay_type ?? '').trim().toUpperCase();
  const ctcTypeRaw = String(raw.ctc_type ?? '').trim().toUpperCase();
  const ctcValueRaw = raw.ctc_value;

  if (!['CTC', 'NET_PAY'].includes(payType)) errors.push('pay_type must be CTC or NET_PAY');

  let ctcType = null;
  if (payType === 'CTC') {
    ctcType = ctcTypeRaw;
    if (!['MONTHLY', 'ANNUAL'].includes(ctcType)) {
      errors.push('ctc_type must be MONTHLY or ANNUAL for CTC');
    }
  }

  const ctcValue = Number(ctcValueRaw);
  if (!Number.isFinite(ctcValue) || ctcValue < 0) errors.push('ctc_value must be a non-negative number');

  if (errors.length) return { errors };
  return {
    salaryFields: {
      pay_type: payType,
      ctc_type: ctcType,
      ctc_value: ctcValue
    }
  };
}

export function hasExistingPayFields(row) {
  const payType = String(row?.pay_type ?? '').trim().toUpperCase();
  if (!['CTC', 'NET_PAY'].includes(payType)) return false;
  if (row?.ctc_value == null || String(row.ctc_value).trim() === '') return false;
  if (payType === 'CTC' && !['MONTHLY', 'ANNUAL'].includes(String(row.ctc_type ?? '').trim().toUpperCase())) {
    return false;
  }
  return true;
}

export function salaryFieldsChanged(current, next) {
  const curPay = String(current?.pay_type ?? '').trim().toUpperCase();
  const nextPay = String(next?.pay_type ?? '').trim().toUpperCase();
  const curType = String(current?.ctc_type ?? '').trim().toUpperCase() || '';
  const nextType = String(next?.ctc_type ?? '').trim().toUpperCase() || '';
  const curVal = Number(current?.ctc_value);
  const nextVal = Number(next?.ctc_value);
  return curPay !== nextPay || curType !== nextType || curVal !== nextVal;
}

export function describeSalary(payType, ctcType, ctcValue) {
  const kind = String(payType ?? '').trim().toUpperCase();
  const period = String(ctcType ?? '').trim().toUpperCase();
  const value = Number(ctcValue);
  const amount = Number.isFinite(value) ? value : ctcValue;
  if (kind === 'NET_PAY') return `${amount} (Net Pay)`;
  if (kind === 'CTC') {
    const suffix = period === 'ANNUAL' ? '/yr' : '/mo';
    return `${amount} ${suffix} (CTC)`;
  }
  return String(amount ?? '');
}

export function inspectSalaryAttachment(file) {
  if (!file?.buffer) return { error: 'Supporting attachment is required' };
  if (file.size > SALARY_CHANGE_MAX_BYTES) {
    return { error: 'Attachment must be 5 MB or smaller' };
  }

  const originalName = String(file.originalname || 'attachment').trim() || 'attachment';
  const extMatch = originalName.toLowerCase().match(/(\.[a-z0-9]+)$/);
  const ext = extMatch?.[1] || '';
  let mime = String(file.mimetype || '').trim().toLowerCase();
  if (!ALLOWED_MIME.has(mime) && EXT_TO_MIME.has(ext)) {
    mime = EXT_TO_MIME.get(ext);
  }
  if (!ALLOWED_MIME.has(mime)) {
    return { error: 'Attachment must be a PDF, DOC, DOCX, JPG, or PNG file' };
  }

  const safeBase = originalName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'attachment';
  return {
    mime,
    originalName,
    safeName: safeBase
  };
}

export async function fetchJobAppReviewStatus(employeeId) {
  const { data, error } = await supabaseAdmin
    .from('job_app_form')
    .select('review_status')
    .eq('employee_id', employeeId)
    .maybeSingle();
  if (error) throw error;
  return String(data?.review_status ?? '').trim().toUpperCase();
}

export function isPmApprovedReviewStatus(status) {
  return String(status ?? '').trim().toUpperCase() === 'APPROVED';
}

export async function cancelPendingSalaryChangeRequests(employeeId, { reviewedBy = null, reviewNote = 'Canceled' } = {}) {
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from('employee_salary_change_requests')
    .update({
      status: 'CANCELED',
      reviewed_by: reviewedBy,
      reviewed_at: now,
      review_note: reviewNote,
      updated_at: now
    })
    .eq('employee_id', employeeId)
    .eq('status', 'PENDING');
  if (error) throw error;
}

export function emptySalaryChangeFlags() {
  return {
    salary_change_request_pending: false,
    salary_change_request_id: null,
    salary_change_request_reason: null,
    salary_change_to_pay_type: null,
    salary_change_to_ctc_type: null,
    salary_change_to_ctc_value: null,
    salary_change_requested_at: null
  };
}
