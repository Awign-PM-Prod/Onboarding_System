import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

const emptyForm = {
  name: '',
  email: '',
  password: '',
  confirmPassword: ''
};

export default function ProgramManagerForm() {
  const navigate = useNavigate();
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const validate = () => {
    const errs = {};
    if (!form.name.trim()) errs.name = 'Name is required';
    if (!form.email.trim()) {
      errs.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      errs.email = 'Enter a valid email';
    }
    if (!form.password) {
      errs.password = 'Password is required';
    } else if (form.password.length < 6) {
      errs.password = 'Password must be at least 6 characters';
    }
    if (form.password !== form.confirmPassword) {
      errs.confirmPassword = 'Passwords do not match';
    }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!validate()) return;

    setSubmitting(true);
    try {
      await api.createProgramManager({
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password
      });
      navigate('/dashboard/program-managers', { replace: true });
    } catch (err) {
      setError(err.message || 'Could not create program manager.');
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500';

  return (
    <main className="mx-auto max-w-xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6">
        <Link
          to="/dashboard/program-managers"
          className="text-sm font-medium text-indigo-700 hover:underline"
        >
          ← Back to Program Managers
        </Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">
          Add Program Manager
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Create a login account. Share the email and password with the Program Manager so they can
          sign in.
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
          <label htmlFor="pm-name" className="block text-sm font-medium text-slate-700">
            Name
          </label>
          <input
            id="pm-name"
            type="text"
            autoComplete="name"
            value={form.name}
            onChange={(e) => setField('name', e.target.value)}
            className={inputClass}
          />
          {fieldErrors.name && (
            <p className="mt-1 text-xs text-rose-600">{fieldErrors.name}</p>
          )}
        </div>

        <div>
          <label htmlFor="pm-email" className="block text-sm font-medium text-slate-700">
            Email
          </label>
          <input
            id="pm-email"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={(e) => setField('email', e.target.value)}
            className={inputClass}
          />
          {fieldErrors.email && (
            <p className="mt-1 text-xs text-rose-600">{fieldErrors.email}</p>
          )}
        </div>

        <div>
          <label htmlFor="pm-password" className="block text-sm font-medium text-slate-700">
            Password
          </label>
          <input
            id="pm-password"
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => setField('password', e.target.value)}
            className={inputClass}
          />
          {fieldErrors.password && (
            <p className="mt-1 text-xs text-rose-600">{fieldErrors.password}</p>
          )}
        </div>

        <div>
          <label htmlFor="pm-confirm" className="block text-sm font-medium text-slate-700">
            Confirm password
          </label>
          <input
            id="pm-confirm"
            type="password"
            autoComplete="new-password"
            value={form.confirmPassword}
            onChange={(e) => setField('confirmPassword', e.target.value)}
            className={inputClass}
          />
          {fieldErrors.confirmPassword && (
            <p className="mt-1 text-xs text-rose-600">{fieldErrors.confirmPassword}</p>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <Link
            to="/dashboard/program-managers"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60"
          >
            {submitting ? 'Creating…' : 'Create Program Manager'}
          </button>
        </div>
      </form>
    </main>
  );
}
