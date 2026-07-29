import NumericInput from './NumericInput';

function NumInput({ label, value, onChange, step = 0.5, blurDefault = 0, suffix }) {
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
      {suffix ? <span>{suffix}</span> : null}
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

function HolidayCompOffRule({
  title,
  name,
  applicable,
  onApplicableChange,
  offRule,
  onOffRuleChange,
  payRule,
  onPayRuleChange,
  offLabel,
  payLabel
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{title}</label>
      <YesNo name={name} value={Boolean(applicable)} onChange={onApplicableChange} />
      {applicable && (
        <div className="mt-2 space-y-3 pl-1 border-l-2 border-slate-200">
          <div className="space-y-1">
            <p className="text-sm font-medium text-slate-700">{offLabel}</p>
            <NumInput
              label="1 day ="
              value={offRule ?? 1}
              onChange={onOffRuleChange}
              blurDefault={1}
              suffix="Day(s) Off"
            />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-slate-700">{payLabel}</p>
            <NumInput
              label="1 day ="
              value={payRule ?? 1}
              onChange={onPayRuleChange}
              blurDefault={1}
              suffix="Day(s) Pay"
            />
          </div>
        </div>
      )}
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

      <HolidayCompOffRule
        title="National Holiday (NH) Comp Off"
        name="nh_comp"
        applicable={policy.nh_comp_off_applicable}
        onApplicableChange={(v) => set({ nh_comp_off_applicable: v })}
        offRule={policy.nh_off_rule}
        onOffRuleChange={(v) => set({ nh_off_rule: v })}
        payRule={policy.nh_pay_rule}
        onPayRuleChange={(v) => set({ nh_pay_rule: v })}
        offLabel="P-NH Off Rule"
        payLabel="P-NH Pay Rule"
      />

      <HolidayCompOffRule
        title="Festival Holiday Comp Off"
        name="fh_comp"
        applicable={policy.fh_comp_off_applicable}
        onApplicableChange={(v) => set({ fh_comp_off_applicable: v })}
        offRule={policy.fh_off_rule}
        onOffRuleChange={(v) => set({ fh_off_rule: v })}
        payRule={policy.fh_pay_rule}
        onPayRuleChange={(v) => set({ fh_pay_rule: v })}
        offLabel="P-FH Off Rule"
        payLabel="P-FH Pay Rule"
      />
    </div>
  );
}
