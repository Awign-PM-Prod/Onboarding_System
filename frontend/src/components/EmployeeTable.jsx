import {
  employeeStatusBadgeClass,
  resolveEmployeeStatusLabel,
} from '../lib/employeeStatusBadge';

function formatCtc(type, value) {
  if (!type || value === null || value === undefined || value === '') return '-';
  const v = Number(value ?? 0);
  const formatted = new Intl.NumberFormat('en-IN').format(v);
  return type === 'ANNUAL' ? `${formatted} / yr` : `${formatted} / mo`;
}

function IconEye({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

export default function EmployeeTable({
  rows,
  selectedIds,
  onToggle,
  onToggleAll,
  selectable = true,
  showJobColumns = true,
  actionLabel = null,
  onRowAction = null,
  showFormLink = false,
  formLinkForRow = null,
  showViewResponse = false,
  onViewResponse = null,
  reviewColumnLabel = 'View',
  showReviewTextCta = false,
  reviewCtaForSubmittedOnly = false,
  showPayrollReturnedActions = false,
  onSendBackToPayrollLead = null,
  showJoiningStatus = false,
  joiningStatusCellRenderer = null,
  showStatusColumn = true,
  statusColumnLabel = 'Status',
  statusForRow = null,
  showNotAssignedForMissingRoleDetails = false,
  forceNotSentStatusForMissingRoleDetails = false,
  showRespondedForSubmittedForms = false,
  showApprovedForPmApproved = true,
  showPlApprovedForPayrollApproved = true,
  showRequestCorrectionForReview = false,
  showDateColumn = false,
  dateColumnLabel = 'Date',
  dateForRow = null,
  showRemarksColumn = false,
  remarksColumnLabel = 'Remarks',
  remarksForRow = null,
}) {
  const joiningStatusLabel = (row) => {
    const status = String(row.joining_status ?? '').trim().toUpperCase();
    if (!status) return '-';
    if (status === 'JOINED') return 'Joined';
    if (status === 'NOT_JOINED') return 'Not Joined';
    if (status === 'JOINED_ABSCONDED') return 'Joined and absconded';
    if (status === 'JOINED_OTHER_DATE') {
      return row.joining_actual_date
        ? `Joined on other date (${row.joining_actual_date})`
        : 'Joined on other date';
    }
    return status;
  };

  const allSelected = selectable && rows.length > 0 && rows.every((r) => selectedIds.has(r.id));

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
        No employees in this category.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto overflow-y-hidden rounded-lg border border-slate-200 bg-white">
      <table className="min-w-[1200px] w-full text-sm">
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            {selectable && (
              <th className="w-8 px-3 py-2 text-left">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(e) => onToggleAll(e.target.checked)}
                  aria-label="Select all"
                />
              </th>
            )}
            <th className="px-4 py-2 text-left font-medium">Name</th>
            <th className="px-4 py-2 text-left font-medium">Mobile</th>
            <th className="px-4 py-2 text-left font-medium">Email</th>
            {showJobColumns && <th className="px-4 py-2 text-left font-medium">Designation</th>}
            {showJobColumns && <th className="px-4 py-2 text-left font-medium">DOJ</th>}
            {showJobColumns && <th className="px-4 py-2 text-left font-medium">CTC</th>}
            {showStatusColumn && <th className="px-4 py-2 text-left font-medium">{statusColumnLabel}</th>}
            {showDateColumn && (
              <th className="min-w-[180px] whitespace-nowrap px-4 py-2 text-left font-medium">{dateColumnLabel}</th>
            )}
            {showRemarksColumn && <th className="px-4 py-2 text-left font-medium">{remarksColumnLabel}</th>}
            {showFormLink && <th className="px-4 py-2 text-left font-medium">Form Link</th>}
            {showViewResponse && (
              <th className={`px-3 py-2 font-medium ${showReviewTextCta ? 'text-left' : 'w-14 text-center'}`}>
                {reviewColumnLabel}
              </th>
            )}
            {showPayrollReturnedActions && (
              <th className="px-4 py-2 text-left font-medium">Payroll Lead note</th>
            )}
            {showPayrollReturnedActions && <th className="px-4 py-2 text-left font-medium">Action</th>}
            {actionLabel && <th className="px-4 py-2 text-left font-medium">Action</th>}
            {showJoiningStatus && <th className="px-4 py-2 text-left font-medium">Joining Status</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => {
            const checked = selectedIds.has(r.id);
            const missingRoleDetails =
              showNotAssignedForMissingRoleDetails &&
              (!String(r.designation ?? '').trim() ||
                !String(r.date_of_joining ?? '').trim() ||
                !String(r.ctc_type ?? '').trim() ||
                r.ctc_value === null ||
                r.ctc_value === undefined ||
                String(r.ctc_value).trim() === '');

            let statusLabel = resolveEmployeeStatusLabel(r, {
              forceNotSent: forceNotSentStatusForMissingRoleDetails,
              missingRoleDetails,
              showRespondedForSubmittedForms,
              showRequestCorrectionForReview,
              statusForRow,
            });

            // Legacy optional flags — default true so PM/PL approved show everywhere.
            if (!showPlApprovedForPayrollApproved && statusLabel === 'PL APPROVED') {
              statusLabel = isPmApprovedOnlyFallback(r);
            }
            if (!showApprovedForPmApproved && statusLabel === 'PM APPROVED') {
              statusLabel = String(r.onboarding_status ?? '').trim() || '-';
            }

            return (
              <tr key={r.id} className={checked ? 'bg-indigo-50/40' : ''}>
                {selectable && (
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggle(r.id)}
                      aria-label={`Select ${r.name}`}
                    />
                  </td>
                )}
                <td className="px-4 py-3 font-medium text-slate-900">{r.name}</td>
                <td className="px-4 py-3 text-slate-700">{r.mobile}</td>
                <td className="px-4 py-3 text-slate-700">{r.email}</td>
                {showJobColumns && (
                  <td className="px-4 py-3 text-slate-700">
                    {missingRoleDetails ? (
                      <span className="font-medium text-rose-600">Not Assigned</span>
                    ) : (
                      r.designation || '-'
                    )}
                  </td>
                )}
                {showJobColumns && <td className="px-4 py-3 text-slate-700">{r.date_of_joining || '-'}</td>}
                {showJobColumns && (
                  <td className="px-4 py-3 text-slate-700">{formatCtc(r.ctc_type, r.ctc_value)}</td>
                )}
                {showStatusColumn && (
                  <td className="px-4 py-3">
                    <span
                      className={employeeStatusBadgeClass(statusLabel, {
                        onboardingInitiated: r.onboarding_initiated,
                      })}
                    >
                      {statusLabel}
                    </span>
                  </td>
                )}
                {showDateColumn && (
                  <td className="min-w-[180px] whitespace-nowrap px-4 py-3 text-slate-700">
                    {typeof dateForRow === 'function' ? dateForRow(r) : '-'}
                  </td>
                )}
                {showRemarksColumn && (
                  <td className="px-4 py-3 text-slate-700">
                    {typeof remarksForRow === 'function' ? remarksForRow(r) : '-'}
                  </td>
                )}
                {showFormLink && (
                  <td className="px-4 py-3">
                    {formLinkForRow ? (
                      <a
                        href={formLinkForRow(r)}
                        target="_blank"
                        rel="noreferrer"
                        className="break-all text-xs text-indigo-600 underline underline-offset-2 hover:text-indigo-800"
                      >
                        Open form
                      </a>
                    ) : (
                      '-'
                    )}
                  </td>
                )}
                {showViewResponse && (
                  <td className={showReviewTextCta ? 'px-4 py-3 text-left' : 'px-2 py-3 text-center'}>
                    {!reviewCtaForSubmittedOnly ||
                    String(r.form_submission_status ?? '').trim() === 'Submitted' ? (
                      <button
                        type="button"
                        onClick={() => onViewResponse?.(r)}
                        className={
                          showReviewTextCta
                            ? 'inline-flex items-center gap-1.5 text-sm font-medium text-[#1891CD] hover:text-[#1273a5]'
                            : 'inline-flex rounded-lg p-2 text-slate-600 hover:bg-indigo-50 hover:text-indigo-700'
                        }
                        title="View application response"
                        aria-label={`View application response for ${r.name}`}
                      >
                        {showReviewTextCta && <span>Review</span>}
                        <IconEye className="h-5 w-5" />
                      </button>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                )}
                {showPayrollReturnedActions && (
                  <td className="max-w-xs px-4 py-3 text-slate-700">
                    <span className="line-clamp-3 text-xs" title={r.form_payroll_review_reason || ''}>
                      {r.form_payroll_review_reason || '—'}
                    </span>
                  </td>
                )}
                {showPayrollReturnedActions && (
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => onSendBackToPayrollLead?.(r)}
                      className="rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-800 hover:bg-indigo-100"
                    >
                      Send back to Payroll Lead
                    </button>
                  </td>
                )}
                {actionLabel && (
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => onRowAction?.(r)}
                      className="rounded border border-slate-300 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50"
                    >
                      {actionLabel}
                    </button>
                  </td>
                )}
                {showJoiningStatus && (
                  <td className="px-4 py-3 text-slate-700">
                    {joiningStatusCellRenderer
                      ? joiningStatusCellRenderer(r, joiningStatusLabel)
                      : joiningStatusLabel(r)}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function isPmApprovedOnlyFallback(row) {
  if (String(row?.form_review_status ?? '').trim().toUpperCase() === 'APPROVED') {
    return 'PM APPROVED';
  }
  return String(row?.onboarding_status ?? '').trim() || '-';
}
