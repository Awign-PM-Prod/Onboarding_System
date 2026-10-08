import { useState } from 'react';
import { api } from '../lib/api';
import ModalOverlay from './ModalOverlay';

function whatsappMessage(whatsapp) {
  switch (whatsapp?.status) {
    case 'sent':
      return 'Onboarding link resent on WhatsApp to the new number.';
    case 'failed':
      return `Could not resend the WhatsApp link (${whatsapp.error || 'unknown error'}). Ask the employee to use the form link manually.`;
    case 'skipped':
      return 'WhatsApp link was not resent (number could not be formatted).';
    default:
      return '';
  }
}

export default function EditMobileModal({ employee, onClose, onSaved }) {
  const [mobile, setMobile] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const digits = mobile.replace(/\D/g, '');
  const valid = digits.length === 10 && digits !== String(employee?.mobile ?? '');

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    setError('');
    try {
      const result = await api.updateEmployeeMobile(employee.id, digits);
      const extra = whatsappMessage(result?.whatsapp);
      onSaved?.({
        employee: result?.employee,
        message: `Mobile updated for ${employee.name || 'employee'}.${extra ? ` ${extra}` : ''}`
      });
    } catch (err) {
      setError(err?.message || 'Could not update mobile number.');
      setSaving(false);
    }
  };

  return (
    <ModalOverlay onClose={saving ? undefined : onClose}>
      <form onSubmit={handleSubmit} className="mx-auto w-full max-w-md rounded-lg bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h3 className="font-semibold text-slate-900">Correct mobile — {employee?.name || ''}</h3>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="text-slate-500 hover:text-slate-700 disabled:opacity-50"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="space-y-4 px-5 py-4">
          <div>
            <p className="text-xs font-medium text-slate-600">Current mobile</p>
            <p className="mt-0.5 font-mono text-sm text-slate-900">{employee?.mobile || '—'}</p>
          </div>
          <div>
            <label htmlFor="edit-mobile-input" className="mb-1 block text-xs font-medium text-slate-600">
              New mobile (10 digits)
            </label>
            <input
              id="edit-mobile-input"
              type="tel"
              inputMode="numeric"
              autoFocus
              maxLength={14}
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              disabled={saving}
              placeholder="9876543210"
              className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:opacity-60"
            />
            {mobile && digits.length !== 10 ? (
              <p className="mt-1 text-xs text-rose-600">Enter exactly 10 digits.</p>
            ) : null}
          </div>
          {employee?.onboarding_initiated ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              The onboarding form was already sent. Saving will resend the link on WhatsApp to the new number.
            </p>
          ) : null}
          {error ? (
            <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
          ) : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!valid || saving}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save mobile'}
          </button>
        </div>
      </form>
    </ModalOverlay>
  );
}
