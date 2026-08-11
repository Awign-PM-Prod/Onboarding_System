import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useWorkspacePaths } from '../context/WorkspaceBasePath';

const STAFF_ACCOUNTS_LIST = '/super-admin/staff-accounts';

export default function ProgramManagerForm() {
  const navigate = useNavigate();
  const location = useLocation();
  const paths = useWorkspacePaths();
  const fromStaffAccounts = location.pathname.startsWith(STAFF_ACCOUNTS_LIST);
  const listPath = fromStaffAccounts ? STAFF_ACCOUNTS_LIST : paths.programManagers;
  const backLabel = fromStaffAccounts ? '← Back to Staff Accounts' : '← Back to Program Managers';
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [fieldError, setFieldError] = useState('');

  const validate = () => {
    if (!email.trim()) {
      setFieldError('Email is required');
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setFieldError('Enter a valid email');
      return false;
    }
    setFieldError('');
    return true;
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!validate()) return;

    setSubmitting(true);
    try {
      await api.createProgramManager({
        email: email.trim().toLowerCase()
      });
      navigate(listPath, { replace: true, state: { inviteSent: true, inviteEmail: email.trim().toLowerCase() } });
    } catch (err) {
      setError(err.message || 'Could not send invite.');
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500';

  return (
    <main className="mx-auto max-w-xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6">
        <Link to={listPath} className="text-sm font-medium text-indigo-700 hover:underline">
          {backLabel}
        </Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">
          Invite Program Manager
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Enter their email. They will receive a link to set their name and password.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      )}

      <form
        onSubmit={onSubmit}
        className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
      >
        <div>
          <label htmlFor="pm-email" className="block text-sm font-medium text-slate-700">
            Email
          </label>
          <input
            id="pm-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (fieldError) setFieldError('');
            }}
            className={inputClass}
          />
          {fieldError && <p className="mt-1 text-xs text-rose-600">{fieldError}</p>}
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <Link
            to={listPath}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60"
          >
            {submitting ? 'Sending…' : 'Send invite'}
          </button>
        </div>
      </form>
    </main>
  );
}
