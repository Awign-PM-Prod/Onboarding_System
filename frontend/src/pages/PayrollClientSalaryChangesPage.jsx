import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { formatPayAmount } from '../lib/formatPay';
import ModalOverlay from '../components/ModalOverlay';

function formatWhen(iso) {
  const raw = String(iso ?? '').trim();
  if (!raw) return '—';
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return raw;
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).format(dt);
}

function isImageMime(mime) {
  return String(mime ?? '').startsWith('image/');
}

export default function PayrollClientSalaryChangesPage() {
  const { id } = useParams();
  const [clients, setClients] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);
  const [reviewRow, setReviewRow] = useState(null);
  const [documentUrl, setDocumentUrl] = useState(null);
  const [documentMeta, setDocumentMeta] = useState(null);
  const [documentLoading, setDocumentLoading] = useState(false);
  const [documentError, setDocumentError] = useState('');
  const [reviewNote, setReviewNote] = useState('');
  const [decisionLoading, setDecisionLoading] = useState(false);
  const [decisionError, setDecisionError] = useState('');

  const client = useMemo(() => clients.find((c) => c.id === id) || null, [clients, id]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [clientRows, requestRows] = await Promise.all([
        api.listClients(),
        api.listSalaryChangeRequests(id, 'PENDING')
      ]);
      setClients(clientRows || []);
      setRequests(Array.isArray(requestRows) ? requestRows : []);
    } catch (err) {
      setError(err.message || 'Could not load salary change requests.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const closeReview = () => {
    if (decisionLoading) return;
    setReviewRow(null);
    setDocumentUrl(null);
    setDocumentMeta(null);
    setDocumentError('');
    setReviewNote('');
    setDecisionError('');
  };

  const openReview = async (row) => {
    setReviewRow(row);
    setReviewNote('');
    setDecisionError('');
    setDocumentUrl(null);
    setDocumentMeta(null);
    setDocumentError('');
    setDocumentLoading(true);
    try {
      const data = await api.getSalaryChangeDocumentUrl(row.id);
      setDocumentUrl(data?.url || null);
      setDocumentMeta({
        name: data?.document_name || row.document_name,
        mime: data?.document_mime || row.document_mime
      });
    } catch (err) {
      setDocumentError(err.message || 'Could not open supporting attachment.');
    } finally {
      setDocumentLoading(false);
    }
  };

  const submitDecision = async (decisionStatus) => {
    if (!reviewRow) return;
    const note = reviewNote.trim();
    if (decisionStatus === 'REJECTED' && !note) {
      setDecisionError('Add a review note when rejecting.');
      return;
    }
    setDecisionError('');
    setDecisionLoading(true);
    try {
      await api.reviewSalaryChange(reviewRow.id, {
        decision_status: decisionStatus,
        review_note: note
      });
      setToast(
        decisionStatus === 'APPROVED'
          ? `Salary change approved for ${reviewRow.employee_name || 'employee'}.`
          : `Salary change rejected for ${reviewRow.employee_name || 'employee'}.`
      );
      setTimeout(() => setToast(null), 3500);
      setDecisionLoading(false);
      setReviewRow(null);
      setDocumentUrl(null);
      setDocumentMeta(null);
      setReviewNote('');
      await load();
    } catch (err) {
      setDecisionError(err.message || 'Could not submit decision.');
      setDecisionLoading(false);
    }
  };

  return (
    <main className="mx-auto max-w-6xl px-4 pb-8 pt-4 sm:px-6">
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[110] max-w-md -translate-x-1/2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 shadow-lg">
          {toast}
        </div>
      )}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Salary Changes</h1>
        <p className="mt-1 text-sm text-slate-500">
          {client?.client_name || 'Client'}: Program Manager salary change requests waiting for Payroll Lead review.
        </p>
      </div>

      {loading && (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-500">
          Loading salary change requests...
        </div>
      )}
      {error && !loading && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>
      )}

      {!loading && !error && requests.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          No pending salary change requests for this client.
        </div>
      )}

      {!loading && !error && requests.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Employee</th>
                <th className="px-4 py-2 text-left font-medium">Current pay</th>
                <th className="px-4 py-2 text-left font-medium">Requested pay</th>
                <th className="px-4 py-2 text-left font-medium">Requested by</th>
                <th className="px-4 py-2 text-left font-medium">Requested at</th>
                <th className="px-4 py-2 text-left font-medium">Reason</th>
                <th className="px-4 py-2 text-left font-medium">Attachment</th>
                <th className="px-4 py-2 text-left font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {requests.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3 text-slate-900">
                    <div className="font-medium">{row.employee_name || '—'}</div>
                    <div className="text-xs text-slate-500">
                      {row.employee_emp_code || row.employee_reference_id || row.employee_designation || ''}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {formatPayAmount(row.current_pay_type, row.current_ctc_type, row.current_ctc_value)}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {formatPayAmount(row.to_pay_type, row.to_ctc_type, row.to_ctc_value)}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{row.requested_by_name || '—'}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-slate-700">{formatWhen(row.created_at)}</td>
                  <td className="max-w-xs px-4 py-3 text-slate-700">
                    <span className="line-clamp-3" title={row.reason || ''}>
                      {row.reason || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{row.document_name || '—'}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => openReview(row)}
                      className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
                    >
                      Review
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {reviewRow && (
        <ModalOverlay onClose={closeReview}>
          <div className="mx-auto w-full max-w-2xl rounded-lg bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
              <h3 className="font-semibold text-slate-900">
                Review salary change — {reviewRow.employee_name || ''}
              </h3>
              <button
                type="button"
                onClick={closeReview}
                className="text-slate-500 hover:text-slate-700"
                aria-label="Close"
              >
                x
              </button>
            </div>
            <div className="space-y-4 px-5 py-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Current pay</p>
                  <p className="mt-1 text-sm text-slate-800">
                    {formatPayAmount(
                      reviewRow.current_pay_type,
                      reviewRow.current_ctc_type,
                      reviewRow.current_ctc_value
                    )}
                  </p>
                </div>
                <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-indigo-600">Requested pay</p>
                  <p className="mt-1 text-sm font-medium text-indigo-900">
                    {formatPayAmount(reviewRow.to_pay_type, reviewRow.to_ctc_type, reviewRow.to_ctc_value)}
                  </p>
                </div>
              </div>
              <p className="text-sm text-slate-600">
                Requested by {reviewRow.requested_by_name || 'Program Manager'} on {formatWhen(reviewRow.created_at)}
              </p>
              {reviewRow.reason ? (
                <p className="text-sm text-slate-700">
                  <span className="font-medium">Reason: </span>
                  {reviewRow.reason}
                </p>
              ) : null}

              <div>
                <p className="mb-2 text-sm font-medium text-slate-800">Supporting attachment</p>
                {documentLoading && <p className="text-sm text-slate-500">Loading attachment…</p>}
                {documentError && <p className="text-sm text-rose-600">{documentError}</p>}
                {!documentLoading && documentUrl && (
                  <div className="space-y-2">
                    {isImageMime(documentMeta?.mime) ? (
                      <img
                        src={documentUrl}
                        alt={documentMeta?.name || 'Supporting attachment'}
                        className="max-h-80 w-full rounded-md border border-slate-200 object-contain bg-slate-50"
                      />
                    ) : null}
                    <a
                      href={documentUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex text-sm font-medium text-indigo-700 hover:text-indigo-900"
                    >
                      Open {documentMeta?.name || 'attachment'}
                    </a>
                  </div>
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Review note {reviewNote.trim() ? '' : '(required to reject)'}
                </label>
                <textarea
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  rows={3}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  placeholder="Optional on approve. Required when rejecting."
                />
              </div>
              {decisionError && <p className="text-sm text-rose-600">{decisionError}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={closeReview}
                  disabled={decisionLoading}
                  className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => submitDecision('REJECTED')}
                  disabled={decisionLoading}
                  className="rounded-md bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
                >
                  {decisionLoading ? 'Submitting...' : 'Reject'}
                </button>
                <button
                  type="button"
                  onClick={() => submitDecision('APPROVED')}
                  disabled={decisionLoading}
                  className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {decisionLoading ? 'Submitting...' : 'Approve'}
                </button>
              </div>
            </div>
          </div>
        </ModalOverlay>
      )}
    </main>
  );
}
