import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth, homeRouteForRole } from '../context/AuthContext';
import { api } from '../lib/api';

export default function Login() {
  const { signIn, session, profile, loading } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('payrolllead@test.com');
  const [password, setPassword] = useState('123456');
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSubmitting, setForgotSubmitting] = useState(false);
  const [forgotMessage, setForgotMessage] = useState('');
  const [forgotError, setForgotError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (location.state?.setPasswordSuccess) {
      setSuccess('Password saved. You can sign in with your new password.');
      if (location.state?.email) setEmail(location.state.email);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location, navigate]);

  useEffect(() => {
    if (!loading && session && profile) {
      navigate(homeRouteForRole(profile.role), { replace: true });
    }
  }, [loading, session, profile, navigate]);

  // Safety: re-enable the button if the auth flow doesn't finish within 20s
  // (normally sign-in completes in <1s; anything longer indicates a hang).
  useEffect(() => {
    if (!submitting) return;
    const t = setTimeout(() => {
      setSubmitting(false);
      setError(
        'Sign-in took too long. Make sure the backend is running at the URL in VITE_API_BASE_URL, then try again.'
      );
    }, 20_000);
    return () => clearTimeout(t);
  }, [submitting]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess('');
    setSubmitting(true);
    try {
      await signIn(email, password);
      // AuthContext loads profile after session is stored; the effect above
      // navigates once session + profile are ready.
    } catch (err) {
      setSubmitting(false);
      setError(err.message || 'Sign in failed');
    }
  };

  const onForgotSubmit = async (e) => {
    e.preventDefault();
    setForgotError('');
    setForgotMessage('');
    const target = forgotEmail.trim().toLowerCase();
    if (!target) {
      setForgotError('Enter your email address.');
      return;
    }
    setForgotSubmitting(true);
    try {
      const data = await api.requestStaffPasswordReset({ email: target });
      setForgotMessage(
        data?.message ||
          'If an account exists for that email, a password reset request was sent to Super Admin.'
      );
    } catch (err) {
      setForgotError(err.message || 'Could not submit request.');
    } finally {
      setForgotSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm bg-white p-8 rounded-lg shadow-sm border border-slate-200"
      >
        <div className="mb-6 flex items-center gap-3">
          <img src="/logo.png" alt="Staffing-Go logo" className="h-12 w-12 rounded-xl" draggable={false} />
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 leading-tight">Staffing-Go</h1>
            <p className="text-sm text-slate-500">Sign in to continue</p>
          </div>
        </div>

        <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />

        <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />

        <div className="mb-4 text-right">
          <button
            type="button"
            onClick={() => {
              setShowForgot((v) => !v);
              setForgotEmail(email);
              setForgotError('');
              setForgotMessage('');
            }}
            className="text-sm font-medium text-indigo-700 hover:underline"
          >
            Forgot password?
          </button>
        </div>

        {showForgot && (
          <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="mb-2 text-xs text-slate-600">
              Send a reset request to Super Admin. They will set a new password and email it to you.
            </p>
            <div className="space-y-2">
              <input
                type="email"
                placeholder="Your account email"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    onForgotSubmit(e);
                  }
                }}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
              {forgotError && (
                <div className="rounded border border-rose-200 bg-rose-50 px-2 py-1.5 text-xs text-rose-700">
                  {forgotError}
                </div>
              )}
              {forgotMessage && (
                <div className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs text-emerald-800">
                  {forgotMessage}
                </div>
              )}
              <button
                type="button"
                disabled={forgotSubmitting}
                onClick={onForgotSubmit}
                className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {forgotSubmitting ? 'Sending…' : 'Send reset request to Super Admin'}
              </button>
            </div>
          </div>
        )}

        {success && (
          <div className="mb-4 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            {success}
          </div>
        )}

        {error && (
          <div className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {submitting ? 'Signing in...' : 'Sign in'}
        </button>

        <div className="mt-4 space-y-1 text-xs text-slate-500">
          <p>
            Demo logins (all password <code>123456</code>):
          </p>
          <p>
            Payroll Lead: <code>payrolllead@test.com</code>
          </p>
          <p>
            Program Manager: <code>rahul.pm@test.com</code>
          </p>
        </div>
      </form>
    </div>
  );
}
