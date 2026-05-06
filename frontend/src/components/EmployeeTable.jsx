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
  showPayrollReturnedActions = false,
  onSendBackToPayrollLead = null,
  showJoiningStatus = false,
  joiningStatusCellRenderer = null,
  showStatusColumn = true
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

  const allSelected = selectable && rows.length > 0 && rows.every(r => selectedIds.has(r.id));

  if (rows.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-10 text-center text-sm text-slate-500">
        No employees in this category.
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            {selectable && (
              <th className="px-3 py-2 text-left w-8">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={e => onToggleAll(e.target.checked)}
                  aria-label="Select all"
                />
              </th>
            )}
            <th className="text-left px-4 py-2 font-medium">Name</th>
            <th className="text-left px-4 py-2 font-medium">Mobile</th>
            <th className="text-left px-4 py-2 font-medium">Email</th>
            {showJobColumns && <th className="text-left px-4 py-2 font-medium">Designation</th>}
            {showJobColumns && <th className="text-left px-4 py-2 font-medium">DOJ</th>}
            {showJobColumns && <th className="text-left px-4 py-2 font-medium">CTC</th>}
            {showStatusColumn && <th className="text-left px-4 py-2 font-medium">Status</th>}
            {showJoiningStatus && <th className="text-left px-4 py-2 font-medium">Joining Status</th>}
            {showFormLink && <th className="text-left px-4 py-2 font-medium">Form Link</th>}
            {showViewResponse && <th className="w-14 px-3 py-2 text-center font-medium">View</th>}
            {showPayrollReturnedActions && (
              <th className="text-left px-4 py-2 font-medium">Payroll Lead note</th>
            )}
            {showPayrollReturnedActions && <th className="text-left px-4 py-2 font-medium">Action</th>}
            {actionLabel && <th className="text-left px-4 py-2 font-medium">Action</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map(r => {
            const checked = selectedIds.has(r.id);
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
                {showJobColumns && <td className="px-4 py-3 text-slate-700">{r.designation || '-'}</td>}
                {showJobColumns && <td className="px-4 py-3 text-slate-700">{r.date_of_joining || '-'}</td>}
                {showJobColumns && <td className="px-4 py-3 text-slate-700">{formatCtc(r.ctc_type, r.ctc_value)}</td>}
                {showStatusColumn && (
                  <td className="px-4 py-3">
                    <span className={`text-xs rounded px-2 py-0.5 ${
                      r.onboarding_initiated
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-amber-50 text-amber-700'
                    }`}>
                      {r.onboarding_status}
                    </span>
                  </td>
                )}
                {showJoiningStatus && (
                  <td className="px-4 py-3 text-slate-700">
                    {joiningStatusCellRenderer ? joiningStatusCellRenderer(r, joiningStatusLabel) : joiningStatusLabel(r)}
                  </td>
                )}
                {showFormLink && (
                  <td className="px-4 py-3">
                    {formLinkForRow ? (
                      <a
                        href={formLinkForRow(r)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-indigo-600 hover:text-indigo-800 underline underline-offset-2 break-all"
                      >
                        Open form
                      </a>
                    ) : '-'}
                  </td>
                )}
                {showViewResponse && (
                  <td className="px-2 py-3 text-center">
                    <button
                      type="button"
                      onClick={() => onViewResponse?.(r)}
                      className="inline-flex rounded-lg p-2 text-slate-600 hover:bg-indigo-50 hover:text-indigo-700"
                      title="View application response"
                      aria-label={`View application response for ${r.name}`}
                    >
                      <IconEye className="h-5 w-5" />
                    </button>
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
                      className="px-2.5 py-1 text-xs rounded border border-slate-300 text-slate-700 hover:bg-slate-50"
                    >
                      {actionLabel}
                    </button>
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
