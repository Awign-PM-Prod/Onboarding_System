import { useEffect, useMemo, useState } from 'react';
import { displayNumericValue } from '../lib/numericInput';
import { api } from '../lib/api';
import { formatPayAmount } from '../lib/formatPay';
import ModalOverlay from './ModalOverlay';
import {
  CUSHION_TYPE_LABELS,
  SKILL_LEVEL_LABELS,
  ZONE_LABELS,
  applyCushion,
  designationNameOf,
  normalizeCushionType,
  normalizeDesignationList,
  normalizeSkillLevel
} from '../lib/wageConfig';

const ACCEPT_TYPES = '.pdf,.doc,.docx,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';

function effectiveMonthlyCtc(payType, ctcType, ctcValue) {
  if (String(payType).toUpperCase() !== 'CTC') return null;
  const v = Number(ctcValue);
  if (!Number.isFinite(v)) return null;
  if (String(ctcType).toUpperCase() === 'ANNUAL') return v / 12;
  return v;
}

export default function SalaryEditModal({
  mode = 'direct',
  employee,
  designations = [],
  zoneDependency = false,
  cushionType = null,
  cushionValue = null,
  submitting = false,
  onClose,
  onSubmit
}) {
  const designationRows = useMemo(() => normalizeDesignationList(designations), [designations]);
  const resolvedCushionType = normalizeCushionType(cushionType);
  const hasCushion = Boolean(resolvedCushionType && cushionValue != null && cushionValue !== '');
  const isRequest = mode === 'request';

  const [form, setForm] = useState(() => ({
    pay_type: String(employee?.pay_type ?? 'CTC').toUpperCase() === 'NET_PAY' ? 'NET_PAY' : 'CTC',
    ctc_type: String(employee?.ctc_type ?? 'MONTHLY').toUpperCase() === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY',
    ctc_value: employee?.ctc_value != null ? String(employee.ctc_value) : '',
    reason: '',
    file: null
  }));
  const [fieldErrors, setFieldErrors] = useState({});
  const [baseMinMonthlyCtc, setBaseMinMonthlyCtc] = useState(null);
  const [minLoading, setMinLoading] = useState(false);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const isNetPay = form.pay_type === 'NET_PAY';

  const selectedSkill = useMemo(() => {
    const match = designationRows.find(
      (d) => d.name.toLowerCase() === String(employee?.designation ?? '').toLowerCase()
    );
    return normalizeSkillLevel(match?.skill_level, 'UNSKILLED');
  }, [designationRows, employee?.designation]);

  const lookupZone = zoneDependency
    ? String(employee?.zone ?? '').trim() || null
    : 'zone1';

  useEffect(() => {
    const state = String(employee?.state ?? '').trim();
    if (!state || !employee?.designation || !lookupZone) {
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
  }, [employee?.state, employee?.designation, lookupZone, selectedSkill]);

  const effectiveFloor = useMemo(
    () => applyCushion(baseMinMonthlyCtc, resolvedCushionType, cushionValue),
    [baseMinMonthlyCtc, resolvedCushionType, cushionValue]
  );

  const monthlyEffective = effectiveMonthlyCtc(form.pay_type, form.ctc_type, form.ctc_value);
  const belowMin =
    !isNetPay &&
    effectiveFloor != null &&
    monthlyEffective != null &&
    monthlyEffective < effectiveFloor;

  const validate = () => {
    const errors = {};
    if (!['CTC', 'NET_PAY'].includes(form.pay_type)) errors.pay_type = 'Required';
    if (!isNetPay && !['MONTHLY', 'ANNUAL'].includes(form.ctc_type)) errors.ctc_type = 'Invalid';
    const ctc = Number(form.ctc_value);
    if (!Number.isFinite(ctc) || ctc < 0) errors.ctc_value = 'Must be a non-negative number';
    if (belowMin) {
      errors.ctc_value = `Must be at least ₹${Number(effectiveFloor).toLocaleString('en-IN')} monthly CTC`;
    }
    if (isRequest && !form.file) errors.file = 'Supporting document or image is required';
    return errors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;
    await onSubmit({
      pay_type: form.pay_type,
      ctc_type: isNetPay ? null : form.ctc_type,
      ctc_value: Number(form.ctc_value),
      reason: form.reason,
      file: form.file
    });
  };

  const amountLabel = isNetPay ? 'Net Pay Amount' : 'CTC Amount';
  const zoneLabel = lookupZone ? ZONE_LABELS[lookupZone] || lookupZone : null;
  const submitDisabled = submitting || belowMin || minLoading || (isRequest && !form.file);
  const designationLabel = designationNameOf(
    designationRows.find((d) => d.name.toLowerCase() === String(employee?.designation ?? '').toLowerCase())
  ) || employee?.designation || '—';

  return (
    <ModalOverlay onClose={onClose}>
      <div className="mx-auto w-full max-w-lg rounded-lg bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h3 className="font-semibold text-slate-900">
            {isRequest ? `Request salary change — ${employee?.name || ''}` : `Edit salary — ${employee?.name || ''}`}
          </h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-700" aria-label="Close">
            x
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
          <p className="text-sm text-slate-600">
            Current pay:{' '}
            <span className="font-medium text-slate-800">
              {formatPayAmount(employee?.pay_type, employee?.ctc_type, employee?.ctc_value)}
            </span>
            {employee?.designation ? ` · ${designationLabel}` : ''}
          </p>
          {isRequest && (
            <p className="text-sm text-slate-600">
              After PM approval, Payroll Lead must review a supporting document or image before the new salary is applied.
            </p>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Pay Type</label>
            <div className="flex overflow-hidden rounded-md border border-slate-300">
              <button
                type="button"
                onClick={() => set({ pay_type: 'CTC' })}
                className={`flex-1 border-r border-slate-300 px-3 py-2 text-sm ${
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
            {fieldErrors.pay_type && <p className="mt-1 text-xs text-red-600">{fieldErrors.pay_type}</p>}
          </div>

          {isNetPay ? (
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">{amountLabel}</label>
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
              />
              {fieldErrors.ctc_value && <p className="mt-1 text-xs text-red-600">{fieldErrors.ctc_value}</p>}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Period</label>
                <select
                  className="input"
                  value={form.ctc_type}
                  onChange={(e) => set({ ctc_type: e.target.value })}
                >
                  <option value="MONTHLY">Monthly</option>
                  <option value="ANNUAL">Annual</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">{amountLabel}</label>
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
                />
                {fieldErrors.ctc_value && <p className="mt-1 text-xs text-red-600">{fieldErrors.ctc_value}</p>}
              </div>
            </div>
          )}

          {!isNetPay && employee?.state && employee?.designation && (!zoneDependency || lookupZone) && (
            <p className={`text-xs ${belowMin ? 'text-rose-600' : 'text-slate-500'}`}>
              {minLoading
                ? 'Loading minimum CTC…'
                : baseMinMonthlyCtc != null && effectiveFloor != null
                  ? hasCushion
                    ? `Min ₹${baseMinMonthlyCtc.toLocaleString('en-IN')} + cushion (${CUSHION_TYPE_LABELS[resolvedCushionType] || resolvedCushionType}: ${cushionValue}${resolvedCushionType === 'PERCENTAGE' ? '%' : ''}) → ₹${Number(effectiveFloor).toLocaleString('en-IN')} for ${employee.state}${zoneLabel ? ` / ${zoneLabel}` : ''} / ${SKILL_LEVEL_LABELS[selectedSkill]}`
                    : `Minimum monthly CTC for ${employee.state}${zoneLabel ? ` / ${zoneLabel}` : ''} / ${SKILL_LEVEL_LABELS[selectedSkill]}: ₹${Number(effectiveFloor).toLocaleString('en-IN')}`
                  : `No Super Admin minimum set for ${employee.state}${zoneLabel ? ` / ${zoneLabel}` : ''} / ${SKILL_LEVEL_LABELS[selectedSkill]}.`}
            </p>
          )}

          {isRequest && (
            <>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Reason (optional)</label>
                <textarea
                  value={form.reason}
                  onChange={(e) => set({ reason: e.target.value })}
                  rows={3}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  placeholder="Why does this salary need to change?"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Supporting attachment (required)
                </label>
                <input
                  type="file"
                  accept={ACCEPT_TYPES}
                  onChange={(e) => set({ file: e.target.files?.[0] ?? null })}
                  className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100"
                />
                <p className="mt-1 text-xs text-slate-500">PDF, DOC, DOCX, JPG, or PNG. Max 5 MB.</p>
                {form.file && (
                  <p className="mt-1 text-xs text-slate-600">{form.file.name}</p>
                )}
                {fieldErrors.file && <p className="mt-1 text-xs text-red-600">{fieldErrors.file}</p>}
              </div>
            </>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitDisabled}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {submitting ? 'Saving...' : isRequest ? 'Send to Payroll Lead' : 'Save salary'}
            </button>
          </div>
        </form>
      </div>
    </ModalOverlay>
  );
}
