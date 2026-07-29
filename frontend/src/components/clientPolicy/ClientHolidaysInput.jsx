const HOLIDAY_TYPES = [
  { value: 'NH', label: 'NH — National Holiday' },
  { value: 'FH', label: 'FH — Festival Holiday' }
];

function normalizeHolidayType(type) {
  return type === 'FH' ? 'FH' : 'NH';
}

export default function ClientHolidaysInput({ value, onChange }) {
  const holidays = value ?? [];

  const addRow = () => {
    onChange([
      ...holidays,
      { holiday_date: '', holiday_type: 'NH' }
    ]);
  };

  const updateRow = (index, patch) => {
    onChange(
      holidays.map((h, i) => {
        if (i !== index) return h;
        const next = { ...h, ...patch };
        return { ...next, holiday_type: normalizeHolidayType(next.holiday_type) };
      })
    );
  };

  const removeRow = (index) => {
    onChange(holidays.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-slate-700">
          Client Holidays
        </label>
        <button
          type="button"
          onClick={addRow}
          className="text-xs text-indigo-600 hover:text-indigo-800"
        >
          + Add holiday
        </button>
      </div>
      <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-3 text-sm text-sky-900">
        <p className="font-medium">National and festival holidays</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Choose NH or FH for each date. They set separate quotas and comp-off eligibility.</li>
          <li>NH dates drive NH / P-NH rules; FH dates drive FH / P-FH rules.</li>
        </ul>
      </div>
      {holidays.length === 0 ? (
        <p className="text-xs text-slate-500">
          No holidays configured. NH and FH quotas will be zero until dates are added.
        </p>
      ) : (
        <div className="space-y-2">
          {holidays.map((h, i) => (
            <div key={i} className="flex flex-nowrap items-center gap-2">
              <input
                type="date"
                value={h.holiday_date ?? ''}
                onChange={(e) => updateRow(i, { holiday_date: e.target.value })}
                className="input w-auto shrink-0"
              />
              <select
                value={normalizeHolidayType(h.holiday_type)}
                onChange={(e) => updateRow(i, { holiday_type: e.target.value })}
                className="input w-auto min-w-[12rem] shrink-0"
              >
                {HOLIDAY_TYPES.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => removeRow(i)}
                className="shrink-0 text-xs text-red-600 hover:text-red-800"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
