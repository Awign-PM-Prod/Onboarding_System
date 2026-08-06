import { useEffect, useState } from 'react';
import { formatDesignationLabel } from '../lib/formatLabels';
import { INDIAN_STATES } from '../lib/indianStates';
import { displayNumericValue } from '../lib/numericInput';
import { api } from '../lib/api';
import ModalOverlay from './ModalOverlay';

const empty = {
  designation: '',
  date_of_joining: '',
  pay_type: 'CTC',
  ctc_type: 'MONTHLY',
  ctc_value: '',
  state: ''
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
  onClose,
  onSubmit
}) {
  const [form, setForm] = useState(() => ({
    ...empty,
    designation: designations[0] ?? '',
    state: defaultState && INDIAN_STATES.includes(defaultState) ? defaultState : ''
  }));
  const [fieldErrors, setFieldErrors] = useState({});
  const [sendOnboardingNow, setSendOnboardingNow] = useState(false);
  const [minMonthlyCtc, setMinMonthlyCtc] = useState(null);
  const [minLoading, setMinLoading] = useState(false);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const isNetPay = form.pay_type === 'NET_PAY';

  // Fetch state CTC minimum and autofill when CTC (raise to at least min).
  useEffect(() => {
    const state = form.state;
    if (!state || !INDIAN_STATES.includes(state)) {
      setMinMonthlyCtc(null);
      return undefined;
    }
    let cancelled = false;
    setMinLoading(true);
    api
      .getSalaryMinimumForState(state)
      .then((data) => {
        if (cancelled) return;
        const min =
          data?.min_monthly_ctc != null && Number.isFinite(Number(data.min_monthly_ctc))
            ? Number(data.min_monthly_ctc)
            : null;
        setMinMonthlyCtc(min);
      })
      .catch(() => {
        if (!cancelled) setMinMonthlyCtc(null);
      })
      .finally(() => {
        if (!cancelled) setMinLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [form.state]);

  // When min is known (or switching back to CTC), raise amount if below floor.
  useEffect(() => {
    if (form.pay_type !== 'CTC' || minMonthlyCtc == null) return;
    setForm((f) => {
      if (f.pay_type !== 'CTC') return f;
      const current = Number(f.ctc_value);
      const empty = !Number.isFinite(current) || f.ctc_value === '';
      const effective = empty
        ? null
        : String(f.ctc_type).toUpperCase() === 'ANNUAL'
          ? current / 12
          : current;
      if (effective != null && effective >= minMonthlyCtc) return f;
      return {
        ...f,
        ctc_type: 'MONTHLY',
        ctc_value: String(minMonthlyCtc)
      };
    });
  }, [form.pay_type, minMonthlyCtc]);

  const monthlyEffective = effectiveMonthlyCtc(form.pay_type, form.ctc_type, form.ctc_value);
  const belowMin =
    !isNetPay &&
    minMonthlyCtc != null &&
    monthlyEffective != null &&
    monthlyEffective < minMonthlyCtc;

  const validate = () => {
    const errors = {};
    if (!form.designation) errors.designation = 'Required';
    if (!form.date_of_joining) errors.date_of_joining = 'Required';
    if (!['CTC', 'NET_PAY'].includes(form.pay_type)) errors.pay_type = 'Required';
    if (!isNetPay && !['MONTHLY', 'ANNUAL'].includes(form.ctc_type)) errors.ctc_type = 'Invalid';
    const ctc = Number(form.ctc_value);
    if (!Number.isFinite(ctc) || ctc < 0) errors.ctc_value = 'Must be a non-negative number';
    if (!form.state) errors.state = 'Required';
    if (belowMin) {
      errors.ctc_value = `Must be at least ₹${minMonthlyCtc.toLocaleString('en-IN')} monthly CTC for ${form.state}`;
    }
    return errors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;
    await onSubmit(
      {
        designation: form.designation,
        date_of_joining: form.date_of_joining,
        pay_type: form.pay_type,
        ctc_type: isNetPay ? null : form.ctc_type,
        ctc_value: Number(form.ctc_value),
        state: form.state
      },
      { sendOnboardingNow }
    );
  };

  const amountLabel = isNetPay ? 'Net Pay Amount' : 'CTC Amount';
  const submitDisabled =
    submitting || designations.length === 0 || belowMin || minLoading;

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
              {designations.length === 0 && <option value="">No designations found</option>}
              {designations.map((d) => (
                <option key={d} value={d}>{formatDesignationLabel(d)}</option>
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

          {!isNetPay && form.state && (
            <p className={`text-xs ${belowMin ? 'text-rose-600' : 'text-slate-500'}`}>
              {minLoading
                ? 'Loading minimum CTC for state…'
                : minMonthlyCtc != null
                  ? `Minimum monthly CTC for ${form.state}: ₹${minMonthlyCtc.toLocaleString('en-IN')}${
                      belowMin ? ' — increase amount to enable Save' : ''
                    }`
                  : `No Super Admin minimum set for ${form.state}.`}
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
