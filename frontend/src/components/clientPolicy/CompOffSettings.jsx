import NumericInput from './NumericInput';

function NumInput({ label, value, onChange, step = 0.5, blurDefault = 0 }) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-700">
      <span>{label}</span>
      <NumericInput
        min={0}
        step={step}
        blurDefault={blurDefault}
        value={value}
        onChange={onChange}
      />
    </label>
  );
}

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

export default function CompOffSettings({ value, onChange }) {
  const policy = value ?? {};
  const set = (patch) => onChange({ ...policy, ...patch });

  const toggleType = (type) => {
    const types = policy.comp_off_types ?? [];
    const next = types.includes(type) ? types.filter((t) => t !== type) : [...types, type];
    set({ comp_off_types: next });
  };

  return (
    <div className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Comp Off Applicable</label>
        <YesNo name="comp_off" value={Boolean(policy.comp_off_applicable)} onChange={(v) => set({ comp_off_applicable: v })} />
      </div>

      {policy.comp_off_applicable && (
        <div className="space-y-3 pl-1 border-l-2 border-slate-200">
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={(policy.comp_off_types ?? []).includes('CO')}
                onChange={() => toggleType('CO')}
              />
              Comp Off (CO)
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={(policy.comp_off_types ?? []).includes('PAID_CO')}
                onChange={() => toggleType('PAID_CO')}
              />
              Paid Comp Off
            </label>
          </div>
          <NumInput
            label="1 day ="
            value={policy.comp_off_rule ?? 1}
            onChange={(v) => set({ comp_off_rule: v })}
            blurDefault={1}
          />
          {(policy.comp_off_types ?? []).includes('PAID_CO') && (
            <NumInput
              label="1 day ="
              value={policy.paid_comp_off_rule ?? 1}
              onChange={(v) => set({ paid_comp_off_rule: v })}
              blurDefault={1}
            />
          )}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">National Holiday (NH) Comp Off</label>
        <YesNo
          name="nh_comp"
          value={Boolean(policy.nh_comp_off_applicable)}
          onChange={(v) => set({ nh_comp_off_applicable: v })}
        />
        {policy.nh_comp_off_applicable && (
          <div className="mt-2 space-y-2 pl-1 border-l-2 border-slate-200">
            <NumInput label="P-NH Off: 1 day =" value={policy.nh_off_rule ?? 1} onChange={(v) => set({ nh_off_rule: v })} blurDefault={1} />
            <NumInput label="P-NH Pay: 1 day =" value={policy.nh_pay_rule ?? 1} onChange={(v) => set({ nh_pay_rule: v })} blurDefault={1} />
          </div>
        )}
      </div>
    </div>
  );
}
