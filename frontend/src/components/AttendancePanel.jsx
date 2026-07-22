import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import ModalOverlay from './ModalOverlay';
import {
  LEGEND_LABELS,
  LEGEND_TOTAL_COLUMNS,
  codeCellClass,
  displayCode,
  holidayFlagBorderClass,
  isPresentOnHolidayCode
} from '../lib/attendanceLegend';

const EDITABLE_CODES = [
  'P', 'W', 'NH', 'FH', 'P-NH', 'P-FH', 'HD',
  'EL', 'SL', 'CL', 'PL', 'ML', 'RH', 'CO', 'A', 'R', 'T', '-'
];

const LEAVE_TYPE_OPTIONS = [
  { value: '', label: 'All Types' },
  { value: 'EL', label: 'EL — Earned Leave' },
  { value: 'SL', label: 'SL — Sick Leave' },
  { value: 'CL', label: 'CL — Casual Leave' },
  { value: 'PL', label: 'PL — Privilege Leave' },
  { value: 'ML', label: 'ML — Maternity Leave' },
  { value: 'RH', label: 'RH — Restricted Holiday' },
  { value: 'CO', label: 'CO — Comp Off' },
  { value: 'A', label: 'A — Absent LOP' },
  { value: 'NH', label: 'NH — National Holiday' },
  { value: 'FH', label: 'FH — Festival Holiday' },
  { value: 'P-NH', label: 'P-NH — Present on National Holiday' },
  { value: 'P-FH', label: 'P-FH — Present on Festive Holiday' },
  { value: 'HD', label: 'HD — Half day' },
  { value: 'W', label: 'W — Week off' },
  { value: 'P', label: 'P — Present' }
];

function currentMonthValue() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonthLabel(monthDate) {
  if (!monthDate) return '—';
  const d = new Date(`${String(monthDate).slice(0, 10)}T00:00:00Z`);
  return d.toLocaleString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function dayHeaderLabel(isoDate) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  const day = d.getUTCDate();
  const weekday = d.toLocaleString('en-US', { weekday: 'short', timeZone: 'UTC' }).toUpperCase();
  return { day, weekday, text: `${day} ${weekday}` };
}

