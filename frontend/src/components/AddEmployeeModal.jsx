import { useState } from 'react';
import { api } from '../lib/api';
import ModalOverlay from './ModalOverlay';

const empty = {
  name: '',
  mobile: '',
  email: '',
  emp_code: ''
};

const TEN_DIGIT_REGEX = /^\d{10}$/;

function normalizeMobile(raw) {
  return String(raw ?? '').replace(/\D/g, '').slice(0, 10);
}

export default function AddEmployeeModal({ clientId, onClose, onCreated, embedded = false }) {
  const [form, setForm] = useState(empty);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  const set = (patch) => setForm(f => ({ ...f, ...patch }));

  const validate = () => {
    const errs = {};
    if (!form.name.trim()) errs.name = 'Required';
    if (!form.mobile.trim()) errs.mobile = 'Required';
    else if (!TEN_DIGIT_REGEX.test(form.mobile)) errs.mobile = 'Must be 10 digits';
    if (!form.email.trim()) errs.email = 'Required';
    if (!form.emp_code.trim()) errs.emp_code = 'Required';
    return errs;
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        client_id: clientId,
        ...form
      };
      await api.createEmployee(payload);
      const createdName = String(form.name ?? '').trim();
      await onCreated?.({
        name: createdName,
        mobile: form.mobile,
        email: form.email,
        emp_code: form.emp_code
      });
      if (embedded) setForm({ ...empty });
      else onClose?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const formBody = (
        <form onSubmit={onSubmit} className={embedded ? 'space-y-4' : 'px-5 py-4 space-y-4'}>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded px-3 py-2 text-sm">
              {error}
            </div>
          )}

          <Field label="Name" error={fieldErrors.name}>
            <input className="input" value={form.name} onChange={e => set({ name: e.target.value })} />
          </Field>

          <Field label="Emp Code (StaffingGo)" error={fieldErrors.emp_code}>
            <input
              className="input"
              value={form.emp_code}
              onChange={e => set({ emp_code: e.target.value })}
              placeholder="e.g. T016394"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Mobile" error={fieldErrors.mobile}>
              <input
                className="input"
                value={form.mobile}
                onChange={e => set({ mobile: normalizeMobile(e.target.value) })}
                inputMode="numeric"
                maxLength={10}
                placeholder="10-digit mobile"
              />
            </Field>
            <Field label="Email" error={fieldErrors.email}>
              <input className="input" type="email" value={form.email} onChange={e => set({ email: e.target.value })} />
            </Field>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            {!embedded && (
              <button type="button" onClick={onClose}
                className="px-4 py-2 text-sm rounded border border-slate-300 text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
            )}
            <button type="submit" disabled={submitting}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-md px-4 py-2 disabled:opacity-60">
              {submitting ? 'Saving...' : 'Add Available Employee'}
            </button>
          </div>
        </form>
  );

  if (embedded) {
    return formBody;
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="bg-white rounded-lg w-full max-w-lg shadow-lg">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
          <h3 className="font-semibold text-slate-900">Add Available Employee</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-500 hover:text-slate-700"
            aria-label="Close"
          >
            x
          </button>
        </div>
        {formBody}
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
