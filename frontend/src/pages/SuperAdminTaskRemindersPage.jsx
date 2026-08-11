import { useEffect, useMemo, useRef, useState } from 'react';
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

const INITIAL_FORM = {
  scopeKey: 'all',
  userId: '',
  clientId: '',
  remarks: ''
};

export default function SuperAdminTaskRemindersPage() {
  const [recipients, setRecipients] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [result, setResult] = useState(null);
  const [scopeKey, setScopeKey] = useState(INITIAL_FORM.scopeKey);
  const [userId, setUserId] = useState(INITIAL_FORM.userId);
  const [clientId, setClientId] = useState(INITIAL_FORM.clientId);
  const [remarks, setRemarks] = useState(INITIAL_FORM.remarks);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRootRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const [recipientRows, clientRows] = await Promise.all([
          api.listDigestRecipients(),
          api.listClients()
        ]);
        if (cancelled) return;
        setRecipients(Array.isArray(recipientRows) ? recipientRows : []);
        setClients(Array.isArray(clientRows) ? clientRows : []);
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

  useEffect(() => {
    if (!searchOpen) return undefined;
    const onPointerDown = (event) => {
      if (searchRootRef.current && !searchRootRef.current.contains(event.target)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [searchOpen]);

  const clientsWithPm = useMemo(
    () =>
      [...clients]
        .filter((c) => c?.id)
        .sort((a, b) =>
          String(a.client_name || '').localeCompare(String(b.client_name || ''))
        ),
    [clients]
  );

  const selectedClient = useMemo(
    () => clientsWithPm.find((c) => c.id === clientId) || null,
    [clientsWithPm, clientId]
  );

  const selectedRecipient = useMemo(
    () => recipients.find((r) => r.id === userId) || null,
    [recipients, userId]
  );

  const searchOptions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const clientOpts = clientsWithPm
      .filter((c) => {
        if (!q) return true;
        const hay = [
          c.client_name,
          c.contract_code,
          c.program_manager_name,
          c.program_manager?.name
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 20)
      .map((c) => ({
        key: `client:${c.id}`,
        kind: 'client',
        id: c.id,
        title: c.client_name || 'Unnamed client',
        subtitle: [
          c.contract_code,
          c.program_manager_name || c.program_manager?.name
            ? `PM: ${c.program_manager_name || c.program_manager?.name}`
            : 'No PM'
        ]
          .filter(Boolean)
          .join(' · ')
      }));

    const recipientOpts = recipients
      .filter((r) => {
        if (!q) return true;
        const hay = [r.name, r.email, roleLabel(r.role)].filter(Boolean).join(' ').toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 20)
      .map((r) => ({
        key: `user:${r.id}`,
        kind: 'user',
        id: r.id,
        title: r.name || r.email || 'Unnamed user',
        subtitle: [r.email, roleLabel(r.role)].filter(Boolean).join(' · ')
      }));

    return [...clientOpts, ...recipientOpts];
  }, [clientsWithPm, recipients, searchQuery]);

  const selectionLabel = useMemo(() => {
    if (selectedClient) {
      const pmName =
        selectedClient.program_manager_name ||
        selectedClient.program_manager?.name ||
        selectedRecipient?.name ||
        null;
      return pmName
        ? `${selectedClient.client_name} → ${pmName}`
        : selectedClient.client_name;
    }
    if (selectedRecipient) {
      return `${selectedRecipient.name} — ${selectedRecipient.email} (${roleLabel(selectedRecipient.role)})`;
    }
    if (userId) {
      return 'Assigned Program Manager (not in digest list)';
    }
    return '';
  }, [selectedClient, selectedRecipient, userId]);

  const resetForm = () => {
    setScopeKey(INITIAL_FORM.scopeKey);
    setUserId(INITIAL_FORM.userId);
    setClientId(INITIAL_FORM.clientId);
    setRemarks(INITIAL_FORM.remarks);
    setSearchQuery('');
    setSearchOpen(false);
    setFormError('');
  };

  const clearSelection = () => {
    setUserId('');
    setClientId('');
    setSearchQuery('');
    setFormError('');
  };

  const applySearchOption = (opt) => {
    setFormError('');
    setSearchOpen(false);
    setSearchQuery('');

    if (opt.kind === 'client') {
      setClientId(opt.id);
      const client = clientsWithPm.find((c) => c.id === opt.id);
      const pmId = client?.program_manager_id || client?.program_manager?.id || '';
      if (!pmId) {
        setUserId('');
        setFormError('Selected client has no Program Manager assigned.');
        return;
      }
      setUserId(pmId);
      return;
    }

    setClientId('');
    setUserId(opt.id);
  };

  const buildPayload = () => {
    if (scopeKey === 'all') return { scope: 'all' };
    if (scopeKey === 'role_pm') return { scope: 'role', role: 'PROGRAM_MANAGER' };
    if (scopeKey === 'role_pl') return { scope: 'role', role: 'PAYROLL_LEAD' };
    const payload = { scope: 'user', userId };
    const trimmed = remarks.trim();
    if (trimmed) payload.remarks = trimmed;
    return payload;
  };

  const handleSend = async () => {
    setFormError('');
    setError('');
    setResult(null);

    if (scopeKey === 'user' && !userId) {
      setFormError('Select a Program Manager or Payroll Lead.');
      return;
    }

    setSending(true);
    try {
      const data = await api.triggerRemainingTaskDigest(buildPayload());
      setResult(data);
      resetForm();
    } catch (err) {
      setFormError(err.message || 'Could not send digests.');
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

      {error && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      )}

      {loading && (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-500 shadow-sm">
          Loading recipients…
        </div>
      )}

      {!loading && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-base font-semibold text-slate-900">Who should receive digests?</h2>

          <fieldset className="mt-4 space-y-3">
            <legend className="sr-only">Digest recipients</legend>
            {SCOPES.map((opt) => {
              const selected = scopeKey === opt.value;
              return (
                <label
                  key={opt.value}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 ${
                    selected
                      ? 'border-blue-600 bg-blue-50/40'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="digest-scope"
                    className="mt-1 accent-blue-600"
                    checked={selected}
                    onChange={() => {
                      setScopeKey(opt.value);
                      setFormError('');
                      if (opt.value !== 'user') {
                        setUserId('');
                        setClientId('');
                        setRemarks('');
                        setSearchQuery('');
                        setSearchOpen(false);
                      }
                    }}
                  />
                  <span className="text-sm text-slate-800">{opt.label}</span>
                </label>
              );
            })}
          </fieldset>

          {scopeKey === 'user' && (
            <div className="mt-5 space-y-4">
              <div ref={searchRootRef} className="relative">
                <label className="block text-sm font-medium text-slate-700" htmlFor="user-search">
                  Search client or recipient
                </label>
                <input
                  id="user-search"
                  type="search"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setSearchOpen(true);
                  }}
                  onFocus={() => setSearchOpen(true)}
                  placeholder="Search by client, PM, or Payroll Lead…"
                  autoComplete="off"
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
                {searchOpen && (
                  <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                    {searchOptions.length === 0 ? (
                      <p className="px-3 py-2.5 text-sm text-slate-500">No matches found.</p>
                    ) : (
                      <ul className="py-1">
                        {searchOptions.map((opt) => (
                          <li key={opt.key}>
                            <button
                              type="button"
                              onClick={() => applySearchOption(opt)}
                              className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-slate-50"
                            >
                              <span className="mt-0.5 shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                                {opt.kind === 'client' ? 'Client' : 'Recipient'}
                              </span>
                              <span className="min-w-0">
                                <span className="block text-sm font-medium text-slate-800">
                                  {opt.title}
                                </span>
                                {opt.subtitle && (
                                  <span className="block text-xs text-slate-500">{opt.subtitle}</span>
                                )}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                <p className="mt-1 text-xs text-slate-500">
                  Pick a client to target their Program Manager, or pick a recipient directly.
                </p>
                {selectionLabel && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    <span>
                      Selected: <span className="font-medium">{selectionLabel}</span>
                    </span>
                    <button
                      type="button"
                      onClick={clearSelection}
                      className="text-xs font-medium text-blue-600 hover:text-blue-700"
                    >
                      Clear
                    </button>
                  </div>
                )}
                {recipients.length === 0 && clientsWithPm.length === 0 && (
                  <p className="mt-1 text-sm text-slate-500">
                    No clients or digest recipients available.
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700" htmlFor="remarks">
                  Remarks
                </label>
                <textarea
                  id="remarks"
                  rows={4}
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Add remarks..."
                  maxLength={2000}
                  className="mt-1.5 w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>
            </div>
          )}

          {formError && (
            <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {formError}
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={resetForm}
              disabled={sending}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSend}
              disabled={sending || (scopeKey === 'user' && !userId)}
              className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sending ? 'Sending…' : 'Send'}
            </button>
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
