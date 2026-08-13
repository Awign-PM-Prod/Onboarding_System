import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import ModalOverlay from '../components/ModalOverlay';
import { ACTION_BTN_PRIMARY } from '../lib/actionButtonStyles';

function roleLabel(role) {
  if (role === 'PROGRAM_MANAGER') return 'Program Manager';
  if (role === 'PAYROLL_LEAD') return 'Payroll Lead';
  return role || '—';
}

function formatRequestedAt(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

function PasswordVisibilityToggle({ visible, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-500 hover:text-slate-700"
      aria-label={visible ? 'Hide password' : 'Show password'}
    >
      {visible ? (
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
  );
}

export default function SuperAdminStaffAccountsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');

  const [resetUser, setResetUser] = useState(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [staff, requests] = await Promise.all([
        api.listSuperAdminStaffUsers(),
        api.listPasswordResetRequests('PENDING')
      ]);
      setUsers(Array.isArray(staff) ? staff : []);
      setPendingRequests(Array.isArray(requests) ? requests : []);
    } catch (err) {
      setError(err.message || 'Could not load staff accounts.');
      setUsers([]);
      setPendingRequests([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (location.state?.inviteSent) {
      const email = location.state.inviteEmail || 'the invitee';
      const role = location.state.inviteRole || 'staff member';
      setSuccess(`Invite sent to ${email}. They can set their name and password from the email link (${role}).`);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location, navigate]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const hay = `${u.name || ''} ${u.email || ''} ${u.role || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [users, search]);

  const openReset = (user) => {
    setResetUser(user);
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setShowConfirmPassword(false);
    setModalError('');
    setSuccess('');
  };

  const closeReset = () => {
    if (saving) return;
    setResetUser(null);
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setShowConfirmPassword(false);
    setModalError('');
  };

  const handleReset = async (e) => {
    e.preventDefault();
    if (!resetUser) return;
    setModalError('');

    if (!password || password.length < 6) {
      setModalError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setModalError('Passwords do not match.');
      return;
    }

    setSaving(true);
    try {
      const result = await api.resetSuperAdminStaffPassword(resetUser.id, {
        password,
        confirmPassword,
        sendEmail: true
      });
      const emailed = Boolean(result?.emailed);
      setSuccess(
        emailed
          ? `Password updated for ${resetUser.name || resetUser.email} and emailed to them.`
          : `Password updated for ${resetUser.name || resetUser.email}. Email could not be sent — share the password securely.`
      );
      setResetUser(null);
      setPassword('');
      setConfirmPassword('');
      await load();
    } catch (err) {
      setModalError(err.message || 'Could not reset password.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Staff Accounts</h1>
          <p className="mt-1 text-sm text-slate-500">
            Invite Program Managers and Payroll Leads by email and fulfill password reset requests for
            both roles.
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
          <div className="min-w-0 flex-1 sm:w-64 sm:flex-none">
            <input
              type="search"
              placeholder="Search by name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <Link
            to="/super-admin/staff-accounts/new"
            className={ACTION_BTN_PRIMARY}
          >
            Invite Program Manager
          </Link>
          <Link
            to="/super-admin/staff-accounts/new-payroll-lead"
            className={ACTION_BTN_PRIMARY}
          >
            Invite Payroll Lead
          </Link>
        </div>
      </div>

      {loading && (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-500 shadow-sm">
          Loading staff accounts…
        </div>
      )}

      {error && !loading && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          <span>{error}</span>
          <button type="button" onClick={load} className="text-sm underline">
            Retry
          </button>
        </div>
      )}

      {success && !loading && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          {success}
        </div>
      )}

      {!loading && !error && pendingRequests.length > 0 && (
        <div className="mb-6 overflow-hidden rounded-xl border border-amber-200 bg-white shadow-sm">
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-3">
            <h2 className="text-sm font-semibold text-amber-950">
              Pending password reset requests ({pendingRequests.length})
            </h2>
            <p className="mt-0.5 text-xs text-amber-800">
              Set a new password and email it to the requester.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">Name</th>
                  <th className="px-4 py-2.5 text-left font-medium">Email</th>
                  <th className="px-4 py-2.5 text-left font-medium">Role</th>
                  <th className="px-4 py-2.5 text-left font-medium">Requested</th>
                  <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pendingRequests.map((req) => (
                  <tr key={req.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{req.name || '—'}</td>
                    <td className="px-4 py-3 text-slate-700">{req.email}</td>
                    <td className="px-4 py-3 text-slate-700">{roleLabel(req.role)}</td>
                    <td className="px-4 py-3 text-slate-700">{formatRequestedAt(req.requested_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() =>
                          openReset({
                            id: req.user_id,
                            name: req.name,
                            email: req.email,
                            role: req.role
                          })
                        }
                        className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-950 hover:bg-amber-100"
                      >
                        Reset &amp; send
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <p className="font-medium text-slate-700">
            {search ? 'No staff match your search.' : 'No Program Managers or Payroll Leads found.'}
          </p>
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">
              {search
                ? `${filtered.length} result${filtered.length !== 1 ? 's' : ''}`
                : `${users.length} staff account${users.length !== 1 ? 's' : ''}`}
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">Name</th>
                  <th className="px-4 py-2.5 text-left font-medium">Email</th>
                  <th className="px-4 py-2.5 text-left font-medium">Role</th>
                  <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{user.name}</td>
                    <td className="px-4 py-3 text-slate-700">{user.email}</td>
                    <td className="px-4 py-3 text-slate-700">{roleLabel(user.role)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => openReset(user)}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50"
                      >
                        Reset password
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {resetUser && (
        <ModalOverlay onClose={closeReset}>
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-900">Reset password</h2>
            <p className="mt-1 text-sm text-slate-500">
              Set a new password for{' '}
              <span className="font-medium text-slate-800">{resetUser.name || resetUser.email}</span> (
              {resetUser.email}). It will be emailed to them after you save.
            </p>

            <form onSubmit={handleReset} className="mt-4 space-y-3">
              <div>
                <label htmlFor="staff-new-password" className="block text-sm font-medium text-slate-700">
                  New password
                </label>
                <div className="relative mt-1">
                  <input
                    id="staff-new-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 pr-10 text-sm"
                  />
                  <PasswordVisibilityToggle
                    visible={showPassword}
                    onToggle={() => setShowPassword((v) => !v)}
                  />
                </div>
              </div>
              <div>
                <label
                  htmlFor="staff-confirm-password"
                  className="block text-sm font-medium text-slate-700"
                >
                  Confirm password
                </label>
                <div className="relative mt-1">
                  <input
                    id="staff-confirm-password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 pr-10 text-sm"
                  />
                  <PasswordVisibilityToggle
                    visible={showConfirmPassword}
                    onToggle={() => setShowConfirmPassword((v) => !v)}
                  />
                </div>
              </div>

              {modalError && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {modalError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeReset}
                  disabled={saving}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save and send password'}
                </button>
              </div>
            </form>
          </div>
        </ModalOverlay>
      )}
    </main>
  );
}
