import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';

export default function SetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = String(searchParams.get('token') || '').trim();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!token) {
        setLoadError('This invite link is missing a token.');
        setLoading(false);
        return;
      }
      setLoading(true);
      setLoadError('');
      try {
        const data = await api.getStaffInvite(token);
        if (cancelled) return;
        setEmail(data?.email || '');
      } catch (err) {
        if (cancelled) return;
        setLoadError(err.message || 'This invite link is invalid or has expired.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const validate = () => {
    const errs = {};
    if (!name.trim()) errs.name = 'Name is required';
    if (!password) {
      errs.password = 'Password is required';
    } else if (password.length < 6) {
      errs.password = 'Password must be at least 6 characters';
    }
    if (password !== confirmPassword) {
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
      await api.setStaffPasswordFromInvite({
        token,
        name: name.trim(),
        password,
        confirmPassword
      });
      navigate('/login', { replace: true, state: { setPasswordSuccess: true, email } });
    } catch (err) {
      setError(err.message || 'Could not set password.');
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500';

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <main className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <img src="/logo.png" alt="Staffing-Go logo" className="h-12 w-12 rounded-xl" draggable={false} />
          <div>
            <h1 className="text-2xl font-semibold leading-tight text-slate-900">Set up your account</h1>
            <p className="text-sm text-slate-500">Choose your name and password to sign in.</p>
          </div>
        </div>

        {loading && <p className="text-sm text-slate-500">Checking invite…</p>}

        {!loading && loadError && (
          <div className="space-y-4">
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {loadError}
            </div>
            <Link to="/login" className="text-sm font-medium text-indigo-700 hover:underline">
              Back to sign in
            </Link>
          </div>
        )}

        {!loading && !loadError && (
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">Email</label>
              <input type="email" value={email} readOnly className={`${inputClass} bg-slate-50 text-slate-600`} />
            </div>

            <div>
              <label htmlFor="invite-name" className="block text-sm font-medium text-slate-700">
                Name
              </label>
              <input
                id="invite-name"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
              />
              {fieldErrors.name && <p className="mt-1 text-xs text-rose-600">{fieldErrors.name}</p>}
            </div>

            <div>
              <label htmlFor="invite-password" className="block text-sm font-medium text-slate-700">
                Password
              </label>
              <input
                id="invite-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
              />
              {fieldErrors.password && (
                <p className="mt-1 text-xs text-rose-600">{fieldErrors.password}</p>
              )}
            </div>

            <div>
              <label htmlFor="invite-confirm" className="block text-sm font-medium text-slate-700">
                Confirm password
              </label>
              <input
                id="invite-confirm"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={inputClass}
              />
              {fieldErrors.confirmPassword && (
                <p className="mt-1 text-xs text-rose-600">{fieldErrors.confirmPassword}</p>
              )}
            </div>

            {error && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60"
            >
              {submitting ? 'Saving…' : 'Create password'}
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
