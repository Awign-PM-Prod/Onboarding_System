import { useEffect, useState } from 'react';
import { api } from '../lib/api';

const SCOPES = [
  { value: 'all', label: 'All Program Managers and Payroll Leads' },
  { value: 'role_pm', label: 'All Program Managers' },
  { value: 'role_pl', label: 'All Payroll Leads' },
  { value: 'user', label: 'Specific user' }
];

function roleLabel(role) {
  if (role === 'PROGRAM_MANAGER') return 'Program Manager';
  if (role === 'PAYROLL_LEAD') return 'Payroll Lead';
  return role || '—';
}

export default function SuperAdminTaskRemindersPage() {
  const [recipients, setRecipients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [scopeKey, setScopeKey] = useState('all');
  const [userId, setUserId] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const data = await api.listDigestRecipients();
        if (!cancelled) setRecipients(Array.isArray(data) ? data : []);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Could not load recipients.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const buildPayload = () => {
    if (scopeKey === 'all') return { scope: 'all' };
    if (scopeKey === 'role_pm') return { scope: 'role', role: 'PROGRAM_MANAGER' };
    if (scopeKey === 'role_pl') return { scope: 'role', role: 'PAYROLL_LEAD' };
    return { scope: 'user', userId };
  };

  const confirmMessage = () => {
    if (scopeKey === 'all') {
      return 'Send remaining-task digests to all Program Managers and Payroll Leads who have pending work?';
    }
    if (scopeKey === 'role_pm') {
      return 'Send remaining-task digests to all Program Managers who have pending work?';
    }
    if (scopeKey === 'role_pl') {
      return 'Send remaining-task digests to all Payroll Leads who have pending work?';
    }
    const user = recipients.find((r) => r.id === userId);
    const label = user ? `${user.name} (${user.email})` : 'the selected user';
    return `Send a remaining-task digest to ${label} if they have pending work?`;
  };

  const handleSend = async () => {
    setError('');
    setResult(null);

    if (scopeKey === 'user' && !userId) {
      setError('Select a Program Manager or Payroll Lead.');
      return;
    }

    if (!window.confirm(confirmMessage())) return;

    setSending(true);
    try {
      const data = await api.triggerRemainingTaskDigest(buildPayload());
      setResult(data);
    } catch (err) {
      setError(err.message || 'Could not send digests.');
    } finally {
      setSending(false);
    }
  };

  const failedDetails = Array.isArray(result?.details)
    ? result.details.filter((d) => d.status === 'failed')
    : [];

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Task Reminders</h1>
        <p className="mt-1 text-sm text-slate-500">
          Manually email remaining-task digests to Program Managers and Payroll Leads. Users with no
          pending work are skipped.
        </p>
      </div>

      {loading && (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-500 shadow-sm">
          Loading recipients…
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      )}

      {!loading && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium text-slate-900">Who should receive digests?</legend>
            {SCOPES.map((opt) => (
              <label
                key={opt.value}
                className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 px-3 py-2.5 hover:bg-slate-50"
              >
                <input
                  type="radio"
                  name="digest-scope"
                  className="mt-1"
                  checked={scopeKey === opt.value}
                  onChange={() => {
                    setScopeKey(opt.value);
                    setResult(null);
                    setError('');
                  }}
                />
                <span className="text-sm text-slate-800">{opt.label}</span>
              </label>
            ))}
          </fieldset>

          {scopeKey === 'user' && (
            <div className="mt-5 space-y-3 border-t border-slate-100 pt-5">
              <label className="block text-sm font-medium text-slate-900" htmlFor="user-select">
                Recipient
              </label>
              <select
                id="user-select"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                <option value="">Select a user…</option>
                {recipients.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} — {r.email} ({roleLabel(r.role)})
                  </option>
                ))}
              </select>
              {recipients.length === 0 && (
                <p className="text-sm text-slate-500">No Program Managers or Payroll Leads available.</p>
              )}
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleSend}
              disabled={sending || (scopeKey === 'user' && !userId)}
              className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sending ? 'Sending…' : 'Send digests'}
            </button>
            <p className="text-xs text-slate-500">
              {recipients.length} recipient{recipients.length === 1 ? '' : 's'} available
            </p>
          </div>
        </div>
      )}

      {result && (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <p className="font-medium">Digest run finished</p>
          <p className="mt-1">
            Sent: {result.sent ?? 0} · Skipped (no work / no email): {result.skipped ?? 0} · Failed:{' '}
            {result.failed ?? 0}
          </p>
          {failedDetails.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-rose-800">
              {failedDetails.map((d) => (
                <li key={`${d.user_id}-${d.email}`}>
                  {d.email || d.user_id}: {d.error || 'failed'}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </main>
  );
}
