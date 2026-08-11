import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { ACTION_BTN_FILE, ACTION_BTN_SECONDARY } from '../lib/actionButtonStyles';
import {
  downloadBulkAlertTemplate,
  MAX_BULK_ALERT_ROWS,
  parseBulkAlertCsvText
} from '../lib/bulkAlertCsv';

const MODES = [
  { value: 'single', label: 'Specific employee' },
  { value: 'bulk', label: 'Bulk CSV' }
];

export default function PmBulkAlertsPage() {
  const [mode, setMode] = useState('single');
  const [clients, setClients] = useState([]);
  const [clientId, setClientId] = useState('');
  const [employees, setEmployees] = useState([]);
  const [employeeId, setEmployeeId] = useState('');
  const [loadingClients, setLoadingClients] = useState(true);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [csvRows, setCsvRows] = useState([]);
  const [csvErrors, setCsvErrors] = useState([]);
  const [csvFileName, setCsvFileName] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [result, setResult] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingClients(true);
      setError('');
      try {
        const rows = await api.listPmClients();
        if (cancelled) return;
        setClients(Array.isArray(rows) ? rows : []);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Could not load clients.');
      } finally {
        if (!cancelled) setLoadingClients(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!clientId) {
      setEmployees([]);
      setEmployeeId('');
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingEmployees(true);
      setFormError('');
      try {
        const rows = await api.listEmployees(clientId);
        if (cancelled) return;
        setEmployees(Array.isArray(rows) ? rows : []);
        setEmployeeId('');
      } catch (err) {
        if (!cancelled) {
          setEmployees([]);
          setFormError(err.message || 'Could not load employees.');
        }
      } finally {
        if (!cancelled) setLoadingEmployees(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  const clientsSorted = useMemo(
    () =>
      [...clients].sort((a, b) =>
        String(a.client_name || '').localeCompare(String(b.client_name || ''))
      ),
    [clients]
  );

  const employeesWithEmail = useMemo(
    () =>
      employees
        .filter((e) => String(e.email || '').trim())
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))),
    [employees]
  );

  const selectedEmployee = useMemo(
    () => employeesWithEmail.find((e) => e.id === employeeId) || null,
    [employeesWithEmail, employeeId]
  );

  const validCsvRecipients = useMemo(
    () => csvRows.filter((r) => r.valid).map((r) => ({ name: r.name, email: r.email })),
    [csvRows]
  );

  const invalidCsvCount = csvRows.filter((r) => !r.valid).length;

  const resetForm = () => {
    setMode('single');
    setClientId('');
    setEmployeeId('');
    setEmployees([]);
    setSubject('');
    setMessage('');
    setCsvRows([]);
    setCsvErrors([]);
    setCsvFileName('');
    setFormError('');
  };

  const handleCsvFile = async (file) => {
    setFormError('');
    setResult(null);
    setCsvRows([]);
    setCsvErrors([]);
    setCsvFileName(file?.name || '');
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseBulkAlertCsvText(text);
      setCsvRows(parsed.rows);
      setCsvErrors(parsed.errors);
      if (parsed.rows.length === 0) {
        setFormError('No recipient rows found in the CSV.');
      }
    } catch (err) {
      setFormError(err.message || 'Could not parse CSV.');
    }
  };

  const handleSend = async () => {
    setFormError('');
    setError('');
    setResult(null);

    const trimmedMessage = message.trim();
    if (!trimmedMessage) {
      setFormError('Message is required.');
      return;
    }

    let payload;
    if (mode === 'single') {
      if (!employeeId) {
        setFormError('Select an employee.');
        return;
      }
      payload = {
        mode: 'single',
        employee_id: employeeId,
        message: trimmedMessage,
        subject: subject.trim() || undefined
      };
    } else {
      if (validCsvRecipients.length === 0) {
        setFormError('Upload a CSV with at least one valid name and email.');
        return;
      }
      if (validCsvRecipients.length > MAX_BULK_ALERT_ROWS) {
        setFormError(`Bulk send supports at most ${MAX_BULK_ALERT_ROWS} recipients.`);
        return;
      }
      payload = {
        mode: 'bulk',
        recipients: validCsvRecipients,
        message: trimmedMessage,
        subject: subject.trim() || undefined
      };
    }

    setSending(true);
    try {
      const data = await api.sendPmBulkAlert(payload);
      setResult(data);
      if (mode === 'single') {
        setEmployeeId('');
        setMessage('');
        setSubject('');
      } else {
        setCsvRows([]);
        setCsvErrors([]);
        setCsvFileName('');
        setMessage('');
        setSubject('');
      }
    } catch (err) {
      setFormError(err.message || 'Could not send alerts.');
    } finally {
      setSending(false);
    }
  };

  const failedDetails = Array.isArray(result?.details)
    ? result.details.filter((d) => d.status === 'failed')
    : [];

  const canSend =
    mode === 'single'
      ? Boolean(employeeId && message.trim())
      : Boolean(validCsvRecipients.length > 0 && message.trim());

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Bulk Alerts</h1>
        <p className="mt-1 text-sm text-slate-500">
          Email updates to a specific employee or a list from CSV. Messages are sent via Resend.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      )}

      {loadingClients && (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-500 shadow-sm">
          Loading clients…
        </div>
      )}

      {!loadingClients && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-base font-semibold text-slate-900">Recipients</h2>

          <fieldset className="mt-4 space-y-3">
            <legend className="sr-only">Alert mode</legend>
            {MODES.map((opt) => {
              const selected = mode === opt.value;
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
                    name="alert-mode"
                    className="mt-1 accent-blue-600"
                    checked={selected}
                    onChange={() => {
                      setMode(opt.value);
                      setFormError('');
                      setResult(null);
                    }}
                  />
                  <span className="text-sm text-slate-800">{opt.label}</span>
                </label>
              );
            })}
          </fieldset>

          {mode === 'single' && (
            <div className="mt-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700" htmlFor="alert-client">
                  Client
                </label>
                <select
                  id="alert-client"
                  value={clientId}
                  onChange={(e) => {
                    setClientId(e.target.value);
                    setFormError('');
                  }}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">Select a client...</option>
                  {clientsSorted.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.client_name}
                      {c.contract_code ? ` (${c.contract_code})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700" htmlFor="alert-employee">
                  Employee
                </label>
                <select
                  id="alert-employee"
                  value={employeeId}
                  disabled={!clientId || loadingEmployees}
                  onChange={(e) => {
                    setEmployeeId(e.target.value);
                    setFormError('');
                  }}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-400"
                >
                  <option value="">
                    {!clientId
                      ? 'Select a client first...'
                      : loadingEmployees
                        ? 'Loading employees…'
                        : 'Select an employee...'}
                  </option>
                  {employeesWithEmail.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name || 'Unnamed'} — {e.email}
                    </option>
                  ))}
                </select>
                {clientId && !loadingEmployees && employeesWithEmail.length === 0 && (
                  <p className="mt-1 text-sm text-slate-500">
                    No employees with an email address for this client.
                  </p>
                )}
              </div>

              {selectedEmployee && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Name</label>
                    <input
                      type="text"
                      readOnly
                      value={selectedEmployee.name || ''}
                      className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Email</label>
                    <input
                      type="text"
                      readOnly
                      value={selectedEmployee.email || ''}
                      className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {mode === 'bulk' && (
            <div className="mt-5 space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={downloadBulkAlertTemplate}
                  className={ACTION_BTN_SECONDARY}
                >
                  Download CSV template
                </button>
                <span className="text-xs text-slate-500">
                  Columns: <code className="rounded bg-slate-100 px-1">name</code>,{' '}
                  <code className="rounded bg-slate-100 px-1">email</code>
                </span>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700" htmlFor="alert-csv">
                  Upload CSV
                </label>
                <input
                  id="alert-csv"
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => handleCsvFile(e.target.files?.[0] || null)}
                  className={`mt-1.5 ${ACTION_BTN_FILE}`}
                />
                {csvFileName && (
                  <p className="mt-1 text-xs text-slate-500">Selected: {csvFileName}</p>
                )}
              </div>

              {csvErrors.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  {csvErrors.map((msg) => (
                    <p key={msg}>{msg}</p>
                  ))}
                </div>
              )}

              {csvRows.length > 0 && (
                <div>
                  <p className="text-sm text-slate-600">
                    Valid: {validCsvRecipients.length} · Invalid / skipped: {invalidCsvCount}
                    {validCsvRecipients.length > MAX_BULK_ALERT_ROWS
                      ? ` (max ${MAX_BULK_ALERT_ROWS})`
                      : ''}
                  </p>
                  <div className="mt-2 max-h-56 overflow-auto rounded-lg border border-slate-200">
                    <table className="min-w-full text-left text-sm">
                      <thead className="sticky top-0 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-3 py-2">Name</th>
                          <th className="px-3 py-2">Email</th>
                          <th className="px-3 py-2">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {csvRows.slice(0, 50).map((row, idx) => (
                          <tr key={`${row.email}-${idx}`} className="border-t border-slate-100">
                            <td className="px-3 py-2 text-slate-800">{row.name || '—'}</td>
                            <td className="px-3 py-2 text-slate-800">{row.email || '—'}</td>
                            <td
                              className={`px-3 py-2 ${
                                row.valid ? 'text-emerald-700' : 'text-rose-700'
                              }`}
                            >
                              {row.valid ? 'OK' : row.reason || 'Invalid'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {csvRows.length > 50 && (
                      <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
                        Showing first 50 of {csvRows.length} rows.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="mt-6 space-y-4 border-t border-slate-100 pt-5">
            <div>
              <label className="block text-sm font-medium text-slate-700" htmlFor="alert-subject">
                Subject <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <input
                id="alert-subject"
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Update from Awign"
                maxLength={200}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700" htmlFor="alert-message">
                Message
              </label>
              <textarea
                id="alert-message"
                rows={5}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Write the update to send…"
                maxLength={5000}
                className="mt-1.5 w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
              <p className="mt-1 text-xs text-slate-500">{message.length}/5000</p>
            </div>
          </div>

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
              Reset
            </button>
            <button
              type="button"
              onClick={handleSend}
              disabled={sending || !canSend}
              className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sending ? 'Sending…' : 'Send'}
            </button>
          </div>
        </div>
      )}

      {result && (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <p className="font-medium">Alert send finished</p>
          <p className="mt-1">
            Sent: {result.sent ?? 0} · Skipped: {result.skipped ?? 0} · Failed: {result.failed ?? 0}
          </p>
          {failedDetails.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-rose-800">
              {failedDetails.map((d) => (
                <li key={`${d.email}-${d.error}`}>
                  {d.email || 'unknown'}: {d.error || 'failed'}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </main>
  );
}
