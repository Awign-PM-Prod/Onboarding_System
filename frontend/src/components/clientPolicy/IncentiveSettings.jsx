import NumericInput from './NumericInput';

function YesNo({ value, onChange, name }) {
  return (
    <div className="flex gap-4 text-sm">
      <label className="inline-flex items-center gap-2">
        <input type="radio" name={name} checked={value === true} onChange={() => onChange(true)} />
        Yes
      </label>
      <label className="inline-flex items-center gap-2">
        <input type="radio" name={name} checked={value === false} onChange={() => onChange(false)} />
        No
      </label>
    </div>
  );
}

export default function IncentiveSettings({ value, onChange }) {
  const policy = value ?? {};
  const set = (patch) => onChange({ ...policy, ...patch });
  const incentiveValue = Math.max(0, Number(policy.incentive_value) || 0);
  const incentiveActive = Boolean(policy.incentive_applicable) || incentiveValue > 0;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-slate-700">Incentive</h3>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Incentive Applicable</label>
        <YesNo
          name="incentive_applicable"
          value={incentiveActive}
          onChange={(v) => {
            if (v) {
              set({ incentive_applicable: true });
            } else {
              set({ incentive_applicable: false, incentive_value: 0 });
            }
          }}
        />
      </div>
      {incentiveActive && (
        <div className="space-y-3 pl-1 border-l-2 border-slate-200">
          <label className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
            <span>If employee has</span>
            <span className="text-slate-500">≥</span>
            <NumericInput
              min={0}
              integer
              blurDefault={26}
              value={policy.incentive_min_days ?? 26}
              onChange={(v) => set({ incentive_min_days: v })}
            />
            <span>consecutive present days, incentive is applicable.</span>
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <span>Incentive Value =</span>
            <NumericInput
              min={0}
              blurDefault={0}
              value={policy.incentive_value ?? 0}
              onChange={(v) => {
                const num = Math.max(0, Number(v) || 0);
                set({
                  incentive_value: num,
                  incentive_applicable: num > 0 ? true : Boolean(policy.incentive_applicable)
                });
              }}
            />
          </label>
        </div>
      )}
    </div>
  );
}
