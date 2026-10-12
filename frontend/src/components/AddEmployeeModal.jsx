import { useState } from 'react';
import { api } from '../lib/api';
import ModalOverlay from './ModalOverlay';

const empty = {
  name: '',
  mobile: '',
  email: ''
};

const TEN_DIGIT_REGEX = /^\d{10}$/;

function normalizeMobile(raw) {
  return String(raw ?? '').replace(/\D/g, '').slice(0, 10);
}

export default function AddEmployeeModal({ clientId, onClose, onCreated, onRehired, embedded = false }) {
  const [form, setForm] = useState(empty);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [rehireCandidate, setRehireCandidate] = useState(null);
  const [rehireLoading, setRehireLoading] = useState(false);

  const set = (patch) => setForm(f => ({ ...f, ...patch }));

  const validate = () => {
    const errs = {};
    if (!form.name.trim()) errs.name = 'Required';
    if (!form.mobile.trim()) errs.mobile = 'Required';
    else if (!TEN_DIGIT_REGEX.test(form.mobile)) errs.mobile = 'Must be 10 digits';
    if (!form.email.trim()) errs.email = 'Required';
    return errs;
  };

  const clearFormAfterSuccess = () => {
    if (embedded) setForm({ ...empty });
    else onClose?.();
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;
    setSubmitting(true);
    setError(null);
    setRehireCandidate(null);
    try {
      const payload = {
        client_id: clientId,
        name: form.name,
        mobile: form.mobile,
        email: form.email.trim().toLowerCase()
      };
      await api.createEmployee(payload);
      const createdName = String(form.name ?? '').trim();
      await onCreated?.({
        name: createdName,
        mobile: form.mobile,
        email: payload.email
      });
      clearFormAfterSuccess();
    } catch (err) {
      if (err?.code === 'REHIRE_CANDIDATE' && err?.employee?.id) {
        setRehireCandidate(err.employee);
        setError(null);
      } else {
        setError(err.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const confirmRehire = async () => {
    if (!rehireCandidate?.id) return;
    setRehireLoading(true);
    setError(null);
    try {
      const result = await api.rehireEmployee({
        employeeId: rehireCandidate.id,
        targetClientId: clientId,
        name: form.name.trim(),
        email: form.email.trim().toLowerCase()
      });
      const rehiredName = String(result?.employee?.name ?? form.name ?? '').trim();
      setRehireCandidate(null);
      await onRehired?.({
        name: rehiredName,
        employee: result?.employee ?? null,
        has_kyc: Boolean(rehireCandidate.has_kyc)
      });
      if (!onRehired) {
        await onCreated?.({
          name: rehiredName,
          mobile: form.mobile,
          email: form.email.trim().toLowerCase()
        });
      }
      clearFormAfterSuccess();
    } catch (err) {
      setError(err.message || 'Could not rehire employee.');
    } finally {
      setRehireLoading(false);
    }
  };

  const formBody = (
        <form onSubmit={onSubmit} className={embedded ? 'space-y-4' : 'px-5 py-4 space-y-4'}>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded px-3 py-2 text-sm">
              {error}
            </div>
          )}

          <p className="text-xs text-slate-500">
            A unique Reference ID is generated automatically for onboarding. StaffingGo Emp Code is added when the employee is marked Joined.
          </p>

          <Field label="Name" error={fieldErrors.name}>
            <input className="input" value={form.name} onChange={e => set({ name: e.target.value })} />
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

  const rehireModal = rehireCandidate ? (
    <ModalOverlay onClose={() => !rehireLoading && setRehireCandidate(null)}>
      <div className="bg-white rounded-lg w-full max-w-lg shadow-lg">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
          <h3 className="font-semibold text-slate-900">Rehire existing employee?</h3>
          <button
            type="button"
            onClick={() => !rehireLoading && setRehireCandidate(null)}
            className="text-slate-500 hover:text-slate-700"
            aria-label="Close"
            disabled={rehireLoading}
          >
            x
          </button>
        </div>
        <div className="px-5 py-4 space-y-3 text-sm text-slate-700">
          <p>
            This person already exists in the system and is exited. Rehire them to this project instead of creating a duplicate.
          </p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm">
            <div>
              <dt className="text-xs text-slate-500">Name</dt>
              <dd className="font-medium text-slate-900">{rehireCandidate.name || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Reference ID</dt>
              <dd className="font-medium text-slate-900">{rehireCandidate.reference_id || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Mobile</dt>
              <dd className="text-slate-800">{rehireCandidate.mobile || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Email</dt>
              <dd className="break-all text-slate-800">{rehireCandidate.email || '—'}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs text-slate-500">Previous KYC</dt>
              <dd className="text-slate-800">
                {rehireCandidate.has_kyc
                  ? 'Kept — employee will get a prefilled form after you set role details and initiate onboarding.'
                  : 'No prior KYC on file — they will fill a fresh form after initiate.'}
              </dd>
            </div>
          </dl>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded px-3 py-2 text-sm">
              {error}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setRehireCandidate(null)}
              disabled={rehireLoading}
              className="px-4 py-2 text-sm rounded border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmRehire}
              disabled={rehireLoading}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-md px-4 py-2 disabled:opacity-60"
            >
              {rehireLoading ? 'Rehiring...' : 'Confirm rehire'}
            </button>
          </div>
        </div>
      </div>
    </ModalOverlay>
  ) : null;

  if (embedded) {
    return (
      <>
        {formBody}
        {rehireModal}
      </>
    );
  }

  return (
    <>
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
      {rehireModal}
    </>
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
