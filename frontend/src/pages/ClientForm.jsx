import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { api } from '../lib/api';
import DesignationsInput from '../components/DesignationsInput';
import ClientPolicyConfigFields from '../components/clientPolicy/ClientPolicyConfigFields';
import ClientConfigActivityLog from '../components/clientPolicy/ClientConfigActivityLog';
import {
  DEFAULT_ATTENDANCE_POLICY,
  buildLeaveAllowancesForDesignations,
  normalizeAttendancePolicyForForm
} from '../lib/clientPolicy';
import { emitClientPolicyUpdated } from '../lib/clientPolicyEvents';
import { INDIAN_STATES } from '../lib/indianStates';
import {
  buildClientExportCsv,
  buildClientTemplateCsv,
  csvRowToClientForm,
  parseClientCsvText,
  triggerCsvDownload
} from '../lib/clientCsv';

const emptyForm = {
  client_name: '',
  contract_code: '',
  entity: '',
  state: '',
  contract_start_date: '',
  contract_end_date: '',
  open_ended_contract: false,
  program_manager_id: '',
  insurance_applicable: false,
  insurance_name: '',
  insurance_amount: '',
  require_license_upload: true,
  require_qualification_certificate_upload: true,
  designations: [],
  attendance_policy: { ...DEFAULT_ATTENDANCE_POLICY },
  leave_allowances: [],
  holidays: []
};

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function ClientForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [pms, setPms] = useState([]);
  const [pmsLoading, setPmsLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [policyChanges, setPolicyChanges] = useState([]);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [createdClient, setCreatedClient] = useState(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    api.listProgramManagers()
      .then(setPms)
      .catch(err => setError(err.message))
      .finally(() => setPmsLoading(false));
  }, []);

  useEffect(() => {
    if (!isEdit) return;
    setLoading(true);
    api.listClients()
      .then(list => {
        const found = list.find(c => c.id === id);
        if (!found) {
          setError('Client not found');
          return;
        }
        setForm({
          client_name: found.client_name,
          contract_code: found.contract_code,
          entity: found.entity ?? '',
          state: found.state ?? '',
          contract_start_date: found.contract_start_date,
          contract_end_date: found.contract_end_date ?? '',
          open_ended_contract: Boolean(found.open_ended_contract),
          program_manager_id: found.program_manager_id,
          insurance_applicable: found.insurance_applicable,
          insurance_name: found.insurance_name ?? '',
          insurance_amount: found.insurance_amount != null ? String(found.insurance_amount) : '',
          require_license_upload: found.require_license_upload !== false,
          require_qualification_certificate_upload: found.require_qualification_certificate_upload !== false,
          designations: found.designations ?? [],
          attendance_policy: normalizeAttendancePolicyForForm(found.attendance_policy),
          leave_allowances: (found.leave_allowances?.length
            ? found.leave_allowances
            : buildLeaveAllowancesForDesignations(found.designations ?? [])),
          holidays: found.holidays ?? []
        });
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [id, isEdit]);

  const set = (patch) => setForm(f => ({ ...f, ...patch }));

  const onDesignationsChange = (designations) => {
    setForm((f) => ({
      ...f,
      designations,
      leave_allowances: buildLeaveAllowancesForDesignations(designations, f.leave_allowances)
    }));
  };

  const onOpenEndedChange = (openEnded) => {
    setForm((f) => ({
      ...f,
      open_ended_contract: openEnded,
      contract_end_date: openEnded ? '' : f.contract_end_date
    }));
  };

  const validate = () => {
    const errs = {};
    if (!form.client_name.trim()) errs.client_name = 'Required';
    if (!form.contract_code.trim()) errs.contract_code = 'Required';
    if (!form.entity.trim()) errs.entity = 'Required';
    if (!form.state.trim()) errs.state = 'Required';
    if (!form.contract_start_date) errs.contract_start_date = 'Required';
    if (!form.open_ended_contract) {
      if (!form.contract_end_date) errs.contract_end_date = 'Required';
      if (form.contract_start_date && form.contract_end_date
          && new Date(form.contract_end_date) < new Date(form.contract_start_date)) {
        errs.contract_end_date = 'End date must be on or after start date';
      }
    }
    if (!form.program_manager_id) errs.program_manager_id = 'Required';
    if (form.insurance_applicable && !form.insurance_name.trim()) {
      errs.insurance_name = 'Required when insurance is applicable';
    }
    if (form.insurance_applicable) {
      if (form.insurance_amount === '' || form.insurance_amount == null) {
        errs.insurance_amount = 'Required when insurance is applicable';
      } else if (Number.isNaN(Number(form.insurance_amount)) || Number(form.insurance_amount) < 0) {
        errs.insurance_amount = 'Must be a non-negative number';
      }
    }
    if (typeof form.require_license_upload !== 'boolean') {
      errs.require_license_upload = 'Required';
    }
    if (typeof form.require_qualification_certificate_upload !== 'boolean') {
      errs.require_qualification_certificate_upload = 'Required';
    }
    if (form.designations.length === 0) {
      errs.designations = 'Add at least one designation';
    }
    if (form.leave_allowances.length !== form.designations.length) {
      errs.leave_allowances = 'Leave allowances required for each designation';
    }
    return errs;
  };

  const downloadTemplate = async () => {
    try {
      const blob = await api.downloadClientCsvTemplate();
      downloadBlob(blob, 'client-creation-template.csv');
    } catch {
      // Fall back to client-side template if API is unavailable
      triggerCsvDownload('client-creation-template.csv', buildClientTemplateCsv());
    }
  };

  const onImportCsvToForm = async (e) => {
    const selected = e.target.files?.[0] ?? null;
    e.target.value = '';
    if (!selected) return;
    setError(null);
    setFieldErrors({});
    try {
      const text = await selected.text();
      const rows = parseClientCsvText(text);
      if (!rows.length) {
        setError('CSV has no data rows.');
        return;
      }
      const mapped = csvRowToClientForm(rows[0], pms);
      if (!mapped.program_manager_id && mapped.program_manager_email) {
        setError(
          `Program manager not found for email: ${mapped.program_manager_email}. Select one manually.`
        );
      }
      const { program_manager_email: _email, ...formPatch } = mapped;
      setForm((f) => ({ ...f, ...formPatch }));
    } catch (err) {
      setError(err.message || 'Could not import CSV.');
    }
  };

  const exportClientDetails = async (clientOverride = null) => {
    setExporting(true);
    setError(null);
    try {
      const client = clientOverride || createdClient;
      if (client?.id) {
        try {
          const blob = await api.exportClientCsv(client.id);
          const safeCode = String(client.contract_code || 'client')
            .replace(/[^a-zA-Z0-9_-]+/g, '-')
            .slice(0, 40);
          downloadBlob(blob, `client-${safeCode}-export.csv`);
          return;
        } catch {
          // Fall through to local export
        }
      }
      if (isEdit && id) {
        const blob = await api.exportClientCsv(id);
        const safeCode = String(form.contract_code || 'client')
          .replace(/[^a-zA-Z0-9_-]+/g, '-')
          .slice(0, 40);
        downloadBlob(blob, `client-${safeCode}-export.csv`);
        return;
      }
      const pm = pms.find((p) => p.id === form.program_manager_id);
      const csv = buildClientExportCsv(
        {
          ...form,
          designations: form.designations,
          insurance_name: form.insurance_applicable ? form.insurance_name : null,
          insurance_amount: form.insurance_applicable ? Number(form.insurance_amount) : null
        },
        pm?.email || ''
      );
      const safeCode = String(form.contract_code || 'client')
        .replace(/[^a-zA-Z0-9_-]+/g, '-')
        .slice(0, 40);
      triggerCsvDownload(`client-${safeCode}-export.csv`, csv);
    } catch (err) {
      setError(err.message || 'Could not export client details.');
    } finally {
      setExporting(false);
    }
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;

    setSubmitting(true);
    setError(null);
    setSaveSuccess(false);
    setPolicyChanges([]);
    try {
      const payload = {
        ...form,
        contract_end_date: form.open_ended_contract ? null : form.contract_end_date,
        attendance_policy: normalizeAttendancePolicyForForm(form.attendance_policy),
        insurance_name: form.insurance_applicable ? form.insurance_name : null,
        insurance_amount: form.insurance_applicable ? Number(form.insurance_amount) : null,
        holidays: (form.holidays ?? []).filter((h) => h.holiday_date)
      };
      if (isEdit) {
        const updated = await api.updateClient(id, payload);
        emitClientPolicyUpdated(id);
        const changes = updated?.policy_changes ?? [];
        if (changes.length) {
          setPolicyChanges(changes);
          setSaveSuccess(true);
          window.setTimeout(() => navigate('/dashboard/clients'), 2500);
        } else {
          navigate('/dashboard/clients');
        }
      } else {
        const created = await api.createClient(payload);
        setCreatedClient(created);
        setSaveSuccess(true);
      }
    } catch (err) {
      setError(err.message);
      if (err.details) setFieldErrors(err.details);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || pmsLoading) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8 text-slate-500">Loading...</main>
    );
  }

  if (saveSuccess && createdClient && !isEdit) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6">
          <Link to="/dashboard/clients" className="text-sm text-indigo-600 hover:text-indigo-800">
            &larr; Back to clients
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">Client Created</h1>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-6">
          <p className="text-sm font-medium text-emerald-900">
            {createdClient.client_name} has been created successfully.
          </p>
          <p className="mt-1 text-sm text-emerald-800">
            Contract code: <span className="font-mono">{createdClient.contract_code}</span>
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={exporting}
              onClick={() => exportClientDetails(createdClient)}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {exporting ? 'Exporting…' : 'Export Client Details (CSV)'}
            </button>
            <Link
              to={`/dashboard/client/${createdClient.id}/dashboard`}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Open Client Workspace
            </Link>
            <Link
              to="/dashboard/clients"
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Back to Clients
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link to="/dashboard/clients" className="text-sm text-indigo-600 hover:text-indigo-800">
            &larr; Back to clients
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">
            {isEdit ? 'Edit Client' : 'Create Client'}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={downloadTemplate}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Download CSV Template
          </button>
          {!isEdit && (
            <label className="cursor-pointer rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Import CSV
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={onImportCsvToForm}
              />
            </label>
          )}
          {isEdit && (
            <button
              type="button"
              disabled={exporting}
              onClick={() => exportClientDetails()}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              {exporting ? 'Exporting…' : 'Export Details'}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {saveSuccess && policyChanges.length > 0 && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          <p className="font-medium">Client saved. Configuration changes:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {policyChanges.map((change) => (
              <li key={change}>{change}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-emerald-700">Returning to dashboard…</p>
        </div>
      )}

      {isEdit && (
        <div className="mb-4">
          <ClientConfigActivityLog clientId={id} />
        </div>
      )}

        <form onSubmit={onSubmit} className="bg-white border border-slate-200 rounded-lg p-6 space-y-5">
          <Field label="Client Name" error={fieldErrors.client_name}>
            <input
              type="text"
              value={form.client_name}
              onChange={e => set({ client_name: e.target.value })}
              className="input"
            />
          </Field>

          <Field label="Contract Code" error={fieldErrors.contract_code}>
            <input
              type="text"
              value={form.contract_code}
              onChange={e => set({ contract_code: e.target.value })}
              className="input"
            />
          </Field>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Entity" error={fieldErrors.entity}>
              <input
                type="text"
                value={form.entity}
                onChange={e => set({ entity: e.target.value })}
                placeholder="e.g. Acme Group"
                className="input"
              />
            </Field>
            <Field label="State" error={fieldErrors.state}>
              <select
                value={form.state}
                onChange={e => set({ state: e.target.value })}
                className="input"
              >
                <option value="">Select state</option>
                {INDIAN_STATES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </Field>
          </div>

          <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <Field label="Contract Period">
              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={form.open_ended_contract}
                  onChange={(e) => onOpenEndedChange(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                Open-ended contract (no end date)
              </label>
            </Field>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Contract Start Date" error={fieldErrors.contract_start_date}>
                <input
                  type="date"
                  value={form.contract_start_date}
                  onChange={e => set({ contract_start_date: e.target.value })}
                  className="input"
                />
              </Field>
              <Field label="Contract End Date" error={fieldErrors.contract_end_date}>
                <input
                  type="date"
                  value={form.contract_end_date}
                  onChange={e => set({ contract_end_date: e.target.value })}
                  disabled={form.open_ended_contract}
                  className="input disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                />
                {form.open_ended_contract && (
                  <p className="mt-1 text-xs text-slate-500">End date not required for open-ended contracts.</p>
                )}
              </Field>
            </div>
          </div>

          <Field label="Program Manager" error={fieldErrors.program_manager_id}>
            <select
              value={form.program_manager_id}
              onChange={e => set({ program_manager_id: e.target.value })}
              className="input"
            >
              <option value="">Select a program manager</option>
              {pms.map(pm => (
                <option key={pm.id} value={pm.id}>{pm.name}</option>
              ))}
            </select>
          </Field>

          <Field label="Insurance Applicable">
            <div className="flex gap-4 text-sm">
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  checked={form.insurance_applicable === true}
                  onChange={() => set({ insurance_applicable: true })}
                />
                Yes
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  checked={form.insurance_applicable === false}
                  onChange={() => set({ insurance_applicable: false, insurance_name: '', insurance_amount: '' })}
                />
                No
              </label>
            </div>
          </Field>

          {form.insurance_applicable && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Insurance Name" error={fieldErrors.insurance_name}>
                <input
                  type="text"
                  value={form.insurance_name}
                  onChange={e => set({ insurance_name: e.target.value })}
                  className="input"
                />
              </Field>
              <Field label="Insurance Amount" error={fieldErrors.insurance_amount}>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.insurance_amount}
                  onChange={e => set({ insurance_amount: e.target.value })}
                  placeholder="0.00"
                  className="input"
                />
              </Field>
            </div>
          )}

          <Field label="Designations" error={fieldErrors.designations}>
            <DesignationsInput
              value={form.designations}
              onChange={onDesignationsChange}
            />
          </Field>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-5 space-y-5">
            <h2 className="text-base font-semibold text-slate-900">Project Configuration</h2>
            <ClientPolicyConfigFields
              attendancePolicy={form.attendance_policy}
              leaveAllowances={form.leave_allowances}
              holidays={form.holidays}
              fieldErrors={fieldErrors}
              designations={form.designations}
              onAttendancePolicyChange={(attendance_policy) => set({ attendance_policy })}
              onLeaveAllowancesChange={(leave_allowances) => set({ leave_allowances })}
              onHolidaysChange={(holidays) => set({ holidays })}
            />
          </div>

          <Field label="Show Driving License Upload in Employee Form" error={fieldErrors.require_license_upload}>
            <div className="flex gap-4 text-sm">
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  checked={form.require_license_upload === true}
                  onChange={() => set({ require_license_upload: true })}
                />
                Yes
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  checked={form.require_license_upload === false}
                  onChange={() => set({ require_license_upload: false })}
                />
                No
              </label>
            </div>
          </Field>

          <Field label="Show ITI/Diploma Certificate Upload in Employee Form" error={fieldErrors.require_qualification_certificate_upload}>
            <div className="flex gap-4 text-sm">
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  checked={form.require_qualification_certificate_upload === true}
                  onChange={() => set({ require_qualification_certificate_upload: true })}
                />
                Yes
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  checked={form.require_qualification_certificate_upload === false}
                  onChange={() => set({ require_qualification_certificate_upload: false })}
                />
                No
              </label>
            </div>
          </Field>

          <div className="flex justify-end gap-3 pt-2">
            <Link
              to="/dashboard/clients"
              className="px-4 py-2 text-sm rounded border border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={submitting}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-md px-4 py-2 disabled:opacity-60"
            >
              {submitting ? 'Saving...' : (isEdit ? 'Save Changes' : 'Create Client')}
            </button>
          </div>
        </form>
    </main>
  );
}

function Field({ label, error, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      {children}
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}
