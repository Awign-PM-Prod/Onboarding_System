import PayrollCycleInput from './PayrollCycleInput';
import WeekOffPicker from './WeekOffPicker';
import CompOffSettings from './CompOffSettings';
import IncentiveSettings from './IncentiveSettings';
import LeaveAllowancesTable from './LeaveAllowancesTable';
import ClientHolidaysInput from './ClientHolidaysInput';
import ClientLeaveConfigInput from './ClientLeaveConfigInput';
import DesignationsInput from '../DesignationsInput';
import {
  ATTENDANCE_POLICY_ROLES,
  mergeAttendancePolicyRoles
} from '../../lib/clientPolicy';
import { designationNameOf } from '../../lib/wageConfig';

/**
 * Shared policy configuration fields (payroll cycle, week off, comp off, leave, holidays).
 */
export default function ClientPolicyConfigFields({
  attendancePolicy,
  leaveAllowances,
  holidays,
  holidayCalendarId = null,
  holidaySource = 'default',
  createHolidayCalendar = false,
  leaveConfigId = null,
  leaveSource = 'default',
  createLeaveConfig = false,
  leaveRules = [],
  fieldErrors = {},
  onAttendancePolicyChange,
  onLeaveAllowancesChange,
  onHolidaysChange,
  onHolidayCalendarIdChange,
  onHolidaySourceChange,
  onCreateHolidayCalendarChange,
  onLeaveConfigIdChange,
  onLeaveSourceChange,
  onCreateLeaveConfigChange,
  onLeaveRulesChange,
  designations = [],
  onDesignationsChange = null,
  showDesignations = false,
  clientId = null,
  clientName = ''
}) {
  const canEditDesignations = showDesignations && typeof onDesignationsChange === 'function';

  const addAttendanceRoles = () => {
    if (!canEditDesignations) return;
    onDesignationsChange(mergeAttendancePolicyRoles(designations));
  };

  return (
    <div className="space-y-5">
      <PayrollCycleInput
        value={attendancePolicy}
        onChange={onAttendancePolicyChange}
      />
      <WeekOffPicker
        value={attendancePolicy?.week_off_config}
        onChange={(week_off_config) => onAttendancePolicyChange({
          ...attendancePolicy,
          week_off_config
        })}
      />
      <CompOffSettings
        value={attendancePolicy}
        onChange={onAttendancePolicyChange}
      />
      <IncentiveSettings
        value={attendancePolicy}
        onChange={onAttendancePolicyChange}
      />
      {canEditDesignations && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="block text-sm font-medium text-slate-700">Roles (designations)</label>
            <button
              type="button"
              onClick={addAttendanceRoles}
              className="text-xs text-indigo-600 hover:text-indigo-800"
            >
              + Add {ATTENDANCE_POLICY_ROLES.join(', ')}
            </button>
          </div>
          <DesignationsInput value={designations} onChange={onDesignationsChange} />
          {fieldErrors.designations && (
            <p className="text-xs text-red-600">{fieldErrors.designations}</p>
          )}
          <p className="text-xs text-slate-500">
            Used as a fallback when a state-wise leave rule is missing for an employee&apos;s work state.
            Add Engineer, Operator, Inspector, and Supervisor for attendance testing.
          </p>
        </div>
      )}
      {!canEditDesignations && designations.length > 0 && (
        <p className="text-xs text-slate-500">
          Leave allowances are per designation:{' '}
          {designations.map((d) => designationNameOf(d)).filter(Boolean).join(', ')}.
        </p>
      )}
      <LeaveAllowancesTable
        value={leaveAllowances}
        onChange={onLeaveAllowancesChange}
        error={fieldErrors.leave_allowances}
      />
      <ClientLeaveConfigInput
        value={leaveRules}
        onChange={onLeaveRulesChange}
        leaveConfigId={leaveConfigId}
        onLeaveConfigIdChange={onLeaveConfigIdChange}
        leaveSource={leaveSource}
        createLeaveConfig={createLeaveConfig}
        onLeaveSourceChange={onLeaveSourceChange}
        onCreateLeaveConfigChange={onCreateLeaveConfigChange}
        clientId={clientId}
        clientName={clientName}
        error={fieldErrors.leave_source || fieldErrors.leave_rules || fieldErrors.leave_config_id}
      />
      <ClientHolidaysInput
        value={holidays}
        onChange={onHolidaysChange}
        holidayCalendarId={holidayCalendarId}
        onHolidayCalendarIdChange={onHolidayCalendarIdChange}
        holidaySource={holidaySource}
        createHolidayCalendar={createHolidayCalendar}
        onHolidaySourceChange={onHolidaySourceChange}
        onCreateHolidayCalendarChange={onCreateHolidayCalendarChange}
        clientId={clientId}
        clientName={clientName}
        error={fieldErrors.holiday_source || fieldErrors.holidays || fieldErrors.holiday_calendar_id}
      />
    </div>
  );
}
