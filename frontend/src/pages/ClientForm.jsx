import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useWorkspacePaths } from '../context/WorkspaceBasePath';
import DesignationsInput from '../components/DesignationsInput';
import ProgramManagersMultiSelect from '../components/ProgramManagersMultiSelect';
import ClientPolicyConfigFields from '../components/clientPolicy/ClientPolicyConfigFields';
import ClientConfigActivityLog from '../components/clientPolicy/ClientConfigActivityLog';
import {
  DEFAULT_ATTENDANCE_POLICY,
  buildLeaveAllowancesForDesignations,
  normalizeAttendancePolicyForForm
} from '../lib/clientPolicy';
import { emitClientPolicyUpdated } from '../lib/clientPolicyEvents';
import { ACTION_BTN_SECONDARY } from '../lib/actionButtonStyles';
import { INDIAN_STATES } from '../lib/indianStates';
import {
  buildClientExportCsv,
  buildClientTemplateCsv,
  csvRowToClientForm,
  parseClientCsvText,
  triggerCsvDownload
} from '../lib/clientCsv';
import {
  CUSHION_TYPE_LABELS,
  CUSHION_TYPES,
  normalizeCushionType,
  normalizeDesignationList
} from '../lib/wageConfig';
import ConfigureRegionZonesModal from '../components/ConfigureRegionZonesModal';
import { countConfiguredStates } from '../components/RegionZonesEditor';
import {
  CLIENT_TYPE_COMPLIANCE,
  CLIENT_TYPE_NON_COMPLIANCE,
  CLIENT_TYPE_LABELS,
  clientTypeOrDefault
} from '../lib/clientType';

