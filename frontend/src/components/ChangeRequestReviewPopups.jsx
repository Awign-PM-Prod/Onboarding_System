import { useEffect, useRef, useState } from 'react';
import DatePicker from './DatePicker';
import ModalOverlay from './ModalOverlay';

function dayAfter(yyyyMmDd) {
  const s = String(yyyyMmDd ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '';
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Shared Extend DOJ + joining status change review popups.
 * Used by Super Admin (read-only for rows routed to Approver PM) and Approver PMs.
 */
export default function ChangeRequestReviewPopups({
  listDoj,
  reviewDoj,
  listJoining,
  reviewJoining,
  readOnlyWhenRouted = false
}) {
  const [dojExtendRequests, setDojExtendRequests] = useState([]);
  const [dojExtendReviewingId, setDojExtendReviewingId] = useState(null);
  const [showDojExtendPopup, setShowDojExtendPopup] = useState(false);
  const [dojMaxByRequestId, setDojMaxByRequestId] = useState({});
  const dojExtendDismissedRef = useRef(false);

  const [joiningStatusChangeRequests, setJoiningStatusChangeRequests] = useState([]);
  const [joiningStatusChangeReviewingId, setJoiningStatusChangeReviewingId] = useState(null);
  const [showJoiningStatusChangePopup, setShowJoiningStatusChangePopup] = useState(false);
  const joiningStatusChangeDismissedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const loadDojExtendRequests = async () => {
      try {
        const payload = await listDoj();
        if (cancelled) return;
        const rows = Array.isArray(payload?.requests) ? payload.requests : [];
        setDojExtendRequests(rows);
        if (rows.length > 0 && !dojExtendDismissedRef.current) {
          setShowDojExtendPopup(true);
        } else if (rows.length === 0) {
          dojExtendDismissedRef.current = false;
          setShowDojExtendPopup(false);
        }
      } catch {
        // Non-blocking
      }
    };

    const loadJoiningStatusChangeRequests = async () => {
      try {
        const payload = await listJoining();
        if (cancelled) return;
        const rows = Array.isArray(payload?.requests) ? payload.requests : [];
        setJoiningStatusChangeRequests(rows);
        if (rows.length > 0 && !joiningStatusChangeDismissedRef.current) {
          setShowJoiningStatusChangePopup(true);
        } else if (rows.length === 0) {
          joiningStatusChangeDismissedRef.current = false;
          setShowJoiningStatusChangePopup(false);
        }
      } catch {
        // Non-blocking
      }
    };

    const loadAll = () => {
      loadDojExtendRequests();
      loadJoiningStatusChangeRequests();
    };

    loadAll();
    const onFocus = () => loadAll();
    window.addEventListener('focus', onFocus);
    const intervalId = window.setInterval(loadAll, 90_000);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', onFocus);
      window.clearInterval(intervalId);
    };
  }, [listDoj, listJoining]);

  const reviewDojExtendRequest = async (requestId, decision) => {
    if (dojExtendReviewingId) return;
    const row = dojExtendRequests.find((r) => r.id === requestId);
    if (readOnlyWhenRouted && row?.review_by_approver_pm) return;

    const maxAllowedDoj =
      decision === 'APPROVED'
        ? String(dojMaxByRequestId[requestId] ?? '').trim()
        : null;
    if (decision === 'APPROVED') {
      if (!maxAllowedDoj) {
        window.alert('Enter a max allowed DOJ before approving.');
        return;
      }
      const minDate = dayAfter(row?.date_of_joining);
      if (minDate && maxAllowedDoj < minDate) {
        window.alert(`Max allowed DOJ must be on or after ${minDate}.`);
        return;
      }
    }
    setDojExtendReviewingId(requestId);
    try {
      await reviewDoj(requestId, {
        decision,
        maxAllowedDoj: maxAllowedDoj || undefined
      });
      setDojExtendRequests((prev) => prev.filter((r) => r.id !== requestId));
      setDojMaxByRequestId((prev) => {
        const next = { ...prev };
        delete next[requestId];
        return next;
      });
    } catch (err) {
      window.alert(err?.message || `Could not ${decision === 'APPROVED' ? 'approve' : 'reject'} request.`);
    } finally {
      setDojExtendReviewingId(null);
    }
  };

  const reviewJoiningStatusChangeRequest = async (requestId, decision) => {
    if (joiningStatusChangeReviewingId) return;
    const row = joiningStatusChangeRequests.find((r) => r.id === requestId);
    if (readOnlyWhenRouted && row?.review_by_approver_pm) return;

    setJoiningStatusChangeReviewingId(requestId);
    try {
      await reviewJoining(requestId, { decision });
      setJoiningStatusChangeRequests((prev) => prev.filter((r) => r.id !== requestId));
    } catch (err) {
      window.alert(err?.message || `Could not ${decision === 'APPROVED' ? 'approve' : 'reject'} request.`);
    } finally {
      setJoiningStatusChangeReviewingId(null);
    }
  };

  const renderActions = (row, reviewingId, onApprove, onReject) => {
    if (readOnlyWhenRouted && row.review_by_approver_pm) {
      return (
        <span className="inline-flex max-w-[12rem] rounded-md bg-amber-50 px-2 py-1 text-left text-xs font-medium text-amber-800 ring-1 ring-amber-200">
          Assigned to Approver PM: {row.assigned_approver_pm_name || row.approver_pm_name || 'PM'}
        </span>
      );
    }
    return (
      <div className="inline-flex gap-1.5">
        <button
          type="button"
          disabled={reviewingId === row.id}
          onClick={onApprove}
          className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          Approve
        </button>
        <button
          type="button"
          disabled={reviewingId === row.id}
          onClick={onReject}
          className="rounded-md bg-rose-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-rose-700 disabled:opacity-60"
        >
          Reject
        </button>
      </div>
    );
  };

  return (
    <>
      {showDojExtendPopup && dojExtendRequests.length > 0 && (
        <ModalOverlay
          onClose={() => {
            dojExtendDismissedRef.current = true;
            setShowDojExtendPopup(false);
          }}
          backdropClassName="bg-slate-900/50"
        >
          <div className="w-full max-w-4xl rounded-xl bg-white p-5 shadow-2xl">
            <h3 className="text-lg font-semibold text-slate-900">Extend DOJ requests</h3>
            <p className="mt-1 text-sm text-slate-600">
              Approve with a max allowed DOJ. The PM may set any new DOJ on or before that date within
              48 hours.
            </p>
            <div className="mt-4 max-h-96 overflow-auto rounded-lg border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-slate-700">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Employee</th>
                    <th className="px-3 py-2 text-left font-medium">Client</th>
                    <th className="px-3 py-2 text-left font-medium">Current DOJ</th>
                    <th className="px-3 py-2 text-left font-medium">Max allowed DOJ</th>
                    <th className="px-3 py-2 text-left font-medium">Requested by</th>
                    <th className="px-3 py-2 text-left font-medium">Reason</th>
                    <th className="px-3 py-2 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {dojExtendRequests.map((row) => {
                    const minMax = dayAfter(row.date_of_joining);
                    const routed = readOnlyWhenRouted && row.review_by_approver_pm;
                    return (
                      <tr key={row.id}>
                        <td className="px-3 py-2 text-slate-800">
                          <div className="font-medium">{row.employee_name}</div>
                          {row.employee_mobile ? (
                            <div className="text-xs text-slate-500">{row.employee_mobile}</div>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-slate-700">{row.client_name}</td>
                        <td className="px-3 py-2 text-slate-700">{row.date_of_joining || '—'}</td>
                        <td className="px-3 py-2">
                          {routed ? (
                            <span className="text-xs text-slate-400">—</span>
                          ) : (
                            <DatePicker
                              min={minMax || undefined}
                              value={dojMaxByRequestId[row.id] ?? ''}
                              onChange={(next) =>
                                setDojMaxByRequestId((prev) => ({
                                  ...prev,
                                  [row.id]: next
                                }))
                              }
                              aria-label="Max allowed DOJ"
                              className="w-full min-w-[9.5rem] rounded border border-slate-300 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-300"
                            />
                          )}
                        </td>
                        <td className="px-3 py-2 text-slate-700">{row.requested_by_name}</td>
                        <td className="max-w-[10rem] truncate px-3 py-2 text-slate-600" title={row.reason || ''}>
                          {row.reason || '—'}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {renderActions(
                            row,
                            dojExtendReviewingId,
                            () => reviewDojExtendRequest(row.id, 'APPROVED'),
                            () => reviewDojExtendRequest(row.id, 'REJECTED')
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  dojExtendDismissedRef.current = true;
                  setShowDojExtendPopup(false);
                }}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {(!showDojExtendPopup || dojExtendRequests.length === 0) &&
        showJoiningStatusChangePopup &&
        joiningStatusChangeRequests.length > 0 && (
        <ModalOverlay
          onClose={() => {
            joiningStatusChangeDismissedRef.current = true;
            setShowJoiningStatusChangePopup(false);
          }}
          backdropClassName="bg-slate-900/50"
        >
          <div className="w-full max-w-3xl rounded-xl bg-white p-5 shadow-2xl">
            <h3 className="text-lg font-semibold text-slate-900">Joining status change requests</h3>
            <p className="mt-1 text-sm text-slate-600">
              Approve to allow a one-time joining status change for that employee. Unlock expires in 48
              hours if unused.
            </p>
            <div className="mt-4 max-h-80 overflow-auto rounded-lg border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-slate-700">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Employee</th>
                    <th className="px-3 py-2 text-left font-medium">Client</th>
                    <th className="px-3 py-2 text-left font-medium">Current status</th>
                    <th className="px-3 py-2 text-left font-medium">Requested by</th>
                    <th className="px-3 py-2 text-left font-medium">Reason</th>
                    <th className="px-3 py-2 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {joiningStatusChangeRequests.map((row) => (
                    <tr key={row.id}>
                      <td className="px-3 py-2 text-slate-800">
                        <div className="font-medium">{row.employee_name}</div>
                        {row.employee_mobile ? (
                          <div className="text-xs text-slate-500">{row.employee_mobile}</div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-slate-700">{row.client_name}</td>
                      <td className="px-3 py-2 text-slate-700">{row.joining_status || '—'}</td>
                      <td className="px-3 py-2 text-slate-700">{row.requested_by_name}</td>
                      <td className="max-w-[10rem] truncate px-3 py-2 text-slate-600" title={row.reason || ''}>
                        {row.reason || '—'}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {renderActions(
                          row,
                          joiningStatusChangeReviewingId,
                          () => reviewJoiningStatusChangeRequest(row.id, 'APPROVED'),
                          () => reviewJoiningStatusChangeRequest(row.id, 'REJECTED')
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  joiningStatusChangeDismissedRef.current = true;
                  setShowJoiningStatusChangePopup(false);
                }}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </>
  );
}
