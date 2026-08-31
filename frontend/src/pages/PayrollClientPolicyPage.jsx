import { useCallback, useEffect, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import ClientPolicyConfigFields from '../components/clientPolicy/ClientPolicyConfigFields';
import ClientConfigActivityLog from '../components/clientPolicy/ClientConfigActivityLog';
import {
  DEFAULT_ATTENDANCE_POLICY,
  buildLeaveAllowancesForDesignations,
  mergeAttendancePolicyRoles,
  normalizeAttendancePolicyForForm
} from '../lib/clientPolicy';
import { emitClientPolicyUpdated } from '../lib/clientPolicyEvents';
import { normalizeDesignationList } from '../lib/wageConfig';

function currentMonthValue() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function applyClientPolicyState(found, setters) {
  const {
    setClient,
    setDesignations,
    setAttendancePolicy,
    setLeaveAllowances,
    setHolidays,
    setHolidaySource,
    setHolidayCalendarId,
    setCreateHolidayCalendar,
    setLeaveSource,
    setLeaveConfigId,
    setCreateLeaveConfig,
    setLeaveRules
  } = setters;
  setClient(found);
  // Include designations found on the client's employees so every employee in
  // attendance gets a configurable leave-allowance row (denominator source).
  const mergedDesignations = mergeAttendancePolicyRoles(
    normalizeDesignationList(found.designations ?? []),
    found.employee_designations ?? []
  );
  setDesignations(mergedDesignations);
  setAttendancePolicy(normalizeAttendancePolicyForForm(found.attendance_policy));
  setLeaveAllowances(
    buildLeaveAllowancesForDesignations(mergedDesignations, found.leave_allowances ?? [])
  );
  setHolidays(found.holidays ?? []);
  const calendarId = found.holiday_calendar_id || null;
  if (typeof setHolidayCalendarId === 'function') {
    setHolidayCalendarId(calendarId);
  }
  if (typeof setHolidaySource === 'function') {
    setHolidaySource(calendarId ? 'custom' : 'default');
  }
  if (typeof setCreateHolidayCalendar === 'function') {
    setCreateHolidayCalendar(false);
  }
  if (typeof setLeaveConfigId === 'function') {
    setLeaveConfigId(found.leave_config_id || null);
  }
  if (typeof setLeaveSource === 'function') {
    setLeaveSource(found.leave_config_id ? 'custom' : 'default');
  }
  if (typeof setCreateLeaveConfig === 'function') {
    setCreateLeaveConfig(false);
  }
  if (typeof setLeaveRules === 'function') {
    setLeaveRules(found.leave_config_id ? (found.leave_rules ?? []) : []);
  }
}

async function fetchClientForPolicy(id) {
  try {
    return await api.getClient(id);
  } catch {
    const list = await api.listClients();
    const found = list.find((c) => c.id === id);
    if (!found) throw new Error('Client not found');
    return found;
  }
}

export default function PayrollClientPolicyPage() {
  const { id } = useParams();
  const location = useLocation();
  const [client, setClient] = useState(null);
  const [designations, setDesignations] = useState([]);
  const [attendancePolicy, setAttendancePolicy] = useState({ ...DEFAULT_ATTENDANCE_POLICY });
  const [leaveAllowances, setLeaveAllowances] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [holidaySource, setHolidaySource] = useState('default');
  const [holidayCalendarId, setHolidayCalendarId] = useState(null);
  const [createHolidayCalendar, setCreateHolidayCalendar] = useState(false);
  const [leaveRules, setLeaveRules] = useState([]);
  const [leaveSource, setLeaveSource] = useState('default');
  const [leaveConfigId, setLeaveConfigId] = useState(null);
  const [createLeaveConfig, setCreateLeaveConfig] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [saved, setSaved] = useState(false);
  const [savedRecalcCount, setSavedRecalcCount] = useState(0);
  const [policyChanges, setPolicyChanges] = useState([]);
  const [recalcError, setRecalcError] = useState(null);
  const [effectiveFromMonth, setEffectiveFromMonth] = useState(currentMonthValue);
  const [confirmEarlyEffective, setConfirmEarlyEffective] = useState(false);

  const loadClient = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const found = await fetchClientForPolicy(id);
      applyClientPolicyState(found, {
        setClient,
        setDesignations,
        setAttendancePolicy,
        setLeaveAllowances,
        setHolidays,
        setHolidaySource,
        setHolidayCalendarId,
        setCreateHolidayCalendar,
        setLeaveSource,
        setLeaveConfigId,
        setCreateLeaveConfig,
        setLeaveRules
      });
    } catch (err) {
      setError(err.message);
      setClient(null);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadClient();
  }, [loadClient, location.pathname]);

  const validate = () => {
    const errs = {};
    if (!designations.length) {
      errs.designations = 'At least one role is required';
    }
    if (leaveAllowances.length !== designations.length) {
      errs.leave_allowances = 'Leave allowances required for each designation';
    }
    return errs;
  };

  const onDesignationsChange = (nextDesignations) => {
    setDesignations(nextDesignations);
    setLeaveAllowances((prev) =>
      buildLeaveAllowancesForDesignations(nextDesignations, prev)
    );
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!client) return;
    const errs = validate();
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;

    setSubmitting(true);
    setError(null);
    setSaved(false);
    setPolicyChanges([]);
    setRecalcError(null);
    try {
      const policyPayload = normalizeAttendancePolicyForForm({
        ...attendancePolicy,
        incentive_applicable: Boolean(attendancePolicy.incentive_applicable)
          || Number(attendancePolicy.incentive_value) > 0
      });
      const policyBody = {
        designations,
        attendance_policy: policyPayload,
        leave_allowances: leaveAllowances,
        holidays: holidays.filter((h) => h.holiday_date),
        holiday_source: holidayCalendarId || createHolidayCalendar ? 'custom' : 'default',
        holiday_calendar_id: holidayCalendarId || null,
        create_holiday_calendar: Boolean(createHolidayCalendar) && !holidayCalendarId,
        leave_source: leaveConfigId || createLeaveConfig ? 'custom' : 'default',
        leave_config_id: leaveConfigId || null,
        create_leave_config: Boolean(createLeaveConfig) && !leaveConfigId,
        leave_rules: leaveRules ?? [],
        effective_from_month: effectiveFromMonth
      };

      let updated = null;
      try {
        updated = await api.saveClientPolicy(client.id, policyBody);
      } catch (policyErr) {
        if (policyErr.status === 404 || policyErr.status === 405) {
          updated = await api.updateClient(client.id, {
            client_name: client.client_name,
            contract_code: client.contract_code,
            contract_start_date: client.contract_start_date,
            contract_end_date: client.contract_end_date,
            program_manager_id: client.program_manager_id,
            program_manager_ids: Array.isArray(client.program_manager_ids) && client.program_manager_ids.length
              ? client.program_manager_ids
              : (client.program_manager_id ? [client.program_manager_id] : []),
            client_type: client.client_type || 'COMPLIANCE',
            insurance_applicable: client.insurance_applicable,
            insurance_name: client.insurance_applicable ? client.insurance_name : null,
            insurance_amount: client.insurance_applicable ? client.insurance_amount : null,
            require_license_upload: client.require_license_upload !== false,
            require_qualification_certificate_upload: client.require_qualification_certificate_upload !== false,
            zone_dependency: Boolean(client.zone_dependency),
            cushion_type: client.cushion_type ?? null,
            cushion_value: client.cushion_value ?? null,
            designations,
            ...policyBody
          });
        } else {
          throw policyErr;
        }
      }

      if (!updated?.attendance_policy) {
        throw new Error('Policy save response was incomplete. Refresh the page and try again.');
      }

      applyClientPolicyState(updated, {
        setClient,
        setDesignations,
        setAttendancePolicy,
        setLeaveAllowances,
        setHolidays,
        setHolidaySource,
        setHolidayCalendarId,
        setCreateHolidayCalendar
      });
      emitClientPolicyUpdated(client.id);
      // Always reload from server so the form matches persisted DB state.
      await loadClient({ silent: true });
      setSaved(true);
      setPolicyChanges(updated?.policy_changes ?? []);
      setSavedRecalcCount(Number(updated?.attendance_recalculated ?? 0));
      if (updated?.effective_from_month) {
        setEffectiveFromMonth(String(updated.effective_from_month).slice(0, 7));
      }
      if (updated?.attendance_recalc_error) {
        setRecalcError(updated.attendance_recalc_error);
      }
    } catch (err) {
      setError(err.message);
      if (err.details) setFieldErrors(err.details);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8 text-slate-500">Loading policy...</main>
    );
  }

  if (error && !client) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Policy Configuration</h1>
        <p className="mt-1 text-sm text-slate-500">
          {client.client_name} · {client.contract_code}
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {saved && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          <p className="font-medium">Policy saved.</p>
          {policyChanges.length > 0 ? (
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {policyChanges.map((change) => (
                <li key={change}>{change}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-1">No configuration changes detected.</p>
          )}
          {savedRecalcCount > 0 && (
            <p className="mt-2">
              Attendance recalculated for {savedRecalcCount} sheet{savedRecalcCount === 1 ? '' : 's'} from{' '}
              {formatEffectiveMonth(effectiveFromMonth)} onward (paid days, leave balances, incentives).
            </p>
          )}
          {savedRecalcCount === 0 && (
            <p className="mt-2">Open Attendance to view calculated fields on existing sheets.</p>
          )}
        </div>
      )}

      {recalcError && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Policy was saved, but attendance recalculation failed: {recalcError}. Apply pending database
          migrations (incentive columns), then use <strong>Recompute</strong> on the attendance sheet.
        </div>
      )}

      <form onSubmit={onSubmit} className="rounded-lg border border-slate-200 bg-white p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900">Project Configuration</h2>
          <ClientConfigActivityLog clientId={id} className="contents" />
        </div>
        <div className="mb-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <label htmlFor="effective-from-month" className="block text-sm font-medium text-slate-900">
            Effective from month
          </label>
          <p className="mt-1 text-xs text-slate-500">
            New rules apply to attendance sheets from this month onward. Earlier months keep their existing calculations.
          </p>
          <input
            id="effective-from-month"
            type="month"
            value={effectiveFromMonth}
            onChange={(e) => {
              setEffectiveFromMonth(e.target.value);
              setConfirmEarlyEffective(false);
            }}
            className="mt-2 rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          {effectiveFromMonth < currentMonthValue() && !confirmEarlyEffective && (
            <label className="mt-3 flex items-start gap-2 text-sm text-amber-800">
              <input
                type="checkbox"
                checked={confirmEarlyEffective}
                onChange={(e) => setConfirmEarlyEffective(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                I understand prior months will not be changed; only sheets from{' '}
                {formatEffectiveMonth(effectiveFromMonth)} onward will use these rules.
              </span>
            </label>
          )}
        </div>
        <ClientPolicyConfigFields
          attendancePolicy={attendancePolicy}
          leaveAllowances={leaveAllowances}
          holidays={holidays}
          holidayCalendarId={holidayCalendarId}
          holidaySource={holidaySource}
          createHolidayCalendar={createHolidayCalendar}
          leaveConfigId={leaveConfigId}
          leaveSource={leaveSource}
          createLeaveConfig={createLeaveConfig}
          leaveRules={leaveRules}
          fieldErrors={fieldErrors}
          designations={designations}
          clientId={id}
          clientName={client?.client_name ?? ''}
          showDesignations
          onDesignationsChange={onDesignationsChange}
          onAttendancePolicyChange={setAttendancePolicy}
          onLeaveAllowancesChange={setLeaveAllowances}
          onHolidaysChange={setHolidays}
          onHolidayCalendarIdChange={setHolidayCalendarId}
          onCreateHolidayCalendarChange={(createNew) => {
            setCreateHolidayCalendar(createNew);
            if (createNew) {
              setHolidayCalendarId(null);
              setHolidaySource('custom');
            }
          }}
          onHolidaySourceChange={setHolidaySource}
          onLeaveConfigIdChange={setLeaveConfigId}
          onCreateLeaveConfigChange={(createNew) => {
            setCreateLeaveConfig(createNew);
            if (createNew) {
              setLeaveConfigId(null);
              setLeaveSource('custom');
            }
          }}
          onLeaveSourceChange={setLeaveSource}
          onLeaveRulesChange={setLeaveRules}
        />
        <div className="mt-6 flex justify-end">
          <button
            type="submit"
            disabled={
              submitting
              || (effectiveFromMonth < currentMonthValue() && !confirmEarlyEffective)
            }
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-md px-4 py-2 disabled:opacity-60"
          >
            {submitting ? 'Saving...' : 'Save Policy'}
          </button>
        </div>
      </form>
    </main>
  );
}

function formatEffectiveMonth(monthYm) {
  if (!monthYm) return '—';
  const d = new Date(`${String(monthYm).slice(0, 7)}-01T00:00:00Z`);
  return d.toLocaleString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}