const emptyForm = {
  client_name: '',
  contract_code: '',
  entity: '',
  state: '',
  contract_start_date: '',
  contract_end_date: '',
  open_ended_contract: false,
  program_manager_ids: [],
  client_type: CLIENT_TYPE_COMPLIANCE,
  insurance_applicable: false,
  insurance_name: '',
  insurance_amount: '',
  require_license_upload: true,
  require_qualification_certificate_upload: true,
  zone_dependency: false,
  cushion_enabled: false,
  cushion_type: 'ABSOLUTE',
  cushion_value: '',
  designations: [],
  attendance_policy: { ...DEFAULT_ATTENDANCE_POLICY },
  leave_allowances: [],
  holidays: [],
  holiday_source: 'default',
  holiday_calendar_id: null,
  create_holiday_calendar: false
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
  const paths = useWorkspacePaths();
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
  const [zoneConfigOpen, setZoneConfigOpen] = useState(false);
  const [configuredStateCount, setConfiguredStateCount] = useState(null);

  useEffect(() => {
    api.listProgramManagers()
      .then(setPms)
      .catch(err => setError(err.message))
      .finally(() => setPmsLoading(false));
  }, []);

  useEffect(() => {
    if (!form.zone_dependency) return undefined;
    let cancelled = false;
    api
      .listRegionZones()
      .then((rows) => {
        if (!cancelled) setConfiguredStateCount(countConfiguredStates(rows));
      })
      .catch(() => {
        if (!cancelled) setConfiguredStateCount(null);
      });
    return () => {
      cancelled = true;
    };
  }, [form.zone_dependency]);

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
          program_manager_ids: Array.isArray(found.program_manager_ids) && found.program_manager_ids.length
            ? found.program_manager_ids
            : (found.program_manager_id ? [found.program_manager_id] : []),
          client_type: clientTypeOrDefault(found.client_type),
          insurance_applicable: found.insurance_applicable,
          insurance_name: found.insurance_name ?? '',
          insurance_amount: found.insurance_amount != null
            ? String(Math.round(Number(found.insurance_amount)))
            : '',
          require_license_upload: found.require_license_upload !== false,
          require_qualification_certificate_upload: found.require_qualification_certificate_upload !== false,
          zone_dependency: Boolean(found.zone_dependency),
          cushion_enabled: Boolean(found.cushion_type && found.cushion_value != null),
          cushion_type: normalizeCushionType(found.cushion_type) || 'ABSOLUTE',
          cushion_value:
            found.cushion_value != null && found.cushion_value !== ''
              ? String(found.cushion_value)
              : '',
          designations: normalizeDesignationList(found.designations ?? []),
          attendance_policy: normalizeAttendancePolicyForForm(found.attendance_policy),
          leave_allowances: (found.leave_allowances?.length
            ? found.leave_allowances
            : buildLeaveAllowancesForDesignations(found.designations ?? [])),
          holidays: found.holidays ?? [],
          holiday_source: found.holiday_calendar_id ? 'custom' : 'default',
          holiday_calendar_id: found.holiday_calendar_id || null,
          create_holiday_calendar: false
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
    if (!form.program_manager_ids?.length) errs.program_manager_ids = 'Select at least one program manager';
    if (form.client_type !== CLIENT_TYPE_COMPLIANCE && form.client_type !== CLIENT_TYPE_NON_COMPLIANCE) {
      errs.client_type = 'Required';
    }
    if (form.insurance_applicable && !form.insurance_name.trim()) {
      errs.insurance_name = 'Required when insurance is applicable';
    }
    if (form.insurance_applicable) {
      if (form.insurance_amount === '' || form.insurance_amount == null) {
        errs.insurance_amount = 'Required when insurance is applicable';
      } else {
        const amt = Number(form.insurance_amount);
        if (!Number.isFinite(amt) || amt < 0 || !Number.isInteger(amt)) {
          errs.insurance_amount = 'Must be a whole number (no decimals)';
        }
      }
    }
    if (typeof form.require_license_upload !== 'boolean') {
      errs.require_license_upload = 'Required';
    }
    if (typeof form.require_qualification_certificate_upload !== 'boolean') {
      errs.require_qualification_certificate_upload = 'Required';
    }
    if (typeof form.zone_dependency !== 'boolean') {
      errs.zone_dependency = 'Required';
    }
    if (form.cushion_enabled) {
      if (!normalizeCushionType(form.cushion_type)) {
        errs.cushion_type = 'Select Absolute or Percentage';
      }
      const cv = Number(form.cushion_value);
      if (form.cushion_value === '' || !Number.isFinite(cv) || cv < 0) {
        errs.cushion_value = 'Enter a non-negative cushion value';
      } else if (form.cushion_type === 'PERCENTAGE' && cv > 100) {
        errs.cushion_value = 'Percentage must be at most 100';
      } else if (form.cushion_type === 'ABSOLUTE' && !Number.isInteger(cv)) {
        errs.cushion_value = 'Absolute cushion must be a whole number';
      }
    }
    if (form.designations.length === 0) {
      errs.designations = 'Add at least one designation';
    } else if (form.designations.some((d) => !d?.skill_level)) {
      errs.designations = 'Set skill level for each designation';
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
      if (!mapped.program_manager_ids?.length && mapped.program_manager_email) {
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
      const selectedPms = pms.filter((p) => form.program_manager_ids.includes(p.id));
      const csv = buildClientExportCsv(
        {
          ...form,
          designations: form.designations,
          insurance_name: form.insurance_applicable ? form.insurance_name : null,
          insurance_amount: form.insurance_applicable
            ? Math.round(Number(form.insurance_amount))
            : null,
          cushion_type: form.cushion_enabled ? form.cushion_type : null,
          cushion_value: form.cushion_enabled ? form.cushion_value : null
        },
        selectedPms.map((pm) => pm.email).filter(Boolean).join(';')
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
        program_manager_ids: form.program_manager_ids,
        program_manager_id: form.program_manager_ids[0],
        contract_end_date: form.open_ended_contract ? null : form.contract_end_date,
        attendance_policy: normalizeAttendancePolicyForForm(form.attendance_policy),
        insurance_name: form.insurance_applicable ? form.insurance_name : null,
        insurance_amount: form.insurance_applicable
          ? Math.round(Number(form.insurance_amount))
          : null,
        cushion_type: form.cushion_enabled ? form.cushion_type : null,
        cushion_value: form.cushion_enabled ? Number(form.cushion_value) : null,
        holidays: (form.holidays ?? []).filter((h) => h.holiday_date),
        holiday_source: form.holiday_calendar_id || form.create_holiday_calendar ? 'custom' : 'default',
        holiday_calendar_id: form.holiday_calendar_id || null,
        create_holiday_calendar: Boolean(form.create_holiday_calendar) && !form.holiday_calendar_id
      };
      delete payload.cushion_enabled;
      if (isEdit) {
        const updated = await api.updateClient(id, payload);
        emitClientPolicyUpdated(id);
        const changes = updated?.policy_changes ?? [];
        if (changes.length) {
          setPolicyChanges(changes);
          setSaveSuccess(true);
          window.setTimeout(() => navigate(paths.clients), 2500);
        } else {
          navigate(paths.clients);
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
          <Link to={paths.clients} className="text-sm text-indigo-600 hover:text-indigo-800">
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
              className={ACTION_BTN_SECONDARY}
            >
              {exporting ? 'Exporting…' : 'Export Client Details (CSV)'}
            </button>
            <Link
              to={paths.client(createdClient.id, 'dashboard')}
              className={ACTION_BTN_SECONDARY}
            >
              Open Client Workspace
            </Link>
            <Link
              to={paths.clients}
              className={ACTION_BTN_SECONDARY}
            >
              Back to Clients
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <>
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link to={paths.clients} className="text-sm text-indigo-600 hover:text-indigo-800">
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
            className={ACTION_BTN_SECONDARY}
          >
            Download CSV Template
          </button>
          {!isEdit && (
            <label className={`cursor-pointer ${ACTION_BTN_SECONDARY}`}>
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
              className={ACTION_BTN_SECONDARY}
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
          </div>

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

          <Field label="Client type" error={fieldErrors.client_type}>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-6 text-sm">
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="client_type"
                  checked={form.client_type === CLIENT_TYPE_COMPLIANCE}
                  onChange={() => set({ client_type: CLIENT_TYPE_COMPLIANCE })}
                />
                {CLIENT_TYPE_LABELS.COMPLIANCE}
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="client_type"
                  checked={form.client_type === CLIENT_TYPE_NON_COMPLIANCE}
                  onChange={() => set({ client_type: CLIENT_TYPE_NON_COMPLIANCE })}
                />
                {CLIENT_TYPE_LABELS.NON_COMPLIANCE}
              </label>
            </div>
            <p className="mt-1.5 text-xs text-slate-500">
              Non-compliance hides ESIC, UAN, police verification, and e-nomination on the employee form.
            </p>
          </Field>

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

          <Field label="Program Managers" error={fieldErrors.program_manager_ids}>
            <ProgramManagersMultiSelect
              options={pms}
              value={form.program_manager_ids}
              onChange={(ids) => set({ program_manager_ids: ids })}
            />
            <p className="mt-1.5 text-xs text-slate-500">
              Select one or more program managers. All selected PMs can access this client.
            </p>
          </Field>

          <Field label="Designations" error={fieldErrors.designations}>
            <DesignationsInput
              value={form.designations}
              onChange={onDesignationsChange}
            />
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
                  step="1"
                  inputMode="numeric"
                  value={form.insurance_amount}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw === '') {
                      set({ insurance_amount: '' });
                      return;
                    }
                    if (/^\d+$/.test(raw)) set({ insurance_amount: raw });
                  }}
                  placeholder="0"
                  className="input"
                />
              </Field>
            </div>
          )}

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-5 space-y-5">
            <h2 className="text-base font-semibold text-slate-900">Wage settings</h2>

            <Field label="Zone dependency" error={fieldErrors.zone_dependency}>
              <label className="inline-flex cursor-pointer items-center gap-3">
                <button
                  type="button"
                  role="switch"
                  aria-checked={form.zone_dependency}
                  onClick={() => set({ zone_dependency: !form.zone_dependency })}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                    form.zone_dependency ? 'bg-indigo-600' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                      form.zone_dependency ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
                <span className="text-sm text-slate-700">
                  {form.zone_dependency
                    ? 'On — wage floors use configured zones'
                    : 'Off — wage floors use zone1'}
                </span>
              </label>
              <p className="mt-1 text-xs text-slate-500">
                Some clients need zone-based wages; others do not. When off, CTC floors use zone1 for
                the designation skill level.
              </p>
              {form.zone_dependency && (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-indigo-100 bg-indigo-50/80 px-3 py-2.5">
                  <div className="flex items-center gap-2 text-sm text-indigo-900">
                    <span
                      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-indigo-300 text-[11px] font-semibold text-indigo-700"
                      aria-hidden
                    >
                      i
                    </span>
                    <span>
                      {configuredStateCount == null
                        ? 'Loading zone config…'
                        : `${configuredStateCount} state${configuredStateCount === 1 ? '' : 's'} configured`}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setZoneConfigOpen(true)}
                    className="inline-flex shrink-0 items-center rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-sm font-medium text-indigo-700 shadow-sm hover:bg-indigo-50"
                  >
                    Configure Zones
                  </button>
                </div>
              )}
            </Field>

            <Field label="CTC cushion" error={fieldErrors.cushion_type || fieldErrors.cushion_value}>
              <label className="inline-flex cursor-pointer items-center gap-3">
                <button
                  type="button"
                  role="switch"
                  aria-checked={form.cushion_enabled}
                  onClick={() =>
                    set({
                      cushion_enabled: !form.cushion_enabled,
                      ...(form.cushion_enabled
                        ? { cushion_value: '' }
                        : { cushion_type: form.cushion_type || 'ABSOLUTE' })
                    })
                  }
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                    form.cushion_enabled ? 'bg-indigo-600' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                      form.cushion_enabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
                <span className="text-sm text-slate-700">
                  {form.cushion_enabled ? 'On — add cushion to min CTC' : 'Off — use min CTC only'}
                </span>
              </label>
              {form.cushion_enabled && (
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Type</label>
                    <select
                      className="input"
                      value={form.cushion_type}
                      onChange={(e) => set({ cushion_type: e.target.value })}
                    >
                      {CUSHION_TYPES.map((t) => (
                        <option key={t} value={t}>{CUSHION_TYPE_LABELS[t]}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">
                      {form.cushion_type === 'PERCENTAGE' ? 'Percentage' : 'Amount (₹)'}
                    </label>
                    <input
                      className="input"
                      type="text"
                      inputMode={form.cushion_type === 'PERCENTAGE' ? 'decimal' : 'numeric'}
                      placeholder={form.cushion_type === 'PERCENTAGE' ? 'e.g. 10' : 'e.g. 2000'}
                      value={form.cushion_value}
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (raw === '') {
                          set({ cushion_value: '' });
                          return;
                        }
                        if (form.cushion_type === 'PERCENTAGE') {
                          if (/^\d*\.?\d*$/.test(raw)) set({ cushion_value: raw });
                        } else if (/^\d+$/.test(raw)) {
                          set({ cushion_value: raw });
                        }
                      }}
                    />
                  </div>
                </div>
              )}
              <p className="mt-1 text-xs text-slate-500">
                Final CTC floor at employee onboarding = Super Admin min CTC + cushion
                {form.cushion_enabled && form.cushion_type === 'PERCENTAGE'
                  ? ' (percentage of min CTC).'
                  : form.cushion_enabled
                    ? ' (absolute ₹).'
                    : '.'}
              </p>
            </Field>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-5 space-y-5">
            <h2 className="text-base font-semibold text-slate-900">Project Configuration</h2>
            <ClientPolicyConfigFields
              attendancePolicy={form.attendance_policy}
              leaveAllowances={form.leave_allowances}
              holidays={form.holidays}
              holidayCalendarId={form.holiday_calendar_id}
              holidaySource={form.holiday_source}
              createHolidayCalendar={form.create_holiday_calendar}
              fieldErrors={fieldErrors}
              designations={form.designations}
              clientId={isEdit ? id : null}
              clientName={form.client_name}
              onAttendancePolicyChange={(attendance_policy) => set({ attendance_policy })}
              onLeaveAllowancesChange={(leave_allowances) => set({ leave_allowances })}
              onHolidaysChange={(holidays) => set({ holidays })}
              onHolidayCalendarIdChange={(holiday_calendar_id) => set({
                holiday_calendar_id
              })}
              onCreateHolidayCalendarChange={(create_holiday_calendar) => set({
                create_holiday_calendar,
                ...(create_holiday_calendar
                  ? { holiday_calendar_id: null, holiday_source: 'custom' }
                  : {})
              })}
              onHolidaySourceChange={(holiday_source) => set({ holiday_source })}
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
              to={paths.clients}
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
    {zoneConfigOpen && (
      <ConfigureRegionZonesModal
        initialState={form.state || ''}
        onClose={() => setZoneConfigOpen(false)}
        onSaved={(rows) => {
          setConfiguredStateCount(countConfiguredStates(rows));
        }}
      />
    )}
    </>
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
