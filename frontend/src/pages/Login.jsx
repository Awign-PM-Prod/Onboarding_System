import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth, homeRouteForRole } from '../context/AuthContext';
import { api } from '../lib/api';

export default function Login() {
  const { signIn, session, profile, loading } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [credentialsUnlocked, setCredentialsUnlocked] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
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
        autoComplete="off"
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
          name="email"
          required
          value={email}
          readOnly={!credentialsUnlocked}
          autoComplete={credentialsUnlocked ? 'username' : 'off'}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          onFocus={() => setCredentialsUnlocked(true)}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />

        <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
        <div className="relative mb-2">
          <input
            type={showPassword ? 'text' : 'password'}
            name="password"
            required
            value={password}
            readOnly={!credentialsUnlocked}
            autoComplete={credentialsUnlocked ? 'current-password' : 'off'}
            onFocus={() => setCredentialsUnlocked(true)}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-slate-300 rounded-md px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-500 hover:text-slate-700"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
              </svg>
            )}
          </button>
        </div>

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
      </form>
    </div>
  );
}
