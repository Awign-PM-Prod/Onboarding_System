export default function ClientHolidaysInput({ value, onChange }) {
  const holidays = value ?? [];

  const addRow = () => {
    onChange([
      ...holidays,
      { holiday_date: '', holiday_type: 'NH' }
    ]);
  };

  const updateRow = (index, patch) => {
    onChange(holidays.map((h, i) => (i === index ? { ...h, ...patch, holiday_type: 'NH' } : h)));
  };

  const removeRow = (index) => {
    onChange(holidays.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-slate-700">
          Client Holidays (NH)
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
        <p className="font-medium">National and floating holidays</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Add national holiday (NH) dates here. They set NH quotas and NH comp-off eligibility.</li>
          <li>Floating holidays (FH) are not configured in policy. PMs can still mark FH and P-FH on attendance sheets.</li>
          <li>Previously saved FH dates were converted to NH.</li>
        </ul>
      </div>
      {holidays.length === 0 ? (
        <p className="text-xs text-slate-500">No holidays configured. NH quotas will be zero until dates are added.</p>
      ) : (
        <div className="space-y-2">
          {holidays.map((h, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={h.holiday_date ?? ''}
                onChange={(e) => updateRow(i, { holiday_date: e.target.value })}
                className="input"
              />
              <span className="text-xs font-medium text-slate-500">NH</span>
              <button
                type="button"
                onClick={() => removeRow(i)}
                className="text-xs text-red-600 hover:text-red-800"
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
