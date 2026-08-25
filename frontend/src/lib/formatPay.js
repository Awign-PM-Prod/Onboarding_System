export function formatPayAmount(payType, period, value) {
  if (value === null || value === undefined || value === '') return '-';
  const v = Number(value ?? 0);
  if (!Number.isFinite(v)) return '-';
  const formatted = new Intl.NumberFormat('en-IN').format(v);
  const kind = String(payType ?? '').toUpperCase();
  if (kind === 'NET_PAY') return `${formatted} (Net Pay)`;
  if (!period) return kind === 'CTC' ? `${formatted} (CTC)` : formatted;
  const periodLabel = period === 'ANNUAL' ? '/ yr' : '/ mo';
  return kind === 'CTC' ? `${formatted} ${periodLabel} (CTC)` : `${formatted} ${periodLabel}`;
}

export function isPmApprovedEmployee(row) {
  return String(row?.form_review_status ?? '').trim().toUpperCase() === 'APPROVED';
}

export function hasEmployeePayFields(row) {
  const payType = String(row?.pay_type ?? '').trim().toUpperCase();
  if (!['CTC', 'NET_PAY'].includes(payType)) return false;
  if (row?.ctc_value == null || String(row.ctc_value).trim() === '') return false;
  if (payType === 'CTC' && !['MONTHLY', 'ANNUAL'].includes(String(row.ctc_type ?? '').trim().toUpperCase())) {
    return false;
  }
  return true;
}

export function salaryActionForEmployee(row, { allowDirectAfterPmApproval = false } = {}) {
  if (!hasEmployeePayFields(row)) return null;
  if (allowDirectAfterPmApproval) {
    return { mode: 'direct', label: 'Edit salary' };
  }
  if (row.salary_change_request_pending) {
    return { mode: 'pending', label: 'Cancel request' };
  }
  if (isPmApprovedEmployee(row)) {
    return { mode: 'request', label: 'Request salary change' };
  }
  return { mode: 'direct', label: 'Edit salary' };
}
