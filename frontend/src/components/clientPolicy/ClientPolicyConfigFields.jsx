import PayrollCycleInput from './PayrollCycleInput';
import WeekOffPicker from './WeekOffPicker';
import CompOffSettings from './CompOffSettings';
import IncentiveSettings from './IncentiveSettings';
import LeaveAllowancesTable from './LeaveAllowancesTable';
import ClientHolidaysInput from './ClientHolidaysInput';
import DesignationsInput from '../DesignationsInput';
import {
  ATTENDANCE_POLICY_ROLES,
  mergeAttendancePolicyRoles
} from '../../lib/clientPolicy';

/**
 * Shared policy configuration fields (payroll cycle, week off, comp off, leave, holidays).
 */
export default function ClientPolicyConfigFields({
  attendancePolicy,
  leaveAllowances,
  holidays,
  fieldErrors = {},
  onAttendancePolicyChange,
  onLeaveAllowancesChange,
  onHolidaysChange,
  designations = [],
  onDesignationsChange = null,
  showDesignations = false
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
            Each role below gets a row in Leave Allowances per Role. Add Engineer, Operator, Inspector,
            and Supervisor for attendance testing.
          </p>
        </div>
      )}
      {!canEditDesignations && designations.length > 0 && (
        <p className="text-xs text-slate-500">
          Leave allowances are per designation: {designations.join(', ')}.
        </p>
      )}
      <LeaveAllowancesTable
        value={leaveAllowances}
        onChange={onLeaveAllowancesChange}
        error={fieldErrors.leave_allowances}
      />
      <ClientHolidaysInput
        value={holidays}
        onChange={onHolidaysChange}
      />
    </div>
  );
}
