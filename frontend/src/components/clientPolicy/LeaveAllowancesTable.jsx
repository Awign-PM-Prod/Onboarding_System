import NumericInput from './NumericInput';

const FIELDS = [
  { key: 'sick_days', label: 'Sick' },
  { key: 'paid_days', label: 'Paid' },
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

  if (!rows.length) {
    return (
      <p className="text-sm text-slate-500">
        Add designations above to configure leave allowances per role.
      </p>
    );
  }

  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-2">
        Leave Allowances per Role (annual)
      </label>
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}
