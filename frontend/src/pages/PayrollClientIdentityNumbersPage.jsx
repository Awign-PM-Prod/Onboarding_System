import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';

export default function PayrollClientIdentityNumbersPage() {
  const { id } = useParams();
  const [employees, setEmployees] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingAll, setSavingAll] = useState(false);
  const [toast, setToast] = useState(null);
  const [draftById, setDraftById] = useState({});
  const [importing, setImporting] = useState(false);
  const [importSummary, setImportSummary] = useState(null);
  const fileInputRef = useRef(null);

  const loadAll = async () => {
    setLoading(true);
    setError('');
    try {
      const [employeeRows, clientRows] = await Promise.all([api.listEmployees(id), api.listClients()]);
      setEmployees(employeeRows || []);
      setClients(clientRows || []);
    } catch (err) {
      setError(err.message || 'Could not load joined employees.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [id]);

  const client = useMemo(() => clients.find((c) => c.id === id) || null, [clients, id]);
  const joinedRows = useMemo(
    () =>
      employees.filter((row) => {
        const payrollApproved = String(row.form_payroll_review_status ?? '').trim() === 'PAYROLL_APPROVED';
        if (!payrollApproved) return false;
        const joiningStatus = String(row.joining_status ?? '').trim();
        return joiningStatus === 'JOINED' || joiningStatus === 'JOINED_OTHER_DATE';
      }),
    [employees]
  );

  const rowsWithNeeds = useMemo(
    () =>
      joinedRows.map((row) => {
        const formUan = String(row.form_bp_pf_uan_number ?? '').trim();
        const formEsic = String(row.form_bp_esic_number ?? '').trim();
        const assignedUan = String(row.payroll_pf_uan_number ?? '').trim();
        const assignedEsic = String(row.payroll_esic_number ?? '').trim();
        const needUan = !formUan;
        const needEsic = !formEsic;
        const key = row.id;
        const draft = draftById[key] || {};
        const draftUan = draft.uan !== undefined ? draft.uan : assignedUan;
        const draftEsic = draft.esic !== undefined ? draft.esic : assignedEsic;
        const dirtyUan = needUan && String(draftUan ?? '').trim() !== assignedUan;
        const dirtyEsic = needEsic && String(draftEsic ?? '').trim() !== assignedEsic;
        const hasUnsavedEdits = dirtyUan || dirtyEsic;
        const requiredFieldsFilled =
          (!needUan || String(draftUan ?? '').trim()) && (!needEsic || String(draftEsic ?? '').trim());
        const readyToSave = hasUnsavedEdits && requiredFieldsFilled;

        return {
          ...row,
          need_uan: needUan,
          need_esic: needEsic,
          assigned_uan: assignedUan,
          assigned_esic: assignedEsic,
          effective_uan: formUan || assignedUan || '',
          effective_esic: formEsic || assignedEsic || '',
          draft_uan: draftUan,
          draft_esic: draftEsic,
          has_unsaved_edits: hasUnsavedEdits,
          ready_to_save: readyToSave
        };
      }),
    [joinedRows, draftById]
  );

  const pendingAssignmentCount = rowsWithNeeds.filter(
    (r) => (r.need_uan && !r.effective_uan) || (r.need_esic && !r.effective_esic)
  ).length;

  const unsavedCount = rowsWithNeeds.filter((r) => r.has_unsaved_edits).length;
  const saveableRows = rowsWithNeeds.filter((r) => r.ready_to_save);
  const saveAllCount = saveableRows.length;

  const setDraft = (idValue, field, value) => {
    setDraftById((prev) => ({
      ...prev,
      [idValue]: {
        ...(prev[idValue] || {}),
        [field]: value
      }
    }));
  };

  const saveAllChanges = async () => {
    if (saveableRows.length === 0) return;

    const incomplete = rowsWithNeeds.filter(
      (r) =>
        r.has_unsaved_edits &&
        ((r.need_uan && !String(r.draft_uan ?? '').trim()) ||
          (r.need_esic && !String(r.draft_esic ?? '').trim()))
    );
    if (incomplete.length > 0) {
      setError(
        `Fill required UAN/ESIC for: ${incomplete
          .slice(0, 3)
          .map((r) => r.name)
          .join(', ')}${incomplete.length > 3 ? ` (+${incomplete.length - 3} more)` : ''}.`
      );
      return;
    }

    setSavingAll(true);
    setError('');
    let saved = 0;
    const failures = [];

    try {
      for (const row of saveableRows) {
        try {
          await api.setPayrollIdentityNumbers({
            clientId: id,
            employeeId: row.id,
            payrollPfUanNumber: row.need_uan ? String(row.draft_uan ?? '').trim() : null,
            payrollEsicNumber: row.need_esic ? String(row.draft_esic ?? '').trim() : null
          });
          saved += 1;
        } catch (err) {
          failures.push(`${row.name}: ${err.message || 'failed'}`);
        }
      }

      setDraftById({});
      await loadAll();

      if (failures.length > 0) {
        setError(
          `Saved ${saved} row${saved === 1 ? '' : 's'}, but ${failures.length} failed. ${failures.slice(0, 2).join('; ')}`
        );
      }
      if (saved > 0) {
        setToast(`Saved ${saved} change${saved === 1 ? '' : 's'} successfully.`);
        setTimeout(() => setToast(null), 3000);
      }
    } catch (err) {
      setError(err.message || 'Could not save identity number changes.');
    } finally {
      setSavingAll(false);
    }
  };

  const handleExportCsv = async () => {
    try {
      setError('');
      const blob = await api.exportPayrollIdentityNumbersCsv({ clientId: id });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const clientName = String(client?.client_name ?? 'client').toLowerCase().replace(/[^a-z0-9]+/g, '-');
      a.href = url;
      a.download = `${clientName || 'client'}-uan-esic-template.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message || 'Could not export CSV.');
    }
  };

  const openImportPicker = () => {
    fileInputRef.current?.click();
  };

  const handleImportCsv = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setImporting(true);
    setError('');
    setImportSummary(null);
    try {
      const result = await api.importPayrollIdentityNumbersCsv({ clientId: id, file });
      setImportSummary(result);
      setDraftById({});
      setToast(`Imported CSV: ${result.updated} row${result.updated === 1 ? '' : 's'} updated.`);
      setTimeout(() => setToast(null), 3000);
      await loadAll();
    } catch (err) {
      setError(err.message || 'Could not import CSV.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <main className="mx-auto max-w-7xl px-6 pb-8 pt-4">
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[110] -translate-x-1/2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 shadow-lg">
          {toast}
        </div>
      )}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">UAN &amp; ESIC Assignment</h1>
          <p className="mt-1 text-sm text-slate-500">
            {client?.client_name || 'Client'}: payroll setup for employees who joined.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleImportCsv}
          />
          <button
            type="button"
            onClick={handleExportCsv}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Export CSV
          </button>
          <button
            type="button"
            onClick={openImportPicker}
            disabled={importing}
            className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {importing ? 'Importing...' : 'Import CSV'}
          </button>
        </div>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Pending Assignment</p>
          <p className="mt-1 text-2xl font-semibold text-amber-700">{pendingAssignmentCount}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Ready</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-700">
            {Math.max(joinedRows.length - pendingAssignmentCount, 0)}
          </p>
        </div>
      </div>

      {loading && (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-500">Loading employees...</div>
      )}
      {error && !loading && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>
      )}
      {importSummary && (
        <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
          <p className="font-medium text-slate-900">Import summary</p>
          <p className="mt-1">
            Total rows: <span className="font-semibold">{importSummary.total_rows ?? 0}</span>, Updated:{' '}
            <span className="font-semibold text-emerald-700">{importSummary.updated ?? 0}</span>, Failed:{' '}
            <span className="font-semibold text-rose-700">
              {Array.isArray(importSummary.failed) ? importSummary.failed.length : 0}
            </span>
          </p>
          {Array.isArray(importSummary.failed) && importSummary.failed.length > 0 && (
            <div className="mt-3 max-h-44 overflow-auto rounded-md border border-rose-100 bg-rose-50 p-3">
              <ul className="space-y-1 text-xs text-rose-800">
                {importSummary.failed.slice(0, 40).map((f, idx) => (
                  <li key={`${f.row}-${f.employee_id || 'na'}-${idx}`}>
                    Row {f.row ?? '-'} {f.employee_id ? `(${f.employee_id})` : ''}: {f.error}
                  </li>
                ))}
                {importSummary.failed.length > 40 && <li>...and {importSummary.failed.length - 40} more</li>}
              </ul>
            </div>
          )}
        </div>
      )}
      {!loading && !error && rowsWithNeeds.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          No joined employees found for this client.
        </div>
      )}

      {!loading && rowsWithNeeds.length > 0 && (
        <>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Employee</th>
                  <th className="px-4 py-2 text-left font-medium">Joining Status</th>
                  <th className="px-4 py-2 text-left font-medium">UAN (Employee Form)</th>
                  <th className="px-4 py-2 text-left font-medium">ESIC (Employee Form)</th>
                  <th className="px-4 py-2 text-left font-medium">Payroll UAN</th>
                  <th className="px-4 py-2 text-left font-medium">Payroll ESIC</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rowsWithNeeds.map((row) => {
                  const statusLabel =
                    row.joining_status === 'JOINED_OTHER_DATE'
                      ? `Joined on other date (${row.joining_actual_date || '-'})`
                      : row.joining_status === 'JOINED'
                        ? 'Joined'
                        : row.joining_status || '-';
                  const lockUan = !row.need_uan;
                  const lockEsic = !row.need_esic;
                  return (
                    <tr key={row.id} className={row.has_unsaved_edits ? 'bg-amber-50/40' : ''}>
                      <td className="px-4 py-3 text-slate-900">
                        <div className="flex items-center gap-2">
                          <span>{row.name}</span>
                          {row.has_unsaved_edits && (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                              Unsaved
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{statusLabel}</td>
                      <td className="px-4 py-3 text-slate-700">{row.form_bp_pf_uan_number || '-'}</td>
                      <td className="px-4 py-3 text-slate-700">{row.form_bp_esic_number || '-'}</td>
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          value={row.draft_uan || ''}
                          onChange={(e) => setDraft(row.id, 'uan', e.target.value.replace(/\D/g, '').slice(0, 12))}
                          disabled={lockUan || savingAll}
                          placeholder={lockUan ? 'Employee value' : 'Enter 12-digit UAN'}
                          className="w-full min-w-[160px] rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          value={row.draft_esic || ''}
                          onChange={(e) => setDraft(row.id, 'esic', e.target.value.replace(/\D/g, '').slice(0, 10))}
                          disabled={lockEsic || savingAll}
                          placeholder={lockEsic ? 'Employee value' : 'Enter 10-digit ESIC'}
                          className="w-full min-w-[160px] rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-600">
              {unsavedCount === 0
                ? 'No unsaved changes.'
                : `${unsavedCount} unsaved change${unsavedCount === 1 ? '' : 's'}${
                    saveAllCount < unsavedCount
                      ? ` (${unsavedCount - saveAllCount} incomplete)`
                      : ''
                  }.`}
            </p>
            <button
              type="button"
              onClick={saveAllChanges}
              disabled={savingAll || saveAllCount === 0}
              className="rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {savingAll
                ? 'Saving...'
                : saveAllCount > 0
                  ? `Save All (${saveAllCount})`
                  : 'Save All'}
            </button>
          </div>
        </>
      )}
    </main>
  );
}
