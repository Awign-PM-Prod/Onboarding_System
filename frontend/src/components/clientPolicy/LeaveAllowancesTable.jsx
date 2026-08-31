import NumericInput from './NumericInput';

const FIELDS = [
  { key: 'sick_days', label: 'Sick' },
  { key: 'paid_days', label: 'Casual' },
  { key: 'maternity_days', label: 'Maternity' },
  { key: 'paternity_days', label: 'Paternity' },
  { key: 'earned_days', label: 'Earned' }
];

export default function LeaveAllowancesTable({ value, onChange, error }) {
  const rows = value ?? [];

  const updateRow = (index, patch) => {
    const next = rows.map((r, i) => (i === index ? { ...r, ...patch } : r));
    onChange(next);
  };

  const applyRowToAll = (sourceIndex) => {
    const source = rows[sourceIndex];
    if (!source) return;
    const leaveValues = Object.fromEntries(FIELDS.map((f) => [f.key, source[f.key]]));
    onChange(rows.map((r) => ({ ...r, ...leaveValues })));
  };

  if (!rows.length) {
    return (
      <p className="text-sm text-slate-500">
        Add designations above to configure leave allowances per role.
      </p>
    );
  }

  const canApplyToAll = rows.length > 1;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
        <label className="block text-sm font-medium text-slate-700">
          Leave Allowances per Role (annual fallback)
        </label>
        {canApplyToAll && (
          <p className="text-xs text-slate-500">
            Fill the first role, then click Apply to all to copy those values to every role.
          </p>
        )}
      </div>
      <div className="overflow-x-auto border border-slate-200 rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Role</th>
              {FIELDS.map((f) => (
                <th key={f.key} className="px-2 py-2 font-medium text-center align-middle">
                  {f.label}
                </th>
              ))}
              {canApplyToAll && (
                <th className="px-2 py-2 font-medium text-right align-middle">
                  <span className="sr-only">Actions</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.designation} className="border-t border-slate-100">
                <td className="px-3 py-2 font-medium text-slate-800 align-middle">{row.designation}</td>
                {FIELDS.map((f) => (
                  <td key={f.key} className="px-2 py-1.5 text-center align-middle">
                    <div className="flex justify-center">
                      <NumericInput
                        min={0}
                        integer
                        blurDefault={0}
                        value={row[f.key]}
                        onChange={(v) => updateRow(i, { [f.key]: v })}
                        className="input !w-16 shrink-0 text-center px-2 py-1.5"
                      />
                    </div>
                  </td>
                ))}
                {canApplyToAll && (
                  <td className="px-2 py-1.5 text-right align-middle whitespace-nowrap">
                    {i === 0 ? (
                      <button
                        type="button"
                        onClick={() => applyRowToAll(0)}
                        className="text-xs font-medium text-indigo-600 hover:text-indigo-800 hover:underline"
                        title={`Copy ${row.designation} leave values to all roles`}
                      >
                        Apply to all
                      </button>
                    ) : null}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}
