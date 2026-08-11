import { useEffect, useMemo, useState } from 'react';
import { formatDesignationLabel } from '../lib/formatLabels';
import { INDIAN_STATES } from '../lib/indianStates';
import { displayNumericValue } from '../lib/numericInput';
import { api } from '../lib/api';
import ModalOverlay from './ModalOverlay';
import {
  CUSHION_TYPE_LABELS,
  SKILL_LEVEL_LABELS,
  WAGE_ZONES,
  ZONE_LABELS,
  applyCushion,
  designationNameOf,
  normalizeCushionType,
  normalizeDesignationList,
  normalizeSkillLevel
} from '../lib/wageConfig';

const empty = {
  designation: '',
  date_of_joining: '',
  pay_type: 'CTC',
  ctc_type: 'MONTHLY',
  ctc_value: '',
  state: '',
  zone: 'zone1'
};

function effectiveMonthlyCtc(payType, ctcType, ctcValue) {
  if (String(payType).toUpperCase() !== 'CTC') return null;
  const v = Number(ctcValue);
  if (!Number.isFinite(v)) return null;
  if (String(ctcType).toUpperCase() === 'ANNUAL') return v / 12;
  return v;
}

export default function RoleDetailsModal({
  title,
  description,
  designations = [],
  submitting = false,
  showSendOnboardingOption = false,
  defaultState = '',
  zoneDependency = false,
  cushionType = null,
  cushionValue = null,
  onClose,
  onSubmit
}) {
  const designationRows = useMemo(() => normalizeDesignationList(designations), [designations]);
  const resolvedCushionType = normalizeCushionType(cushionType);
  const hasCushion = Boolean(resolvedCushionType && cushionValue != null && cushionValue !== '');

  const [form, setForm] = useState(() => ({
    ...empty,
    designation: designationNameOf(designationRows[0]) || '',
    state: defaultState && INDIAN_STATES.includes(defaultState) ? defaultState : '',
    zone: 'zone1'
  }));
  const [fieldErrors, setFieldErrors] = useState({});
  const [sendOnboardingNow, setSendOnboardingNow] = useState(false);
  const [baseMinMonthlyCtc, setBaseMinMonthlyCtc] = useState(null);
  const [minLoading, setMinLoading] = useState(false);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const isNetPay = form.pay_type === 'NET_PAY';

  const selectedSkill = useMemo(() => {
    const match = designationRows.find(
      (d) => d.name.toLowerCase() === String(form.designation).toLowerCase()
    );
    return normalizeSkillLevel(match?.skill_level, 'UNSKILLED');
  }, [designationRows, form.designation]);

  const lookupZone = zoneDependency ? form.zone || 'zone1' : 'zone1';

  const effectiveFloor = useMemo(
    () => applyCushion(baseMinMonthlyCtc, resolvedCushionType, cushionValue),
    [baseMinMonthlyCtc, resolvedCushionType, cushionValue]
  );

  // Fetch wage CTC minimum; cushion is applied client-side for the effective floor.
  useEffect(() => {
    const state = form.state;
    if (!state || !INDIAN_STATES.includes(state) || !form.designation) {
      setBaseMinMonthlyCtc(null);
      return undefined;
    }
    let cancelled = false;
    setMinLoading(true);
    api
      .getSalaryMinimumForState(state, {
        zone: lookupZone,
        skill_level: selectedSkill
      })
      .then((data) => {
        if (cancelled) return;
        const min =
          data?.min_monthly_ctc != null && Number.isFinite(Number(data.min_monthly_ctc))
            ? Number(data.min_monthly_ctc)
            : null;
        setBaseMinMonthlyCtc(min);
      })
      .catch(() => {
        if (!cancelled) setBaseMinMonthlyCtc(null);
      })
      .finally(() => {
        if (!cancelled) setMinLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [form.state, form.designation, lookupZone, selectedSkill]);

  // When effective floor changes (zone / state / skill / cushion) or switching to CTC, set amount.
  useEffect(() => {
    if (form.pay_type !== 'CTC' || effectiveFloor == null) return;
    setForm((f) => {
      if (f.pay_type !== 'CTC') return f;
      const next = String(effectiveFloor);
      if (f.ctc_type === 'MONTHLY' && f.ctc_value === next) return f;
      return {
        ...f,
        ctc_type: 'MONTHLY',
        ctc_value: next
      };
    });
  }, [form.pay_type, effectiveFloor]);

  const monthlyEffective = effectiveMonthlyCtc(form.pay_type, form.ctc_type, form.ctc_value);
  const belowMin =
    !isNetPay &&
    effectiveFloor != null &&
    monthlyEffective != null &&
    monthlyEffective < effectiveFloor;

  const validate = () => {
    const errors = {};
    if (!form.designation) errors.designation = 'Required';
    if (!form.date_of_joining) errors.date_of_joining = 'Required';
    if (!['CTC', 'NET_PAY'].includes(form.pay_type)) errors.pay_type = 'Required';
    if (!isNetPay && !['MONTHLY', 'ANNUAL'].includes(form.ctc_type)) errors.ctc_type = 'Invalid';
    const ctc = Number(form.ctc_value);
    if (!Number.isFinite(ctc) || ctc < 0) errors.ctc_value = 'Must be a non-negative number';
    if (!form.state) errors.state = 'Required';
    if (zoneDependency && !WAGE_ZONES.includes(form.zone)) {
      errors.zone = 'Required';
    }
    if (belowMin) {
      errors.ctc_value = `Must be at least ₹${Number(effectiveFloor).toLocaleString('en-IN')} monthly CTC for ${form.state}`;
    }
    return errors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;
    const payload = {
      designation: form.designation,
      date_of_joining: form.date_of_joining,
      pay_type: form.pay_type,
      ctc_type: isNetPay ? null : form.ctc_type,
      ctc_value: Number(form.ctc_value),
      state: form.state
    };
    if (zoneDependency) payload.zone = form.zone;
    await onSubmit(payload, { sendOnboardingNow });
  };

  const amountLabel = isNetPay ? 'Net Pay Amount' : 'CTC Amount';
  const submitDisabled =
    submitting || designationRows.length === 0 || belowMin || minLoading;

  return (
    <ModalOverlay onClose={onClose}>
      <div className="mx-auto w-full max-w-lg rounded-lg bg-white shadow-lg">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
          <h3 className="font-semibold text-slate-900">{title}</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-700" aria-label="Close">x</button>
        </div>
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          {description && <p className="text-sm text-slate-600">{description}</p>}

          <Field label="Designation" error={fieldErrors.designation}>
            <select
              className="input"
              value={form.designation}
              onChange={(e) => set({ designation: e.target.value })}
            >
              {designationRows.length === 0 && <option value="">No designations found</option>}
              {designationRows.map((d) => (
                <option key={d.name} value={d.name}>
                  {formatDesignationLabel(d.name)} ({SKILL_LEVEL_LABELS[d.skill_level] || d.skill_level})
                </option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Expected Date of Joining" error={fieldErrors.date_of_joining}>
              <input
                className="input"
                type="date"
                value={form.date_of_joining}
                onChange={(e) => set({ date_of_joining: e.target.value })}
              />
            </Field>
            <Field label="State" error={fieldErrors.state}>
              <select
                className="input"
                value={form.state}
                onChange={(e) => set({ state: e.target.value })}
              >
                <option value="">Select state</option>
                {INDIAN_STATES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </Field>
          </div>

          {zoneDependency && (
            <Field label="Zone" error={fieldErrors.zone}>
              <select
                className="input"
                value={form.zone}
                onChange={(e) => set({ zone: e.target.value })}
              >
                {WAGE_ZONES.map((z) => (
                  <option key={z} value={z}>{ZONE_LABELS[z]}</option>
                ))}
              </select>
            </Field>
          )}

          <Field label="Pay Type" error={fieldErrors.pay_type}>
            <div className="flex overflow-hidden rounded-md border border-slate-300">
              <button
                type="button"
                onClick={() => set({ pay_type: 'CTC' })}
                className={`flex-1 px-3 py-2 text-sm border-r border-slate-300 ${
                  form.pay_type === 'CTC' ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                CTC
              </button>
              <button
                type="button"
                onClick={() => set({ pay_type: 'NET_PAY' })}
                className={`flex-1 px-3 py-2 text-sm ${
                  form.pay_type === 'NET_PAY' ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                Net Pay
              </button>
            </div>
          </Field>

          {isNetPay ? (
            <Field label={amountLabel} error={fieldErrors.ctc_value}>
              <input
                className="input"
                type="text"
                inputMode="decimal"
                placeholder="0"
                value={displayNumericValue(form.ctc_value)}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === '') {
                    set({ ctc_value: '' });
                    return;
                  }
                  if (/^\d*\.?\d*$/.test(raw)) set({ ctc_value: raw });
                }}
                onBlur={() => {
                  if (form.ctc_value === '') return;
                  const n = Number(form.ctc_value);
                  if (Number.isFinite(n)) set({ ctc_value: String(n) });
                }}
              />
            </Field>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Period" error={fieldErrors.ctc_type}>
                <select className="input" value={form.ctc_type} onChange={(e) => set({ ctc_type: e.target.value })}>
                  <option value="MONTHLY">Monthly</option>
                  <option value="ANNUAL">Annual</option>
                </select>
              </Field>
              <Field label={amountLabel} error={fieldErrors.ctc_value}>
                <input
                  className="input"
                  type="text"
                  inputMode="decimal"
                  placeholder="0"
                  value={displayNumericValue(form.ctc_value)}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw === '') {
                      set({ ctc_value: '' });
                      return;
                    }
                    if (/^\d*\.?\d*$/.test(raw)) set({ ctc_value: raw });
                  }}
                  onBlur={() => {
                    if (form.ctc_value === '') return;
                    const n = Number(form.ctc_value);
                    if (Number.isFinite(n)) set({ ctc_value: String(n) });
                  }}
                />
              </Field>
            </div>
          )}

          {!isNetPay && form.state && form.designation && (
            <p className={`text-xs ${belowMin ? 'text-rose-600' : 'text-slate-500'}`}>
              {minLoading
                ? 'Loading minimum CTC…'
                : baseMinMonthlyCtc != null && effectiveFloor != null
                  ? hasCushion
                    ? `Min ₹${baseMinMonthlyCtc.toLocaleString('en-IN')} + cushion (${CUSHION_TYPE_LABELS[resolvedCushionType] || resolvedCushionType}: ${cushionValue}${resolvedCushionType === 'PERCENTAGE' ? '%' : ''}) → ₹${Number(effectiveFloor).toLocaleString('en-IN')} for ${form.state} / ${ZONE_LABELS[lookupZone] || lookupZone} / ${SKILL_LEVEL_LABELS[selectedSkill]}${belowMin ? ' — increase amount to enable Save' : ''}`
                    : `Minimum monthly CTC for ${form.state} / ${ZONE_LABELS[lookupZone] || lookupZone} / ${SKILL_LEVEL_LABELS[selectedSkill]}: ₹${Number(effectiveFloor).toLocaleString('en-IN')}${
                        belowMin ? ' — increase amount to enable Save' : ''
                      }`
                  : `No Super Admin minimum set for ${form.state} / ${ZONE_LABELS[lookupZone] || lookupZone} / ${SKILL_LEVEL_LABELS[selectedSkill]}.`}
            </p>
          )}

          {showSendOnboardingOption && (
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={sendOnboardingNow}
                onChange={(e) => setSendOnboardingNow(e.target.checked)}
                className="mt-0.5"
              />
              <span>Also send onboarding form immediately after saving details</span>
            </label>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm rounded border border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitDisabled}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-md px-4 py-2 disabled:opacity-60"
            >
              {submitting ? 'Saving...' : 'Save Details'}
            </button>
          </div>
        </form>
      </div>
    </ModalOverlay>
  );
}

function Field({ label, error, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      {children}
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}
