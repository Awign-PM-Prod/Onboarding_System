import NumericInput from './NumericInput';
import { displayNumericValue } from '../../lib/numericInput';

export default function PayrollCycleInput({ value, onChange, error }) {
  const start = value?.payroll_cycle_start_day ?? 25;
  const end = value?.payroll_cycle_end_day ?? 24;

  const setDay = (key, next) => {
    onChange({ ...value, [key]: next });
  };

  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">Payroll Cycle</label>
      <div className="flex items-center gap-2 text-sm">
        <NumericInput
          min={1}
          max={31}
          integer
          blurDefault={25}
          value={value?.payroll_cycle_start_day ?? 25}
          onChange={(v) => setDay('payroll_cycle_start_day', v)}
        />
        <span className="text-slate-500">to</span>
        <NumericInput
          min={1}
          max={31}
          integer
          blurDefault={24}
          value={value?.payroll_cycle_end_day ?? 24}
          onChange={(v) => setDay('payroll_cycle_end_day', v)}
        />
        <span className="text-slate-500">of every month</span>
      </div>
      <p className="text-xs text-slate-500 mt-1">
        {displayNumericValue(start) === '' ? '—' : start}th to {displayNumericValue(end) === '' ? '—' : end}th of every month
      </p>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}