function daysForMonth(monthYm) {
  const m = String(monthYm ?? '').trim();
  if (!/^\d{4}-\d{2}$/.test(m)) return [];
  const year = Number(m.slice(0, 4));
  const mon = Number(m.slice(5, 7));
  const last = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  const out = [];
  for (let day = 1; day <= last; day += 1) {
    out.push(`${year}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
  }
  return out;
}

function isWeekendDate(isoDate) {
  const dow = new Date(`${isoDate}T00:00:00Z`).getUTCDay();
  return dow === 0 || dow === 6;
}

function toDateKey(raw) {
  const s = String(raw ?? '');
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function dayHeaderClass(isoDate) {
  if (isWeekendDate(isoDate)) {
    return 'border-b border-r border-[#F0E0C8] bg-[#FFF6E8] px-1.5 py-2 text-center font-medium text-[#C47A2C]';
  }
  return 'border-b border-r border-slate-200 bg-white px-1.5 py-2 text-center font-medium text-slate-700';
}

function dayBodyClass(isoDate) {
  if (isWeekendDate(isoDate)) {
    return 'border-b border-r border-[#F0E0C8] bg-[#FFFBF3] p-0.5 text-center';
  }
  return 'border-b border-r border-slate-100 bg-white p-0.5 text-center';
}

/**
 * Shared PM / PL attendance panel.
 * @param {{ clientId: string, role: 'PROGRAM_MANAGER' | 'PAYROLL_LEAD' }} props
 */
export default function AttendancePanel({ clientId, role }) {
  const isPl = role === 'PAYROLL_LEAD';
  const [month, setMonth] = useState(currentMonthValue);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [payload, setPayload] = useState(null);
  const [logs, setLogs] = useState([]);
  const [showLogs, setShowLogs] = useState(false);
  const [search, setSearch] = useState('');
  const [leaveType, setLeaveType] = useState('');
  const [sort, setSort] = useState({ key: null, direction: 'asc' });
  const [calendarView, setCalendarView] = useState('expanded'); // 'expanded' | 'collapsed'
  const [unlockMenuOpen, setUnlockMenuOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareSearch, setShareSearch] = useState('');
  const [shareSelectedIds, setShareSelectedIds] = useState(() => new Set());
  const unlockMenuRef = useRef(null);
  const [editingCell, setEditingCell] = useState(null); // { rowId, date }
  const [uploadSkipWarning, setUploadSkipWarning] = useState(null); // { imported, skipped, errors, failed?, message? }
  const [uploadSkipModalOpen, setUploadSkipModalOpen] = useState(false);

  const sheet = payload?.sheet ?? null;
  const rows = useMemo(() => payload?.rows ?? [], [payload]);
  const canEdit = Boolean(payload?.can_edit);
  const canLock = Boolean(payload?.can_lock);
  const canUnlock = Boolean(payload?.can_unlock);
  const canRequestEdit = Boolean(payload?.can_request_edit);

  const dayDates = useMemo(() => {
    const set = new Set();
    for (const row of rows) {
      for (const m of row.day_marks ?? []) {
        const key = toDateKey(m.mark_date);
        if (key) set.add(key);
      }
    }
    return Array.from(set).sort();
  }, [rows]);

  // Prefer the month of stored day marks so statuses align with calendar columns.
  const gridDayDates = useMemo(() => {
    const fromMarks = dayDates.length ? toDateKey(dayDates[0])?.slice(0, 7) : null;
    const fromSheet = sheet?.attendance_month
      ? String(sheet.attendance_month).slice(0, 7)
      : null;
    const monthYm = fromMarks || fromSheet || month;
    const full = daysForMonth(monthYm);
    return full.length ? full : dayDates;
  }, [sheet?.attendance_month, month, dayDates]);

  const client = payload?.client ?? null;
  const eligiblePms = useMemo(() => payload?.eligible_pms ?? [], [payload]);

  useEffect(() => {
    if (!unlockMenuOpen) return undefined;
    const onDocClick = (e) => {
      if (unlockMenuRef.current && !unlockMenuRef.current.contains(e.target)) {
        setUnlockMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [unlockMenuOpen]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const result = rows.filter((r) => {
      if (q) {
        const name = String(r.employee_name_snapshot ?? '').toLowerCase();
        const code = String(r.emp_code ?? '').toLowerCase();
        if (!name.includes(q) && !code.includes(q)) return false;
      }
      if (leaveType) {
        const total = Number(r.legend_totals?.[leaveType] ?? 0);
        if (total > 0) return true;
        return (r.day_marks ?? []).some((m) => String(m.code ?? '').toUpperCase() === leaveType);
      }
      return true;
    });

    if (!sort.key) return result;
    const field = sort.key === 'emp_code' ? 'emp_code' : 'employee_name_snapshot';
    const direction = sort.direction === 'desc' ? -1 : 1;
    return [...result].sort((a, b) =>
      String(a[field] ?? '').localeCompare(String(b[field] ?? ''), undefined, {
        numeric: true,
        sensitivity: 'base'
      }) * direction
    );
  }, [rows, search, leaveType, sort]);

  const toggleSort = (key) => {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    setUploadSkipWarning(null);
    setUploadSkipModalOpen(false);
  }, [clientId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await api.getAttendance({ clientId, month });
        if (cancelled) return;
        setPayload(data);
        if (data?.sheet?.id) {
          try {
            const logRows = await api.getAttendanceLogs({ clientId, sheetId: data.sheet.id });
            if (!cancelled) setLogs(Array.isArray(logRows) ? logRows : []);
          } catch {
            if (!cancelled) setLogs([]);
          }
        } else if (!cancelled) {
          setLogs([]);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
          setPayload(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId, month]);

  const onUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!canEdit && sheet) {
      setError('Sheet is locked. Unlock before uploading.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await api.uploadAttendance({ clientId, month, file });
      const sheetMonth = result.sheet?.attendance_month
        ? String(result.sheet.attendance_month).slice(0, 7)
        : null;
      if (sheetMonth && sheetMonth !== month) {
        setMonth(sheetMonth);
      }
      setPayload(result);
      if (result.sheet?.id) {
        const logRows = await api.getAttendanceLogs({ clientId, sheetId: result.sheet.id });
        setLogs(Array.isArray(logRows) ? logRows : []);
      }
      const skippedCount = Number(result.skipped ?? 0);
      const errorList = Array.isArray(result.errors) ? result.errors : [];
      if (skippedCount > 0 || errorList.some((x) => x?.emp_code || x?.error)) {
        setUploadSkipWarning({
          imported: Number(result.imported ?? 0),
          skipped: skippedCount,
          errors: errorList
        });
        showToast(`Imported ${result.imported ?? 0} rows (${skippedCount} skipped)`);
      } else {
        setUploadSkipWarning(null);
        showToast(`Imported ${result.imported ?? 0} rows`);
      }
    } catch (err) {
      setError(err.message);
      if (err.details && Array.isArray(err.details) && err.details.length) {
        setUploadSkipWarning({
          imported: 0,
          skipped: err.details.length,
          errors: err.details,
          failed: true,
          message: err.message
        });
      }
    } finally {
      setBusy(false);
    }
  };

  const refreshAfterAction = async () => {
    const data = await api.getAttendance({ clientId, month });
    setPayload(data);
    if (data?.sheet?.id) {
      try {
        const logRows = await api.getAttendanceLogs({ clientId, sheetId: data.sheet.id });
        setLogs(Array.isArray(logRows) ? logRows : []);
      } catch {
        /* ignore */
      }
    } else {
      setLogs([]);
    }
  };

  const showSkipWarningPopup = () => {
    if (uploadSkipWarning) setUploadSkipModalOpen(true);
  };

  const onSubmit = async () => {
    if (!sheet?.id || !canEdit) return;
    showSkipWarningPopup();
    setBusy(true);
    setError(null);
    try {
      await api.submitAttendance({ clientId, sheetId: sheet.id });
      await refreshAfterAction();
      showToast(sheet.status === 'SUBMITTED' ? 'Attendance resubmitted' : 'Attendance submitted');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const onLock = async () => {
    if (!sheet?.id || !canLock) return;
    showSkipWarningPopup();
    setBusy(true);
    setError(null);
    try {
      await api.lockAttendance({ clientId, sheetId: sheet.id });
      await refreshAfterAction();
      showToast('Attendance locked');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const onUnlockWithScope = async (scope, userIds) => {
    if (!sheet?.id || !canUnlock) return;
    setBusy(true);
    setError(null);
    setUnlockMenuOpen(false);
    try {
      await api.unlockAttendance({
        clientId,
        sheetId: sheet.id,
        scope,
        userIds
      });
      await refreshAfterAction();
      setShareModalOpen(false);
      setShareSelectedIds(new Set());
      setShareSearch('');
      const label =
        scope === 'PL_ONLY' ? 'Unlocked for you only' : scope === 'ALL_PMS' ? 'Unlocked for everyone' : 'Edit access shared';
      showToast(label);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const openShareModal = () => {
    setUnlockMenuOpen(false);
    setShareSearch('');
    setShareSelectedIds(new Set(eligiblePms.map((p) => p.id)));
    setShareModalOpen(true);
  };

  const onRequestEdit = async () => {
    if (!sheet?.id || !canRequestEdit) return;
    if (sheet.unlock_request_status === 'PENDING') return;
    setBusy(true);
    setError(null);
    try {
      await api.requestAttendanceEdit({ clientId, sheetId: sheet.id });
      await refreshAfterAction();
      showToast('Edit access requested — Payroll Lead notified');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const onChangeCell = async (rowId, date, code) => {
    if (!sheet?.id || !canEdit) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.patchAttendanceDay({
        clientId,
        sheetId: sheet.id,
        rowId,
        date,
        code
      });
      setPayload((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          sheet: prev.sheet?.status === 'SUBMITTED'
            ? { ...prev.sheet, status: 'DRAFT' }
            : prev.sheet,
          rows: (prev.rows ?? []).map((r) => {
            if (r.id !== rowId) return r;
            const marks = [...(r.day_marks ?? [])];
            const idx = marks.findIndex((m) => m.mark_date === date);
            if (idx >= 0) marks[idx] = { ...marks[idx], code: result.code };
            else marks.push({ mark_date: date, code: result.code });
            return {
              ...r,
              day_marks: marks,
              legend_totals: result.legend_totals ?? r.legend_totals
            };
          })
        };
      });
      setEditingCell(null);
      showToast('Cell updated');
      const logRows = await api.getAttendanceLogs({ clientId, sheetId: sheet.id });
      setLogs(Array.isArray(logRows) ? logRows : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const markFor = (row, date) => {
    const key = toDateKey(date);
    if (!key) return '-';
    const marks = row.day_marks ?? [];
    const exact = marks.find((d) => toDateKey(d.mark_date) === key);
    if (exact) return exact.code ?? '-';
    // Fallback: same day-of-month if mark dates were stored under a different month
    const day = key.slice(8, 10);
    const byDom = marks.find((d) => toDateKey(d.mark_date)?.slice(8, 10) === day);
    return byDom?.code ?? '-';
  };

  return (
    <div className="space-y-4">
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[110] max-w-md -translate-x-1/2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900 shadow-lg">
          {toast}
        </div>
      )}

      {uploadSkipModalOpen && uploadSkipWarning && (
        <ModalOverlay
          className="pointer-events-none"
          backdropClassName="bg-slate-900/40"
          onClose={() => setUploadSkipModalOpen(false)}
        >
          <div
            role="document"
            aria-labelledby="attendance-skip-title"
            className="pointer-events-auto w-full max-w-lg rounded-xl bg-white p-5 shadow-2xl"
          >
            <h3 id="attendance-skip-title" className="text-lg font-semibold text-slate-900">
              {uploadSkipWarning.failed ? 'Upload incomplete' : 'Some rows were not uploaded'}
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              {uploadSkipWarning.message
                ? uploadSkipWarning.message
                : `${uploadSkipWarning.skipped} row(s) from the CSV were skipped and were not uploaded.`}
              {uploadSkipWarning.imported > 0
                ? ` ${uploadSkipWarning.imported} matching row(s) were imported successfully.`
                : ''}
            </p>
            {Array.isArray(uploadSkipWarning.errors) && uploadSkipWarning.errors.length > 0 && (
              <div className="mt-4 max-h-56 overflow-auto rounded-lg border border-slate-200">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Emp Code</th>
                      <th className="px-3 py-2 text-left font-medium">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {uploadSkipWarning.errors.slice(0, 100).map((err, idx) => (
                      <tr key={`${err?.emp_code || 'row'}-${idx}`}>
                        <td className="px-3 py-2 font-mono text-slate-800">
                          {err?.emp_code || (err?.row != null ? `Row ${err.row}` : '—')}
                        </td>
                        <td className="px-3 py-2 text-slate-600">
                          {err?.error || (Array.isArray(err?.errors) ? err.errors.join('; ') : 'Skipped')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setUploadSkipModalOpen(false)}
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                Proceed
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {shareModalOpen && (
        <ShareEditAccessModal
          busy={busy}
          search={shareSearch}
          onSearchChange={setShareSearch}
          people={eligiblePms}
          selectedIds={shareSelectedIds}
          onToggle={(id) => {
            setShareSelectedIds((prev) => {
              const next = new Set(prev);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              return next;
            });
          }}
          onClose={() => {
            if (busy) return;
            setShareModalOpen(false);
          }}
          onSend={() => onUnlockWithScope('SHARED', [...shareSelectedIds])}
        />
      )}

      <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">
            {client?.client_name || 'Attendance'}
          </h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Attendance · {formatMonthLabel(sheet?.attendance_month || `${month}-01`)}
          </p>
          {sheet && (
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <span className={`rounded-full px-2.5 py-0.5 font-medium ${
                sheet.status === 'SUBMITTED' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'
              }`}>
                {sheet.status}
              </span>
              <span className={`rounded-full px-2.5 py-0.5 font-medium ${
                sheet.locked ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-700'
              }`}>
                {sheet.locked
                  ? 'Locked'
                  : sheet.edit_scope === 'PL_ONLY'
                    ? 'Unlocked (PL only)'
                    : sheet.edit_scope === 'SHARED'
                      ? 'Unlocked (shared)'
                      : 'Unlocked'}
              </span>
              {sheet.unlock_request_status === 'PENDING' && (
                <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 font-medium text-indigo-800">
                  Edit request pending
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm text-slate-600">
            Attendance Month
            <input
              type="month"
              className="ml-2 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              value={month}
              onChange={(e) => {
                setUploadSkipWarning(null);
                setUploadSkipModalOpen(false);
                setMonth(e.target.value);
              }}
            />
          </label>
          <label className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-white ${
            busy || (sheet && !canEdit) ? 'bg-slate-400' : 'bg-blue-600 hover:bg-blue-700'
          }`}>
            <UploadIcon className="h-4 w-4" />
            Upload CSV
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              disabled={busy || (sheet && !canEdit)}
              onChange={onUpload}
            />
          </label>
          {sheet && (
            <button
              type="button"
              onClick={() => setShowLogs((v) => !v)}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              {showLogs ? 'Hide activity' : 'Activity log'}
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        <Meta label="Contract Code" value={sheet?.contract_code || client?.contract_code} />
        <Meta label="Client" value={client?.client_name} />
        <Meta label="Entity" value={sheet?.entity} />
        <Meta label="Cycle Type" value={sheet?.cycle_type} />
        <Meta label="Payroll Cycle" value={sheet?.payroll_cycle} />
        <Meta label="Salary Payout Date" value={sheet?.salary_payout_date} />
        <Meta label="Project Manager" value={sheet?.project_manager_name} />
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {showLogs && (
        <div className="max-h-56 overflow-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2 text-left font-medium">When</th>
                <th className="px-3 py-2 text-left font-medium">Action</th>
                <th className="px-3 py-2 text-left font-medium">By</th>
                <th className="px-3 py-2 text-left font-medium">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-slate-500">No activity yet.</td>
                </tr>
              ) : (
                logs.map((l) => (
                  <tr key={l.id}>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                      {l.created_at ? new Date(l.created_at).toLocaleString() : '—'}
                    </td>
                    <td className="px-3 py-2 font-medium text-slate-800">{l.action}</td>
                    <td className="px-3 py-2 text-slate-700">
                      {l.actor_name || l.actor_email || l.actor_role || '—'}
                    </td>
                    <td className="px-3 py-2 text-slate-600">{l.message || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          Loading attendance…
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="search"
                placeholder="Search employee name or code…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                disabled={!sheet}
                className="w-full max-w-xs rounded-md border border-slate-300 px-3 py-1.5 text-sm disabled:bg-slate-50 disabled:text-slate-400"
              />
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <span className="whitespace-nowrap">Leave Type:</span>
                <select
                  value={leaveType}
                  onChange={(e) => setLeaveType(e.target.value)}
                  disabled={!sheet}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 disabled:bg-slate-50 disabled:text-slate-400"
                >
                  {LEAVE_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value || 'all'} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {sheet && isPl && canLock && (
                <LockToggleButton locked disabled={busy} onClick={onLock} />
              )}
              {sheet && isPl && canUnlock && (
                <div className="relative" ref={unlockMenuRef}>
                  <UnlockMenuButton
                    disabled={busy}
                    open={unlockMenuOpen}
                    onToggle={() => setUnlockMenuOpen((v) => !v)}
                  />
                  {unlockMenuOpen && (
                    <div className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onUnlockWithScope('PL_ONLY')}
                        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-slate-800 hover:bg-slate-50"
                      >
                        <LockIcon className="h-4 w-4 text-slate-700" />
                        Only me
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onUnlockWithScope('ALL_PMS')}
                        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-slate-800 hover:bg-slate-50"
                      >
                        <GlobeIcon className="h-4 w-4 text-slate-700" />
                        Everyone
                      </button>
                      <div className="my-1 border-t border-slate-100" />
                      <button
                        type="button"
                        disabled={busy}
                        onClick={openShareModal}
                        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-slate-800 hover:bg-slate-50"
                      >
                        <UserPlusIcon className="h-4 w-4 text-slate-700" />
                        Share edit access
                      </button>
                    </div>
                  )}
                </div>
              )}
              {sheet && !isPl && canRequestEdit && (
                <button
                  type="button"
                  disabled={busy || sheet.unlock_request_status === 'PENDING'}
                  onClick={onRequestEdit}
                  className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
                >
                  {sheet.unlock_request_status === 'PENDING' ? 'Request pending' : 'Request edit access'}
                </button>
              )}
              {sheet && (
                <button
                  type="button"
                  disabled={busy || !canEdit}
                  onClick={onSubmit}
                  className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  {sheet.status === 'SUBMITTED' ? 'Resubmit attendance' : 'Submit attendance'}
                </button>
              )}
            </div>
          </div>

          {sheet && (
            <div className="flex justify-end">
              <CalendarViewToggle value={calendarView} onChange={setCalendarView} />
            </div>
          )}

          {sheet && <LegendBar />}

          {uploadSkipWarning && (
            <button
              type="button"
              onClick={() => setUploadSkipModalOpen(true)}
              className="w-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-left text-sm text-amber-900 hover:bg-amber-100"
            >
              <span className="font-semibold">
                {uploadSkipWarning.failed ? 'Upload incomplete' : 'Some rows were not uploaded'}
              </span>
              <span className="mt-0.5 block text-amber-800/90">
                {uploadSkipWarning.message
                  ? uploadSkipWarning.message
                  : `${uploadSkipWarning.skipped} row(s) skipped`}
                {uploadSkipWarning.imported > 0 ? ` · ${uploadSkipWarning.imported} imported` : ''}
                {' · '}
                <span className="underline">View details</span>
              </span>
            </button>
          )}

          <div className="max-h-[70vh] overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-max border-separate border-spacing-0 text-xs">
              <thead className="sticky top-0 z-40 bg-slate-50 shadow-[0_1px_0_0_rgb(226,232,240)]">
                <tr className="text-slate-600">
                  <th className="sticky left-0 top-0 z-50 w-10 min-w-[2.5rem] border-b border-slate-200 bg-slate-50 px-2 py-2 text-left font-medium">
                    S.No.
                  </th>
                  <th
                    aria-sort={sort.key === 'emp_code' ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                    className="sticky left-10 top-0 z-50 w-[5.5rem] min-w-[5.5rem] border-b border-slate-200 bg-slate-50 text-left font-medium"
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort('emp_code')}
                      className="flex w-full items-center gap-1 px-2 py-2 text-left hover:text-indigo-700"
                    >
                      Emp Code
                      <SortIndicator active={sort.key === 'emp_code'} direction={sort.direction} />
                    </button>
                  </th>
                  <th
                    aria-sort={sort.key === 'name' ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                    className="sticky left-[7.5rem] top-0 z-50 min-w-[9rem] max-w-[11rem] border-b border-r border-slate-200 bg-slate-50 text-left font-medium shadow-[2px_0_4px_-2px_rgba(0,0,0,0.12)]"
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort('name')}
                      className="flex w-full items-center gap-1 px-3 py-2 text-left hover:text-indigo-700"
                    >
                      Name
                      <SortIndicator active={sort.key === 'name'} direction={sort.direction} />
                    </button>
                  </th>
                  <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-2 py-2 text-left font-medium">Mobile</th>
                  <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-2 py-2 text-left font-medium">Gender</th>
                  <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-2 py-2 text-left font-medium">Designation</th>
                  <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-2 py-2 text-left font-medium">DOJ</th>
                  <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-2 py-2 text-left font-medium">LWD</th>
                  <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-2 py-2 text-left font-medium">Status</th>
                  <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-2 py-2 text-left font-medium">Amt. Type</th>
                  <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-2 py-2 text-left font-medium">Contract</th>
                  {calendarView === 'expanded' &&
                    gridDayDates.map((d) => {
                      const label = dayHeaderLabel(d);
                      return (
                        <th key={d} className={`min-w-[2.75rem] whitespace-nowrap ${dayHeaderClass(d)}`}>
                          {label.text}
                        </th>
                      );
                    })}
                  {LEGEND_TOTAL_COLUMNS.map((col) => (
                    <th key={`t-${col.code}`} className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-2 py-2 text-center font-medium text-slate-700">
                      {col.label}
                    </th>
                  ))}
                  <th className="border-b border-slate-200 bg-slate-50 px-2 py-2 text-center font-medium">Paid Days</th>
                  <th className="border-b border-slate-200 bg-slate-50 px-2 py-2 text-center font-medium">LOP</th>
                  <th className="border-b border-slate-200 bg-slate-50 px-2 py-2 text-center font-medium">Not Considered</th>
                </tr>
              </thead>
              <tbody>
                {!sheet ? (
                  <tr>
                    <td
                      colSpan={
                        11 +
                        (calendarView === 'expanded' ? gridDayDates.length : 0) +
                        LEGEND_TOTAL_COLUMNS.length +
                        3
                      }
                      className="border-b border-slate-100 px-4 py-16"
                    >
                      <EmptyAttendanceState busy={busy} onUpload={onUpload} />
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row, index) => (
                    <tr key={row.id} className="group hover:bg-slate-50">
                      <td className="sticky left-0 z-20 w-10 min-w-[2.5rem] border-b border-slate-100 bg-white px-2 py-1.5 tabular-nums text-slate-500 group-hover:bg-slate-50">
                        {index + 1}
                      </td>
                      <td className="sticky left-10 z-20 w-[5.5rem] min-w-[5.5rem] border-b border-slate-100 bg-white px-2 py-1.5 font-mono text-slate-800 group-hover:bg-slate-50">
                        {row.emp_code}
                      </td>
                      <td className="sticky left-[7.5rem] z-20 min-w-[9rem] max-w-[11rem] truncate border-b border-r border-slate-100 bg-white px-3 py-1.5 font-medium text-slate-900 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.12)] group-hover:bg-slate-50">
                        {row.employee_name_snapshot}
                      </td>
                      <td className="whitespace-nowrap border-b border-slate-100 px-2 py-1.5 text-slate-700">{row.mobile || '—'}</td>
                      <td className="whitespace-nowrap border-b border-slate-100 px-2 py-1.5 text-slate-700">{row.gender || '—'}</td>
                      <td className="max-w-[120px] truncate border-b border-slate-100 px-2 py-1.5 text-slate-700">{row.designation || '—'}</td>
                      <td className="whitespace-nowrap border-b border-slate-100 px-2 py-1.5 tabular-nums text-slate-700">{row.doj || '—'}</td>
                      <td className="whitespace-nowrap border-b border-slate-100 px-2 py-1.5 tabular-nums text-slate-700">{row.lwd || '—'}</td>
                      <td className="whitespace-nowrap border-b border-slate-100 px-2 py-1.5 text-slate-700">{row.status_label || '—'}</td>
                      <td className="whitespace-nowrap border-b border-slate-100 px-2 py-1.5 text-slate-700">{row.amt_type || '—'}</td>
                      <td className="whitespace-nowrap border-b border-slate-100 px-2 py-1.5 font-mono text-slate-700">
                        {sheet?.contract_code || '—'}
                      </td>
                      {calendarView === 'expanded' &&
                        gridDayDates.map((d) => {
                          const code = markFor(row, d);
                          const isEditing =
                            editingCell?.rowId === row.id && editingCell?.date === d;
                          return (
                            <td key={`${row.id}-${d}`} className={dayBodyClass(d)}>
                              {isEditing && canEdit ? (
                                <select
                                  autoFocus
                                  className="w-14 rounded border border-indigo-300 bg-white py-0.5 text-xs"
                                  value={code}
                                  onChange={(e) => onChangeCell(row.id, d, e.target.value)}
                                  onBlur={() => setEditingCell(null)}
                                >
                                  {EDITABLE_CODES.map((c) => (
                                    <option key={c} value={c}>
                                      {c === 'A'
                                        ? 'A (Absent LOP)'
                                        : c === 'P-NH'
                                          ? 'P-NH (Present NH)'
                                          : c === 'P-FH'
                                            ? 'P-FH (Present FH)'
                                            : c}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <button
                                  type="button"
                                  disabled={!canEdit}
                                  title={LEGEND_LABELS[code] || code}
                                  onClick={() => canEdit && setEditingCell({ rowId: row.id, date: d })}
                                  className={`relative inline-flex min-w-[2rem] items-center justify-center overflow-hidden rounded px-1 py-0.5 ${codeCellClass(code)} ${
                                    canEdit ? 'cursor-pointer hover:ring-1 hover:ring-indigo-300' : 'cursor-default'
                                  }`}
                                >
                                  {isPresentOnHolidayCode(code) && (
                                    <span
                                      aria-hidden
                                      className={`pointer-events-none absolute bottom-0 left-0 h-0 w-0 border-b-[7px] border-r-[7px] ${holidayFlagBorderClass(code)}`}
                                    />
                                  )}
                                  {displayCode(code)}
                                </button>
                              )}
                            </td>
                          );
                        })}
                      {LEGEND_TOTAL_COLUMNS.map((col) => (
                        <td key={`${row.id}-tot-${col.code}`} className="border-b border-slate-100 px-2 py-1.5 text-center tabular-nums text-slate-700">
                          {Number(row.legend_totals?.[col.code] ?? 0)}
                        </td>
                      ))}
                      <td className="border-b border-slate-100 px-2 py-1.5 text-center tabular-nums">{row.paid_days ?? '—'}</td>
                      <td className="border-b border-slate-100 px-2 py-1.5 text-center tabular-nums text-red-700">{row.lop ?? '—'}</td>
                      <td className="border-b border-slate-100 px-2 py-1.5 text-center tabular-nums text-slate-600">
                        {row.not_considered ?? '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {sheet && (
            <p className="text-sm text-slate-500">
              {filteredRows.length} employee{filteredRows.length === 1 ? '' : 's'}
              {dayDates.length === 0 && ' · No day columns found — re-upload CSV with date headers (e.g. 1-Jul-26)'}
              {!canEdit && ' · Sheet is locked (unlock required to edit)'}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function UploadIcon({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M10 12.5V3.75M10 3.75L6.875 6.875M10 3.75L13.125 6.875M3.75 12.5v2.083c0 .921.746 1.667 1.667 1.667h9.166c.921 0 1.667-.746 1.667-1.667V12.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LockIcon({ className = 'h-3.5 w-3.5' }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M5 8V6a5 5 0 0 1 10 0v2h.5A1.5 1.5 0 0 1 17 9.5v7A1.5 1.5 0 0 1 15.5 18h-11A1.5 1.5 0 0 1 3 16.5v-7A1.5 1.5 0 0 1 4.5 8H5Zm2-2a3 3 0 0 1 6 0v2H7V6Zm3 6.25a1.25 1.25 0 0 0-.75 2.25V16h1.5v-1.5a1.25 1.25 0 0 0-.75-2.25Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function UnlockIcon({ className = 'h-3.5 w-3.5' }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M7 8V6a3 3 0 0 1 5.76-1.2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <rect x="3.5" y="8" width="13" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M10 11.25v2.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Pill lock/unlock control matching StaffingGo toggle design. */
function LockToggleButton({ locked, disabled, onClick }) {
  if (locked) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        title="Lock attendance"
        className="inline-flex h-9 items-center gap-2 rounded-full bg-[#D4A017] pl-1.5 pr-4 text-sm font-semibold text-white shadow-sm hover:bg-[#C49212] disabled:opacity-60"
      >
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white text-[#D4A017]">
          <LockIcon />
        </span>
        Locked
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title="Unlock attendance"
      className="inline-flex h-9 items-center gap-2 rounded-full bg-[#7B8A9A] pl-4 pr-1.5 text-sm font-semibold text-white shadow-sm hover:bg-[#6C7A8A] disabled:opacity-60"
    >
      Unlocked
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white text-[#7B8A9A]">
        <UnlockIcon />
      </span>
    </button>
  );
}

function UnlockMenuButton({ disabled, open, onToggle }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onToggle}
      aria-haspopup="menu"
      aria-expanded={open}
      title="Unlock attendance"
      className="inline-flex h-9 items-center gap-2 rounded-full bg-[#7B8A9A] pl-4 pr-2 text-sm font-semibold text-white shadow-sm hover:bg-[#6C7A8A] disabled:opacity-60"
    >
      Unlocked
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white text-[#7B8A9A]">
        <UnlockIcon />
      </span>
      <ChevronDownIcon className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
    </button>
  );
}

function ChevronDownIcon({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.94l3.71-3.71a.75.75 0 1 1 1.06 1.06l-4.24 4.24a.75.75 0 0 1-1.06 0L5.21 8.29a.75.75 0 0 1 .02-1.08Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function GlobeIcon({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 10h14M10 3c2.2 2.2 3.3 4.4 3.3 7S12.2 14.8 10 17C7.8 14.8 6.7 12.6 6.7 10S7.8 5.2 10 3Z" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function UserPlusIcon({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M8 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M2.5 16.5c.6-2.3 2.6-3.5 5.5-3.5s4.9 1.2 5.5 3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path d="M14.5 7v4M12.5 9h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function SearchIcon({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="9" cy="9" r="5.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M13.5 13.5 17 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function initialsFromName(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
}

function ShareEditAccessModal({
  busy,
  search,
  onSearchChange,
  people,
  selectedIds,
  onToggle,
  onClose,
  onSend
}) {
  const q = search.trim().toLowerCase();
  const filtered = !q
    ? people
    : people.filter(
        (p) =>
          String(p.name || '').toLowerCase().includes(q) ||
          String(p.email || '').toLowerCase().includes(q)
      );

  return (
    <ModalOverlay onClose={onClose} backdropClassName="bg-slate-900/50">
      <div
        role="document"
        aria-labelledby="share-edit-title"
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <h3 id="share-edit-title" className="text-lg font-semibold text-slate-900">
              Share edit access
            </h3>
            <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-sky-500 px-1.5 text-xs font-semibold text-white">
              {people.length}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="relative mt-4">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search program managers…"
            className="w-full rounded-xl border border-sky-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-800 outline-none ring-sky-100 focus:ring-2"
          />
        </div>

        <ul className="mt-4 max-h-64 space-y-2 overflow-auto">
          {filtered.length === 0 ? (
            <li className="rounded-xl border border-dashed border-slate-200 px-3 py-6 text-center text-sm text-slate-500">
              No program managers found for this client.
            </li>
          ) : (
            filtered.map((person) => {
              const selected = selectedIds.has(person.id);
              return (
                <li
                  key={person.id}
                  className="flex items-center gap-3 rounded-xl border border-slate-100 px-3 py-2.5"
                >
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-100 text-sm font-semibold text-rose-700">
                    {initialsFromName(person.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">{person.name || '—'}</p>
                    <p className="truncate text-xs text-slate-500">
                      {person.role_label || 'Program Manager'}
                      {person.email ? ` · ${person.email}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onToggle(person.id)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                      selected
                        ? 'bg-slate-900 text-white'
                        : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {selected ? 'Selected' : 'Select'}
                  </button>
                </li>
              );
            })
          )}
        </ul>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || selectedIds.size === 0}
            onClick={onSend}
            className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {busy ? 'Sending…' : 'Send Access'}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}

function SortIndicator({ active, direction }) {
  return (
    <span aria-hidden="true" className={active ? 'text-indigo-600' : 'text-slate-400'}>
      {active ? (direction === 'asc' ? '▲' : '▼') : '↕'}
    </span>
  );
}

function CalendarViewToggle({ value, onChange }) {
  const options = [
    { id: 'expanded', label: 'Expanded' },
    { id: 'collapsed', label: 'Collapsed' }
  ];
  return (
    <div
      role="group"
      aria-label="Calendar view"
      className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5"
    >
      {options.map((opt) => {
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              active
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function EmptyAttendanceState({ busy, onUpload }) {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center justify-center rounded-2xl border border-slate-100 bg-white px-8 py-10 text-center shadow-sm">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
        <svg className="h-9 w-9" viewBox="0 0 48 48" fill="none" aria-hidden="true">
          <rect x="8" y="18" width="32" height="22" rx="3" stroke="currentColor" strokeWidth="2.5" />
          <path d="M8 24h32" stroke="currentColor" strokeWidth="2.5" />
          <path
            d="M16 18V14a8 8 0 0 1 16 0v4"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <rect x="18" y="28" width="5" height="7" rx="1" fill="currentColor" opacity="0.35" />
          <rect x="25" y="28" width="5" height="7" rx="1" fill="currentColor" opacity="0.55" />
          <rect x="32" y="28" width="5" height="7" rx="1" fill="currentColor" opacity="0.75" />
        </svg>
      </div>
      <p className="text-lg font-semibold text-slate-900">No data yet</p>
      <p className="mt-1 text-sm text-slate-500">Upload a CSV file to get started</p>
      <label
        className={`mt-5 inline-flex cursor-pointer items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium text-white ${
          busy ? 'bg-slate-400' : 'bg-blue-600 hover:bg-blue-700'
        }`}
      >
        Upload CSV
        <input type="file" accept=".csv,text/csv" className="hidden" disabled={busy} onChange={onUpload} />
      </label>
    </div>
  );
}

function Meta({ label, value }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-0.5 font-medium text-slate-800">{value || '—'}</p>
    </div>
  );
}

function LegendBar() {
  const items = [
    { code: 'P', label: 'Present' },
    { code: 'W', label: 'Week off' },
    { code: 'NH', label: 'National Holiday' },
    { code: 'FH', label: 'Festival Holiday' },
    { code: 'P-NH', label: 'Present on National Holiday', flag: true },
    { code: 'P-FH', label: 'Present on Festive Holiday', flag: true },
    { code: 'HD', label: 'Half day' },
    { code: 'EL/SL/CL…', label: 'Leave', cls: 'bg-violet-100 text-violet-900' },
    { code: 'A', label: 'Absent LOP' },
    { code: 'R/T/-', label: 'Not considered', cls: 'bg-slate-100 text-slate-500' }
  ];
  return (
    <div className="flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
      {items.map((it) => (
        <span key={it.code} className="inline-flex items-center gap-1.5 text-xs text-slate-600">
          <span
            className={`relative inline-flex overflow-hidden rounded px-1.5 py-0.5 font-semibold ${
              it.cls || codeCellClass(it.code === 'EL/SL/CL…' ? 'EL' : it.code.split('/')[0])
            }`}
          >
            {it.flag && (
              <span
                aria-hidden
                className={`pointer-events-none absolute bottom-0 left-0 h-0 w-0 border-b-[6px] border-r-[6px] ${holidayFlagBorderClass(it.code)}`}
              />
            )}
            {it.code}
          </span>
          {it.label}
        </span>
      ))}
    </div>
  );
}
