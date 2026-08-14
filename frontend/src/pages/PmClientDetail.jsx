import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, useNavigate, useParams } from 'react-router-dom';
import { PM_TAB_SEGMENT_TO_KEY, pmClientTabUrl } from '../lib/pmClientRoutes';
import EmployeeTable from '../components/EmployeeTable';
import EmployeeFormResponseModal from '../components/EmployeeFormResponseModal';
import AddEmployeeModal from '../components/AddEmployeeModal';
import BulkUploadModal from '../components/BulkUploadModal';
import RoleDetailsModal from '../components/RoleDetailsModal';
import PmClientDashboard from '../components/PmClientDashboard';
import AttendancePanel from '../components/AttendancePanel';
import ClientProjectMetaHeader from '../components/ClientProjectMetaHeader';
import ModalOverlay from '../components/ModalOverlay';
import { api } from '../lib/api';
import { employeeOnboardingFormPath } from '../lib/onboardingFormLink';
import {
  formatDesignationLabel,
  formatEmployeeStatusLabel,
} from '../lib/formatLabels';
import {
  DIRECTORY_STATUS_OPTIONS,
  TESTING_FORM_STATUS_OPTIONS,
  TESTING_JOINING_STATUS_OPTIONS,
  TESTING_REJECTED_BY_OPTIONS,
} from '../lib/pmFilterOptions';

const PAGE_SIZE = 50;
const TESTING_FORM_CSV_EXPORT_STATUSES = new Set([
  'RESPONDED',
  'REQUEST CORRECTION',
  'PM APPROVED',
  'APPROVED',
  'PL APPROVED',
  'Form Submitted',
]);

function buildOnboardingInitiateToast(prefix, result) {
  const updated = Number(result?.updated ?? 0);
  const emailed = Number(result?.emailed ?? 0);
  const skipped = Number(result?.skipped ?? 0);
  const failed = Number(result?.failed ?? 0);
  const base = `${prefix} for ${updated} employee${updated === 1 ? '' : 's'}`;
  const suffix = [`emails sent: ${emailed}`];
  if (skipped > 0) suffix.push(`skipped: ${skipped} (no email)`);
  if (failed > 0) suffix.push(`failed: ${failed}`);
  return `${base}. ${suffix.join(', ')}.`;
}

function formatReviewDateTime(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '-';
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return '-';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(dt);
}

function isMissingRoleDetails(row) {
  const payType = String(row.pay_type ?? '').trim().toUpperCase();
  const missingPeriod = payType === 'CTC' && !String(row.ctc_type ?? '').trim();
  return (
    !String(row.designation ?? '').trim() ||
    !String(row.date_of_joining ?? '').trim() ||
    !payType ||
    missingPeriod ||
    row.ctc_value === null ||
    row.ctc_value === undefined ||
    String(row.ctc_value).trim() === '' ||
    !String(row.state ?? '').trim()
  );
}

function getTestingFormStatusLabel(row) {
  if (String(row.form_payroll_review_status ?? '').trim().toUpperCase() === 'PAYROLL_APPROVED') return 'PL APPROVED';
  if (String(row.form_review_status ?? '').trim().toUpperCase() === 'CORRECTION_REQUESTED') return 'REQUEST CORRECTION';
  if (String(row.form_review_status ?? '').trim().toUpperCase() === 'APPROVED') return 'PM APPROVED';
  if (String(row.form_review_status ?? '').trim().toUpperCase() === 'REJECTED') return 'PM REJECTED';
  if (String(row.form_submission_status ?? '').trim() === 'Submitted') return 'RESPONDED';
  if (isMissingRoleDetails(row)) return 'NOT_SENT';
  return String(row.onboarding_status ?? '').trim() || '-';
}

function getTestingJoiningStatusKey(row) {
  const status = String(row.joining_status ?? '').trim().toUpperCase();
  return status || '__NONE__';
}

function canExportTestingFormResponse(row) {
  if (String(row.form_submission_status ?? '').trim() === 'Submitted') return true;
  return TESTING_FORM_CSV_EXPORT_STATUSES.has(getTestingFormStatusLabel(row));
}

function canBulkSetInitialJoiningStatus(row) {
  const payrollApproved =
    String(row.form_payroll_review_status ?? '').trim().toUpperCase() === 'PAYROLL_APPROVED';
  const pmApproved = String(row.form_review_status ?? '').trim().toUpperCase() === 'APPROVED';
  const joiningStatus = String(row.joining_status ?? '').trim();
  const changeCount = Number(row.joining_status_change_count ?? 0);
  return payrollApproved && pmApproved && !joiningStatus && changeCount === 0;
}

function canBulkRequestExtendDoj(row) {
  const payrollApproved =
    String(row.form_payroll_review_status ?? '').trim().toUpperCase() === 'PAYROLL_APPROVED';
  const pmApproved = String(row.form_review_status ?? '').trim().toUpperCase() === 'APPROVED';
  const hasDoj = Boolean(String(row.date_of_joining ?? '').trim());
  const unlocked = Boolean(row.doj_extend_unlock);
  const pending = Boolean(row.doj_extend_request_pending);
  return payrollApproved && pmApproved && hasDoj && !unlocked && !pending;
}

export default function PmClientDetail() {
  const { id, tab: tabSegment } = useParams();
  const navigate = useNavigate();
  const [client, setClient] = useState(null);
  const [pmClients, setPmClients] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const activeTab = PM_TAB_SEGMENT_TO_KEY[tabSegment] ?? 'client_dashboard';
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [toast, setToast] = useState(null);
  const [ctaLoading, setCtaLoading] = useState(false);
  const [roleDetailsLoading, setRoleDetailsLoading] = useState(false);
  const [availableFilters, setAvailableFilters] = useState({ name: '', mobile: '', email: '' });
  const [roleFilters, setRoleFilters] = useState({
    name: '',
    mobile: '',
    email: '',
    designation: '',
    pay_type: ''
  });
  const [pageByTab, setPageByTab] = useState({
    pending: 1,
    role_assigned: 1,
    in_progress_form_sent: 1,
    in_progress_responses: 1,
    in_progress_correction_requested: 1,
    in_progress_approved: 1,
    in_progress_rejected: 1,
    pl_reviewed_approved: 1,
    pl_reviewed_rejected: 1,
    employee_directory: 1,
    testing_employees: 1,
    testing_rejected: 1,
    testing_add_employee: 1,
    add_employee: 1
  });
  /** Within Onboarding In Progress: form still open vs submitted applications */
  const [inProgressSubtab, setInProgressSubtab] = useState('form_sent');
  /** Within PL Reviewed: final approved vs final rejected by Payroll Lead */
  const [plReviewedSubtab, setPlReviewedSubtab] = useState('approved');
  /** Within Testing: all records vs only rejected records */
  const [testingSubtab, setTestingSubtab] = useState('employees');
  const [bulkRoleModalOpen, setBulkRoleModalOpen] = useState(false);
  const [bulkRoleForceSendOnboarding, setBulkRoleForceSendOnboarding] = useState(false);
  const [testingBulkMenuOpen, setTestingBulkMenuOpen] = useState(false);
  const testingBulkMenuRef = useRef(null);
  const [testingJoiningModalOpen, setTestingJoiningModalOpen] = useState(false);
  const [rowRoleModalEmployee, setRowRoleModalEmployee] = useState(null);
  const [responseModalOpen, setResponseModalOpen] = useState(false);
  const [responseModalEmployee, setResponseModalEmployee] = useState(null);
  const [responseModalForm, setResponseModalForm] = useState(null);
  const [responseModalPreviousRejectedFields, setResponseModalPreviousRejectedFields] = useState([]);
  const [responseModalLoading, setResponseModalLoading] = useState(false);
  const [responseModalError, setResponseModalError] = useState('');
  const [responseDecisionLoading, setResponseDecisionLoading] = useState(false);
  const [joiningBulkStatus, setJoiningBulkStatus] = useState('');
  const [responsesExportLoading, setResponsesExportLoading] = useState(false);
  const [joiningBulkDate, setJoiningBulkDate] = useState('');
  const [joiningBulkLoading, setJoiningBulkLoading] = useState(false);
  const [extendDojBulkReason, setExtendDojBulkReason] = useState('');
  const [extendDojBulkLoading, setExtendDojBulkLoading] = useState(false);
  const [joiningInlineEmployeeId, setJoiningInlineEmployeeId] = useState(null);
  const [joiningInlineStatus, setJoiningInlineStatus] = useState('');
  const [joiningInlineDate, setJoiningInlineDate] = useState('');
  const [joiningInlineEmpCode, setJoiningInlineEmpCode] = useState('');
  const [joiningInlineLoading, setJoiningInlineLoading] = useState(false);
  const [extendDojModalEmployee, setExtendDojModalEmployee] = useState(null);
  const [extendDojReason, setExtendDojReason] = useState('');
  const [extendDojLoading, setExtendDojLoading] = useState(false);
  const [statusChangeModalEmployee, setStatusChangeModalEmployee] = useState(null);
  const [statusChangeReason, setStatusChangeReason] = useState('');
  const [statusChangeLoading, setStatusChangeLoading] = useState(false);
  const [extendedDojDraftById, setExtendedDojDraftById] = useState({});
  const [extendedDojSavingId, setExtendedDojSavingId] = useState(null);
  const [transferModalEmployee, setTransferModalEmployee] = useState(null);
  const [testingBulkTransferModalOpen, setTestingBulkTransferModalOpen] = useState(false);
  const [transferTargetClientId, setTransferTargetClientId] = useState('');
  const [transferReason, setTransferReason] = useState('');
  const [transferLoading, setTransferLoading] = useState(false);
  const [directoryStatusFilter, setDirectoryStatusFilter] = useState('');
  const [testingFormStatusFilter, setTestingFormStatusFilter] = useState('');
  const [testingJoiningStatusFilter, setTestingJoiningStatusFilter] = useState('');
  const [testingRejectedByFilter, setTestingRejectedByFilter] = useState('');

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [clients, emps] = await Promise.all([
        api.listPmClients(),
        api.listEmployees(id)
      ]);
      const found = clients.find(c => c.id === id);
      if (!found) {
        setError('Client not found or not assigned to you.');
      } else {
        setPmClients(clients);
        setClient(found);
        setEmployees(emps);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  /** Background refresh without loading spinner — picks up employee submit / status changes. */
  const softRefresh = async () => {
    if (!id) return;
    try {
      const [clients, emps] = await Promise.all([
        api.listPmClients(),
        api.listEmployees(id),
      ]);
      const found = clients.find((c) => c.id === id);
      if (!found) return;
      setPmClients(clients);
      setClient(found);
      setEmployees(emps);
    } catch {
      // Keep current UI on background refresh failure.
    }
  };

  useEffect(() => { loadAll(); }, [id]);

  // Slow poll so PM sees Form Submitted / status changes without a manual refresh.
  useEffect(() => {
    if (!id) return undefined;
    const POLL_MS = 10000;
    const tick = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      softRefresh();
    };
    const intervalId = setInterval(tick, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') softRefresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [id]);

  useEffect(() => {
    if (tabSegment === 'testing') {
      navigate(pmClientTabUrl(id, 'testing'), { replace: true });
      return;
    }
    if (tabSegment && !PM_TAB_SEGMENT_TO_KEY[tabSegment]) {
      navigate(pmClientTabUrl(id, 'client_dashboard'), { replace: true });
    }
  }, [tabSegment, id, navigate]);

  const pending = useMemo(
    () => employees.filter((e) => e.onboarding_status === 'AVAILABLE' || e.onboarding_status === 'PENDING'),
    [employees]
  );
  const roleAssigned = useMemo(() => employees.filter((e) => e.onboarding_status === 'ROLE_ASSIGNED'), [employees]);
  const reviewStatus = (row) => String(row.form_review_status ?? '').toUpperCase();
  const formSentRows = useMemo(
    () =>
      employees.filter(
        (e) =>
          (e.onboarding_initiated || e.onboarding_status === 'FORM_SENT') &&
          String(e.form_submission_status ?? '') !== 'Submitted' &&
          !reviewStatus(e)
      ),
    [employees]
  );
  const responsesRows = useMemo(
    () =>
      employees.filter(
        (e) =>
          String(e.form_submission_status ?? '') === 'Submitted' &&
          (reviewStatus(e) === 'SUBMITTED' || reviewStatus(e) === '')
      ),
    [employees]
  );
  const correctionRequestedRows = useMemo(
    () => employees.filter((e) => reviewStatus(e) === 'CORRECTION_REQUESTED'),
    [employees]
  );
  const plRejectedRows = useMemo(
    () =>
      employees.filter(
        (e) =>
          reviewStatus(e) === 'APPROVED' &&
          String(e.form_payroll_review_status ?? '').trim() === 'PAYROLL_REJECTED'
      ),
    [employees]
  );
  const inProgressApprovedRows = useMemo(
    () =>
      employees.filter(
        (e) =>
          reviewStatus(e) === 'APPROVED' &&
          String(e.form_payroll_review_status ?? '').trim() === 'PENDING_PAYROLL_LEAD'
      ),
    [employees]
  );
  const plApprovedRows = useMemo(
    () =>
      employees.filter(
        (e) =>
          reviewStatus(e) === 'APPROVED' &&
          String(e.form_payroll_review_status ?? '').trim() === 'PAYROLL_APPROVED'
      ),
    [employees]
  );
  const plRejectedRowsForDisplay = useMemo(
    () => plRejectedRows.map((row) => ({ ...row, onboarding_status: 'Rejected' })),
    [plRejectedRows]
  );
  const rejectedRows = useMemo(
    () => employees.filter((e) => reviewStatus(e) === 'REJECTED'),
    [employees]
  );
  const employeeDirectoryRows = useMemo(
    () =>
      employees.map((row) => {
        const payrollReviewStatus = String(row.form_payroll_review_status ?? '').trim();
        const formReviewStatus = String(row.form_review_status ?? '').trim();
        const formSubmissionStatus = String(row.form_submission_status ?? '').trim();
        const joiningStatus = String(row.joining_status ?? '').trim().toUpperCase();

        let latestStatus = row.onboarding_status ?? '';
        if (joiningStatus === 'JOINED') latestStatus = 'Joined';
        else if (joiningStatus === 'NOT_JOINED') latestStatus = 'Not Joined';
        else if (joiningStatus === 'JOINED_OTHER_DATE') latestStatus = 'Joined on other date';
        else if (joiningStatus === 'JOINED_ABSCONDED') latestStatus = 'Joined and absconded';
        else if (payrollReviewStatus === 'PAYROLL_APPROVED') latestStatus = 'Payroll Approved';
        else if (payrollReviewStatus === 'PAYROLL_REJECTED') latestStatus = 'Payroll Rejected';
        else if (payrollReviewStatus === 'PENDING_PAYROLL_LEAD') latestStatus = 'Pending Payroll Review';
        else if (formReviewStatus === 'APPROVED') latestStatus = 'PM APPROVED';
        else if (formReviewStatus === 'REJECTED') latestStatus = 'PM Rejected';
        else if (formReviewStatus === 'CORRECTION_REQUESTED') latestStatus = 'Correction Mail Sent';
        else if (formSubmissionStatus === 'Submitted') latestStatus = 'Form Submitted';

        return { ...row, onboarding_status: latestStatus };
      }),
    [employees]
  );
  const testingRejectedRows = useMemo(
    () =>
      employees
        .filter((row) => {
          const pmRejected = String(row.form_review_status ?? '').trim().toUpperCase() === 'REJECTED';
          const plRejected = String(row.form_payroll_review_status ?? '').trim().toUpperCase() === 'PAYROLL_REJECTED';
          return pmRejected || plRejected;
        })
        .map((row) => {
          const plRejected = String(row.form_payroll_review_status ?? '').trim().toUpperCase() === 'PAYROLL_REJECTED';
          return {
            ...row,
            testing_form_status: plRejected ? 'PL REJECTED' : 'PM REJECTED',
            testing_rejected_by: plRejected ? 'PL' : 'PM',
            testing_rejected_at: plRejected ? row.form_payroll_reviewed_at : row.form_reviewed_at,
            testing_rejected_remarks: plRejected ? row.form_payroll_review_reason : row.form_review_reason,
          };
        }),
    [employees]
  );
  const filteredTestingRejectedRows = useMemo(
    () =>
      testingRejectedRows.filter((row) => {
        if (!testingRejectedByFilter) return true;
        return row.testing_rejected_by === testingRejectedByFilter;
      }),
    [testingRejectedRows, testingRejectedByFilter]
  );
  const directoryStatusOptions = useMemo(() => {
    const fromRows = Array.from(
      new Set(
        employeeDirectoryRows
          .map((row) => String(row.onboarding_status ?? '').trim())
          .filter(Boolean)
      )
    );
    const merged = Array.from(new Set([...DIRECTORY_STATUS_OPTIONS, ...fromRows]));
    return merged.sort((a, b) => a.localeCompare(b));
  }, [employeeDirectoryRows]);
  const filteredEmployeeDirectoryRows = useMemo(
    () =>
      employeeDirectoryRows.filter((row) => {
        if (!directoryStatusFilter) return true;
        return String(row.onboarding_status ?? '').trim() === directoryStatusFilter;
      }),
    [employeeDirectoryRows, directoryStatusFilter]
  );
  const filteredTestingEmployees = useMemo(
    () =>
      employees.filter((row) => {
        if (testingFormStatusFilter && getTestingFormStatusLabel(row) !== testingFormStatusFilter) return false;
        if (testingJoiningStatusFilter && getTestingJoiningStatusKey(row) !== testingJoiningStatusFilter) return false;
        return true;
      }),
    [employees, testingFormStatusFilter, testingJoiningStatusFilter]
  );
  const inProgressTotal =
    formSentRows.length +
    responsesRows.length +
    correctionRequestedRows.length +
    inProgressApprovedRows.length +
    rejectedRows.length;
  const plReviewedTotal = plApprovedRows.length + plRejectedRows.length;
  const filteredPending = useMemo(() => {
    const nameQ = availableFilters.name.trim().toLowerCase();
    const mobileQ = availableFilters.mobile.trim().toLowerCase();
    const emailQ = availableFilters.email.trim().toLowerCase();
    return pending.filter((row) => {
      const name = String(row.name ?? '').toLowerCase();
      const mobile = String(row.mobile ?? '').toLowerCase();
      const email = String(row.email ?? '').toLowerCase();
      if (nameQ && !name.includes(nameQ)) return false;
      if (mobileQ && !mobile.includes(mobileQ)) return false;
      if (emailQ && !email.includes(emailQ)) return false;
      return true;
    });
  }, [pending, availableFilters.name, availableFilters.mobile, availableFilters.email]);
  const filteredRoleAssigned = useMemo(() => {
    const nameQ = roleFilters.name.trim().toLowerCase();
    const mobileQ = roleFilters.mobile.trim().toLowerCase();
    const emailQ = roleFilters.email.trim().toLowerCase();
    const designationQ = roleFilters.designation.trim().toLowerCase();
    const payTypeQ = roleFilters.pay_type.trim().toUpperCase();
    return roleAssigned.filter((row) => {
      const name = String(row.name ?? '').toLowerCase();
      const mobile = String(row.mobile ?? '').toLowerCase();
      const email = String(row.email ?? '').toLowerCase();
      const designation = String(row.designation ?? '').toLowerCase();
      const payType = String(row.pay_type ?? '').toUpperCase();
      if (nameQ && !name.includes(nameQ)) return false;
      if (mobileQ && !mobile.includes(mobileQ)) return false;
      if (emailQ && !email.includes(emailQ)) return false;
      if (designationQ && designation !== designationQ) return false;
      if (payTypeQ && payType !== payTypeQ) return false;
      return true;
    });
  }, [roleAssigned, roleFilters.name, roleFilters.mobile, roleFilters.email, roleFilters.designation, roleFilters.pay_type]);
  const hasActiveAvailableFilters = Boolean(availableFilters.name || availableFilters.mobile || availableFilters.email);
  const hasActiveRoleFilters = Boolean(
    roleFilters.name ||
    roleFilters.mobile ||
    roleFilters.email ||
    roleFilters.designation ||
    roleFilters.pay_type
  );
  const paginationDisabled = activeTab === 'pending' && hasActiveAvailableFilters;
  const paginationTabKey =
    activeTab === 'in_progress'
      ? inProgressSubtab === 'form_sent'
        ? 'in_progress_form_sent'
        : inProgressSubtab === 'responses'
          ? 'in_progress_responses'
          : inProgressSubtab === 'correction_requested'
            ? 'in_progress_correction_requested'
            : inProgressSubtab === 'approved'
              ? 'in_progress_approved'
              : 'in_progress_rejected'
      : activeTab === 'pl_reviewed'
        ? plReviewedSubtab === 'approved'
          ? 'pl_reviewed_approved'
          : 'pl_reviewed_rejected'
      : activeTab === 'testing'
        ? testingSubtab === 'add_employee'
          ? 'testing_add_employee'
          : testingSubtab === 'employees'
          ? 'testing_employees'
          : 'testing_rejected'
      : activeTab;
  const showAddEmployeePanel =
    activeTab === 'add_employee' || (activeTab === 'testing' && testingSubtab === 'add_employee');
  const showEmployeeTable =
    activeTab !== 'client_dashboard' && activeTab !== 'attendance' && !showAddEmployeePanel;
  const visibleRows =
    activeTab === 'client_dashboard'
      ? []
      : activeTab === 'pending'
      ? filteredPending
      : activeTab === 'role_assigned'
        ? filteredRoleAssigned
        : activeTab === 'testing'
          ? testingSubtab === 'add_employee'
            ? []
            : testingSubtab === 'employees'
            ? filteredTestingEmployees
            : filteredTestingRejectedRows
        : activeTab === 'add_employee'
          ? []
          : activeTab === 'employee_directory'
            ? filteredEmployeeDirectoryRows
          : activeTab === 'pl_reviewed'
            ? plReviewedSubtab === 'approved'
              ? plApprovedRows
              : plRejectedRowsForDisplay
          : inProgressSubtab === 'form_sent'
            ? formSentRows
            : inProgressSubtab === 'responses'
              ? responsesRows
              : inProgressSubtab === 'correction_requested'
                ? correctionRequestedRows
                : inProgressSubtab === 'approved'
                  ? inProgressApprovedRows
                  : rejectedRows;
  const effectivePageSize = paginationDisabled ? Math.max(visibleRows.length, 1) : PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(visibleRows.length / effectivePageSize));
  const currentPage = Math.min(pageByTab[paginationTabKey] ?? 1, totalPages);
  const pagedRows = useMemo(() => {
    if (paginationDisabled) return visibleRows;
    const start = (currentPage - 1) * effectivePageSize;
    return visibleRows.slice(start, start + effectivePageSize);
  }, [visibleRows, currentPage, paginationDisabled, effectivePageSize]);

  useEffect(() => {
    setSelectedIds(new Set());
    setJoiningInlineEmployeeId(null);
    setJoiningInlineStatus('');
    setJoiningInlineDate('');
    setTestingBulkMenuOpen(false);
    setTestingJoiningModalOpen(false);
    setTestingBulkTransferModalOpen(false);
    setJoiningBulkStatus('');
    setJoiningBulkDate('');
    setExtendDojBulkReason('');
    setBulkRoleForceSendOnboarding(false);
    setTestingFormStatusFilter('');
    setTestingJoiningStatusFilter('');
    setTestingRejectedByFilter('');
  }, [activeTab, tabSegment, inProgressSubtab, plReviewedSubtab, testingSubtab]);

  useEffect(() => {
    if (!testingBulkMenuOpen) return undefined;
    const onPointerDown = (event) => {
      if (testingBulkMenuRef.current && !testingBulkMenuRef.current.contains(event.target)) {
        setTestingBulkMenuOpen(false);
      }
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setTestingBulkMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [testingBulkMenuOpen]);

  useEffect(() => {
    if (activeTab !== 'testing') return;
    setTestingSubtab('employees');
  }, [activeTab]);

  useEffect(() => {
    if (showAddEmployeePanel) return;
    const pageKey =
      activeTab === 'in_progress'
        ? inProgressSubtab === 'form_sent'
          ? 'in_progress_form_sent'
          : inProgressSubtab === 'responses'
            ? 'in_progress_responses'
            : inProgressSubtab === 'correction_requested'
              ? 'in_progress_correction_requested'
              : inProgressSubtab === 'approved'
                ? 'in_progress_approved'
                : 'in_progress_rejected'
        : activeTab === 'pl_reviewed'
          ? plReviewedSubtab === 'approved'
            ? 'pl_reviewed_approved'
            : 'pl_reviewed_rejected'
        : activeTab === 'testing'
          ? testingSubtab === 'add_employee'
            ? 'testing_add_employee'
            : testingSubtab === 'employees'
              ? 'testing_employees'
              : 'testing_rejected'
        : activeTab;
    if (pageByTab[pageKey] > totalPages) {
      setPageByTab((prev) => ({ ...prev, [pageKey]: totalPages }));
    }
  }, [activeTab, inProgressSubtab, plReviewedSubtab, testingSubtab, pageByTab, showAddEmployeePanel, totalPages]);

  const toggle = (empId) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(empId)) next.delete(empId); else next.add(empId);
      return next;
    });
  };

  const toggleAll = (checked) => {
    if (!checked) { setSelectedIds(new Set()); return; }
    setSelectedIds(new Set(pagedRows.map(r => r.id)));
  };

  const handleInitiate = async () => {
    if (selectedIds.size === 0) return;
    setCtaLoading(true);
    setError(null);
    try {
      const ids = Array.from(selectedIds);
      const res = await api.initiateOnboarding(ids);
      setToast(buildOnboardingInitiateToast('Onboarding initiated', res));
      setSelectedIds(new Set());
      await loadAll();
      setTimeout(() => setToast(null), 3500);
    } catch (err) {
      setError(err.message);
    } finally {
      setCtaLoading(false);
    }
  };

  const handleBulkReinitiate = async () => {
    if (selectedIds.size === 0) return;
    setCtaLoading(true);
    setError(null);
    try {
      const ids = Array.from(selectedIds);
      const res = await api.reinitiateRejectedOnboarding({ clientId: id, employeeIds: ids });
      const updated = Number(res?.updated ?? 0);
      setToast(
        `Re-initiated onboarding for ${updated} employee${updated === 1 ? '' : 's'}${selectedIds.size ? ` (${selectedIds.size} selected)` : ''}.`
      );
      setSelectedIds(new Set());
      await loadAll();
      setTimeout(() => setToast(null), 3500);
    } catch (err) {
      setError(err.message || 'Could not re-initiate selected employees.');
    } finally {
      setCtaLoading(false);
    }
  };

  const openTransferModal = (row) => {
    setTransferModalEmployee(row);
    setTransferTargetClientId('');
    setTransferReason('');
    setError(null);
  };

  const closeTransferModal = () => {
    if (transferLoading) return;
    setTransferModalEmployee(null);
    setTestingBulkTransferModalOpen(false);
    setTransferTargetClientId('');
    setTransferReason('');
  };

  const openTestingBulkTransferModal = () => {
    setTestingBulkMenuOpen(false);
    setTransferTargetClientId('');
    setTransferReason('');
    setError(null);
    setTestingBulkTransferModalOpen(true);
  };

  const transferEmployees = async (employeeIds) => {
    if (!transferTargetClientId || employeeIds.length === 0) return;
    const reason = String(transferReason ?? '').trim();
    if (!reason) {
      setError('Please enter an exit / transfer reason before confirming.');
      return;
    }
    setTransferLoading(true);
    setError(null);
    const targetClientName =
      pmClients.find((c) => c.id === transferTargetClientId)?.client_name || 'target project';
    let succeeded = 0;
    let failed = 0;
    try {
      for (const employeeId of employeeIds) {
        try {
          await api.transferEmployeeProject({
            clientId: id,
            employeeId,
            targetClientId: transferTargetClientId,
            reason,
          });
          succeeded += 1;
        } catch {
          failed += 1;
        }
      }
      closeTransferModal();
      setSelectedIds(new Set());
      await loadAll();
      if (failed > 0) {
        setError(
          `Transferred ${succeeded} employee${succeeded === 1 ? '' : 's'} to ${targetClientName}; ${failed} could not be transferred.`
        );
      } else if (employeeIds.length === 1) {
        const employee = employees.find((row) => row.id === employeeIds[0]);
        setToast(`${employee?.name ?? 'Employee'} marked exited and transferred to ${targetClientName}.`);
        setTimeout(() => setToast(null), 3500);
      } else {
        setToast(`Marked exited and transferred ${succeeded} employees to ${targetClientName}.`);
        setTimeout(() => setToast(null), 3500);
      }
    } catch (err) {
      setError(err.message || 'Could not transfer employees.');
    } finally {
      setTransferLoading(false);
    }
  };

  const handleTransferEmployee = async () => {
    if (!transferModalEmployee) return;
    await transferEmployees([transferModalEmployee.id]);
  };

  const handleTestingBulkTransfer = async () => {
    if (selectedIds.size === 0) return;
    await transferEmployees(Array.from(selectedIds));
  };

  const handleBulkRoleDetails = async (payload, options = {}) => {
    if (selectedIds.size === 0) return;
    setRoleDetailsLoading(true);
    setError(null);
    try {
      const ids = Array.from(selectedIds);
      const res = await api.bulkSetRoleDetails(ids, payload);
      if (options.sendOnboardingNow && (res.employee_ids?.length ?? 0) > 0) {
        const initiateRes = await api.initiateOnboarding(res.employee_ids);
        setToast(buildOnboardingInitiateToast('Role details set and onboarding initiated', initiateRes));
      } else {
        setToast(`Role details set for ${res.updated} employee${res.updated === 1 ? '' : 's'}`);
      }
      setBulkRoleModalOpen(false);
      setSelectedIds(new Set());
      await loadAll();
      setTimeout(() => setToast(null), 3500);
    } catch (err) {
      setError(err.message);
    } finally {
      setRoleDetailsLoading(false);
    }
  };

  const openBulkAssignRoleAndShareForm = () => {
    setTestingBulkMenuOpen(false);
    setBulkRoleForceSendOnboarding(true);
    setBulkRoleModalOpen(true);
  };

  const handleBulkRoleModalClose = () => {
    if (roleDetailsLoading) return;
    setBulkRoleModalOpen(false);
    setBulkRoleForceSendOnboarding(false);
  };

  const handleBulkRoleDetailsFromModal = async (payload, options = {}) => {
    const effectiveOptions = bulkRoleForceSendOnboarding
      ? { ...options, sendOnboardingNow: true }
      : options;
    await handleBulkRoleDetails(payload, effectiveOptions);
    setBulkRoleForceSendOnboarding(false);
  };

  const closeResponseModal = (opts = {}) => {
    if (responseDecisionLoading && !opts.force) return;
    setResponseModalOpen(false);
    setResponseModalEmployee(null);
    setResponseModalForm(null);
    setResponseModalPreviousRejectedFields([]);
    setResponseModalError('');
    setResponseModalLoading(false);
    setResponseDecisionLoading(false);
  };

  const openResponseModal = async (row) => {
    setResponseModalOpen(true);
    setResponseModalEmployee(row);
    setResponseModalForm(null);
    setResponseModalPreviousRejectedFields([]);
    setResponseModalError('');
    setResponseModalLoading(true);
    try {
      const data = await api.getEmployeeJobAppForm({ clientId: id, employeeId: row.id });
      setResponseModalForm(data.form);
      setResponseModalPreviousRejectedFields(
        Array.isArray(data.previous_correction_rejected_fields) ? data.previous_correction_rejected_fields : []
      );
    } catch (err) {
      setResponseModalError(err.message || 'Could not load application.');
    } finally {
      setResponseModalLoading(false);
    }
  };

  const handleResponseDecision = async (decisionPayload) => {
    if (!responseModalEmployee) return;
    setResponseModalError('');
    setResponseDecisionLoading(true);
    try {
      const data = await api.reviewEmployeeJobAppForm({
        clientId: id,
        employeeId: responseModalEmployee.id,
        payload: decisionPayload
      });
      setResponseModalForm(data.form ?? null);
      const d = String(decisionPayload?.decision_status ?? '').toUpperCase();
      const msg =
        d === 'APPROVED'
          ? 'Application approved.'
          : d === 'REJECTED'
            ? 'Application rejected.'
            : 'Correction requested from employee.';
      setToast(msg);
      await loadAll();
      setTimeout(() => setToast(null), 3000);
      // force: close while decision loading is still true (finally clears it after)
      closeResponseModal({ force: true });
    } catch (err) {
      setResponseModalError(err.message || 'Could not submit review decision.');
    } finally {
      setResponseDecisionLoading(false);
    }
  };

  const downloadJobAppFormsCsv = async (employeeIds) => {
    const blob = await api.exportJobAppFormsCsv({
      clientId: id,
      employeeIds,
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeClient = String(client?.name ?? 'client').replace(/[^\w.-]+/g, '_').slice(0, 40);
    a.download = `${safeClient}-onboarding-responses.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleExportResponsesCsv = async () => {
    if (selectedIds.size === 0) return;
    setResponsesExportLoading(true);
    setError(null);
    try {
      const employeeIds = Array.from(selectedIds);
      await downloadJobAppFormsCsv(employeeIds);
      setToast(`Downloaded CSV for ${employeeIds.length} response${employeeIds.length === 1 ? '' : 's'}.`);
      setTimeout(() => setToast(null), 3500);
    } catch (err) {
      setError(err.message || 'Could not export responses.');
    } finally {
      setResponsesExportLoading(false);
    }
  };

  const handleTestingBulkExportCsv = async () => {
    setTestingBulkMenuOpen(false);
    if (selectedIds.size === 0) return;

    const selectedRows = employees.filter((row) => selectedIds.has(row.id));
    const exportableRows = selectedRows.filter(canExportTestingFormResponse);
    if (exportableRows.length === 0) {
      setError('None of the selected employees have a submitted response to export (Responded or later).');
      return;
    }

    setResponsesExportLoading(true);
    setError(null);
    try {
      const employeeIds = exportableRows.map((row) => row.id);
      await downloadJobAppFormsCsv(employeeIds);
      const skipped = selectedRows.length - exportableRows.length;
      const exported = exportableRows.length;
      const skippedNote =
        skipped > 0 ? ` (${skipped} skipped — no submitted response)` : '';
      setToast(
        `Downloaded CSV for ${exported} response${exported === 1 ? '' : 's'}${skippedNote}.`
      );
      setTimeout(() => setToast(null), 3500);
    } catch (err) {
      setError(err.message || 'Could not export responses.');
    } finally {
      setResponsesExportLoading(false);
    }
  };

  const applyBulkJoiningStatus = async (employeeIds, { onSuccess, buildSuccessToast } = {}) => {
    if (employeeIds.length === 0 || !joiningBulkStatus) return;
    if (joiningBulkStatus === 'JOINED' || joiningBulkStatus === 'JOINED_OTHER_DATE') {
      setError('Joined statuses require Emp Code per employee. Use the row joining control instead of bulk.');
      return;
    }
    if (joiningBulkStatus === 'JOINED_OTHER_DATE' && !joiningBulkDate) {
      setError('Please select a date for "Joined on other date".');
      return;
    }
    setJoiningBulkLoading(true);
    setError(null);
    try {
      const res = await api.bulkSetJoiningStatus({
        clientId: id,
        employeeIds,
        joiningStatus: joiningBulkStatus,
        joiningActualDate: joiningBulkStatus === 'JOINED_OTHER_DATE' ? joiningBulkDate : null,
      });
      const failedCount = Array.isArray(res.failed) ? res.failed.length : 0;
      if (failedCount > 0) {
        setError(`Updated ${res.updated} employees; ${failedCount} could not be updated due to transition/rule checks.`);
      } else {
        const toastMessage = buildSuccessToast
          ? buildSuccessToast(res)
          : `Joining status updated for ${res.updated} employee${res.updated === 1 ? '' : 's'}.`;
        setToast(toastMessage);
        setTimeout(() => setToast(null), 3500);
      }
      setSelectedIds(new Set());
      await loadAll();
      onSuccess?.(res);
    } catch (err) {
      setError(err.message || 'Could not update joining status.');
    } finally {
      setJoiningBulkLoading(false);
    }
  };

  const handleBulkJoiningStatus = async () => {
    if (selectedIds.size === 0) return;
    await applyBulkJoiningStatus(Array.from(selectedIds));
  };

  const openTestingBulkJoiningModal = () => {
    setTestingBulkMenuOpen(false);
    setJoiningBulkStatus('');
    setJoiningBulkDate('');
    setError(null);
    setTestingJoiningModalOpen(true);
  };

  const closeTestingBulkJoiningModal = () => {
    if (joiningBulkLoading || extendDojBulkLoading) return;
    setTestingJoiningModalOpen(false);
    setJoiningBulkStatus('');
    setJoiningBulkDate('');
    setExtendDojBulkReason('');
  };

  const resetTestingBulkJoiningModal = () => {
    setTestingJoiningModalOpen(false);
    setJoiningBulkStatus('');
    setJoiningBulkDate('');
    setExtendDojBulkReason('');
  };

  const handleTestingBulkJoiningStatus = async () => {
    if (selectedIds.size === 0) return;
    const selectedRows = employees.filter((row) => selectedIds.has(row.id));
    const eligibleRows = selectedRows.filter(canBulkSetInitialJoiningStatus);
    if (eligibleRows.length === 0) {
      setError('None of the selected employees are PL Approved with joining status unset.');
      return;
    }
    const skipped = selectedRows.length - eligibleRows.length;
    await applyBulkJoiningStatus(eligibleRows.map((row) => row.id), {
      buildSuccessToast: (res) => {
        const base = `Joining status updated for ${res.updated} employee${res.updated === 1 ? '' : 's'}`;
        return skipped > 0
          ? `${base} (${skipped} skipped — not PL Approved or status already set).`
          : base;
      },
      onSuccess: () => resetTestingBulkJoiningModal(),
    });
  };

  const handleTestingBulkExtendDoj = async () => {
    if (selectedIds.size === 0 || extendDojBulkLoading || joiningBulkLoading) return;
    const selectedRows = employees.filter((row) => selectedIds.has(row.id));
    const eligibleRows = selectedRows.filter(canBulkRequestExtendDoj);
    if (eligibleRows.length === 0) {
      setError(
        'None of the selected employees are eligible for Extend DOJ (need PL Approved, DOJ set, no pending/unlocked request).'
      );
      return;
    }
    const skipped = selectedRows.length - eligibleRows.length;
    setExtendDojBulkLoading(true);
    setError(null);
    try {
      const res = await api.bulkRequestDojExtend({
        clientId: id,
        employeeIds: eligibleRows.map((row) => row.id),
        reason: extendDojBulkReason,
      });
      const failedCount = Array.isArray(res.failed) ? res.failed.length : 0;
      const updated = Number(res.updated ?? 0);
      let message = `Extend DOJ requested for ${updated} employee${updated === 1 ? '' : 's'}`;
      if (skipped > 0) message += ` (${skipped} skipped)`;
      if (failedCount > 0) message += `; ${failedCount} failed`;
      setToast(message);
      if (updated > 0) {
        resetTestingBulkJoiningModal();
        await softRefresh();
      }
    } catch (err) {
      setError(err.message || 'Could not send Extend DOJ requests.');
    } finally {
      setExtendDojBulkLoading(false);
    }
  };

  const testingBulkJoiningEligibleCount = useMemo(() => {
    if (!testingJoiningModalOpen) return 0;
    return employees.filter((row) => selectedIds.has(row.id) && canBulkSetInitialJoiningStatus(row)).length;
  }, [employees, selectedIds, testingJoiningModalOpen]);

  const testingBulkExtendDojEligibleCount = useMemo(() => {
    if (!testingJoiningModalOpen) return 0;
    return employees.filter((row) => selectedIds.has(row.id) && canBulkRequestExtendDoj(row)).length;
  }, [employees, selectedIds, testingJoiningModalOpen]);

  const startInlineJoiningEdit = (row) => {
    setJoiningInlineEmployeeId(row.id);
    setJoiningInlineStatus(String(row.joining_status ?? '').trim().toUpperCase());
    setJoiningInlineDate(String(row.joining_actual_date ?? '').trim());
    setJoiningInlineEmpCode(String(row.emp_code ?? '').trim());
    setError(null);
  };

  const cancelInlineJoiningEdit = () => {
    if (joiningInlineLoading) return;
    setJoiningInlineEmployeeId(null);
    setJoiningInlineStatus('');
    setJoiningInlineDate('');
    setJoiningInlineEmpCode('');
  };

  const saveInlineJoiningEdit = async (row) => {
    if (!joiningInlineStatus) return;
    const needsEmpCode =
      joiningInlineStatus === 'JOINED' || joiningInlineStatus === 'JOINED_OTHER_DATE';
    if (joiningInlineStatus === 'JOINED_OTHER_DATE' && !joiningInlineDate) {
      setError('Please select a date for "Joined on other date".');
      return;
    }
    const empCode = String(joiningInlineEmpCode ?? '').trim() || String(row.emp_code ?? '').trim();
    if (needsEmpCode && !empCode) {
      setError('Emp Code (StaffingGo) is required when marking Joined.');
      return;
    }
    setJoiningInlineLoading(true);
    setError(null);
    try {
      const res = await api.setJoiningStatus({
        clientId: id,
        employeeId: row.id,
        joiningStatus: joiningInlineStatus,
        joiningActualDate: joiningInlineStatus === 'JOINED_OTHER_DATE' ? joiningInlineDate : null,
        empCode: needsEmpCode ? empCode : null
      });
      if (!res?.employee) throw new Error('Could not update joining status.');
      setToast(`Joining status updated for ${row.name}.`);
      setTimeout(() => setToast(null), 3000);
      await loadAll();
      cancelInlineJoiningEdit();
    } catch (err) {
      setError(err.message || 'Could not update joining status.');
    } finally {
      setJoiningInlineLoading(false);
    }
  };

  const handleInlineStatusChange = async (row, value) => {
    const currentStatus = String(row.joining_status ?? '').trim().toUpperCase();
    setJoiningInlineEmployeeId(row.id);
    setJoiningInlineStatus(value);
    setJoiningInlineDate(value === 'JOINED_OTHER_DATE' ? String(row.joining_actual_date ?? '').trim() : '');
    setJoiningInlineEmpCode(String(row.emp_code ?? '').trim());
    if (!value) return;
    if (value === currentStatus) return;
    // Joined statuses need Emp Code (+ date for other-date) before save.
    if (value === 'JOINED' || value === 'JOINED_OTHER_DATE') {
      return;
    }
    setJoiningInlineDate('');
    setJoiningInlineLoading(true);
    setError(null);
    try {
      const res = await api.setJoiningStatus({
        clientId: id,
        employeeId: row.id,
        joiningStatus: value,
        joiningActualDate: null
      });
      if (!res?.employee) throw new Error('Could not update joining status.');
      setToast(`Joining status updated for ${row.name}.`);
      setTimeout(() => setToast(null), 3000);
      await loadAll();
      cancelInlineJoiningEdit();
    } catch (err) {
      setError(err.message || 'Could not update joining status.');
    } finally {
      setJoiningInlineLoading(false);
    }
  };

  const handleSingleRoleDetails = async (payload) => {
    if (!rowRoleModalEmployee) return;
    setRoleDetailsLoading(true);
    setError(null);
    try {
      await api.setEmployeeRoleDetails(rowRoleModalEmployee.id, payload);
      setToast(`Role details set for ${rowRoleModalEmployee.name}`);
      setRowRoleModalEmployee(null);
      setSelectedIds(new Set());
      await loadAll();
      setTimeout(() => setToast(null), 3500);
    } catch (err) {
      setError(err.message);
    } finally {
      setRoleDetailsLoading(false);
    }
  };

  const setAvailableFilter = (key, value) => {
    setAvailableFilters((prev) => ({ ...prev, [key]: value }));
  };

  const setRoleFilter = (key, value) => {
    setRoleFilters((prev) => ({ ...prev, [key]: value }));
  };

  const clearAvailableFilters = () => {
    setAvailableFilters({ name: '', mobile: '', email: '' });
    setPageByTab((prev) => ({ ...prev, pending: 1 }));
  };

  const clearRoleFilters = () => {
    setRoleFilters({ name: '', mobile: '', email: '', designation: '', pay_type: '' });
    setPageByTab((prev) => ({ ...prev, role_assigned: 1 }));
  };

  const submitExtendDojRequest = async () => {
    if (!extendDojModalEmployee || extendDojLoading) return;
    setExtendDojLoading(true);
    try {
      await api.requestDojExtend({
        clientId: id,
        employeeId: extendDojModalEmployee.id,
        reason: extendDojReason,
      });
      setToast(`Extend DOJ request sent for ${extendDojModalEmployee.name}. Waiting for Super Admin.`);
      setExtendDojModalEmployee(null);
      setExtendDojReason('');
      await softRefresh();
    } catch (err) {
      setToast(err.message || 'Could not send Extend DOJ request.');
    } finally {
      setExtendDojLoading(false);
    }
  };

  const submitJoiningStatusChangeRequest = async () => {
    if (!statusChangeModalEmployee || statusChangeLoading) return;
    setStatusChangeLoading(true);
    try {
      await api.requestJoiningStatusChange({
        clientId: id,
        employeeId: statusChangeModalEmployee.id,
        reason: statusChangeReason,
      });
      setToast(
        `Joining status change request sent for ${statusChangeModalEmployee.name}. Waiting for Super Admin.`
      );
      setStatusChangeModalEmployee(null);
      setStatusChangeReason('');
      await softRefresh();
    } catch (err) {
      setToast(err.message || 'Could not send joining status change request.');
    } finally {
      setStatusChangeLoading(false);
    }
  };

  const saveExtendedDoj = async (row) => {
    if (extendedDojSavingId) return;
    const nextDate = String(extendedDojDraftById[row.id] ?? '').trim();
    if (!nextDate) {
      setToast('Select a new Extended DOJ.');
      return;
    }
    setExtendedDojSavingId(row.id);
    try {
      await api.setExtendedDoj({
        clientId: id,
        employeeId: row.id,
        dateOfJoining: nextDate,
      });
      setToast(`Extended DOJ saved for ${row.name}. Joining status cleared.`);
      setExtendedDojDraftById((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
      await softRefresh();
    } catch (err) {
      setToast(err.message || 'Could not save Extended DOJ.');
    } finally {
      setExtendedDojSavingId(null);
    }
  };

  const transferTargetProjects = useMemo(
    () => pmClients.filter((pmClient) => pmClient.id !== id),
    [pmClients, id]
  );

  const renderJoiningStatusCell = (row, defaultLabel) => {
    const status = String(row.joining_status ?? '').trim().toUpperCase();
    const inTestingEmployees = activeTab === 'testing' && testingSubtab === 'employees';
    const isPayrollApprovedRow = String(row.form_payroll_review_status ?? '').trim().toUpperCase() === 'PAYROLL_APPROVED';
    const isPmApprovedRow = String(row.form_review_status ?? '').trim().toUpperCase() === 'APPROVED';
    const canRequestExtendContext =
      ((activeTab === 'pl_reviewed' && plReviewedSubtab === 'approved') || (inTestingEmployees && isPayrollApprovedRow)) &&
      isPayrollApprovedRow &&
      isPmApprovedRow;
    const unlock = Boolean(row.doj_extend_unlock);
    const pendingExtend = Boolean(row.doj_extend_request_pending);
    const statusUnlock = Boolean(row.joining_status_unlock);
    const pendingStatusChange = Boolean(row.joining_status_change_request_pending);
    const canInlineEdit =
      ((activeTab === 'pl_reviewed' && plReviewedSubtab === 'approved') || (inTestingEmployees && isPayrollApprovedRow)) &&
      isPayrollApprovedRow &&
      isPmApprovedRow &&
      (!status || statusUnlock);

    const formatExpiry = (iso) => {
      if (!iso) return null;
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return null;
      return d.toLocaleString();
    };

    const extendControls = canRequestExtendContext ? (
      <div className="mt-1.5 flex flex-col gap-1.5 border-t border-slate-100 pt-1.5">
        {unlock ? (
          <>
            <label className="text-[11px] font-medium text-amber-800">Extended DOJ (editable once)</label>
            <p className="text-[10px] text-amber-800">
              Max allowed: {row.doj_extend_max_date || '—'}
              {row.doj_extend_unlock_expires_at
                ? ` · Expires ${formatExpiry(row.doj_extend_unlock_expires_at)}`
                : ''}
            </p>
            <input
              type="date"
              max={row.doj_extend_max_date || undefined}
              value={extendedDojDraftById[row.id] ?? ''}
              onChange={(e) =>
                setExtendedDojDraftById((prev) => ({ ...prev, [row.id]: e.target.value }))
              }
              className="w-full rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-amber-300"
            />
            <button
              type="button"
              onClick={() => saveExtendedDoj(row)}
              disabled={extendedDojSavingId === row.id}
              className="self-start rounded bg-amber-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {extendedDojSavingId === row.id ? 'Saving…' : 'Save Extended DOJ'}
            </button>
          </>
        ) : pendingExtend ? (
          <span className="inline-flex w-fit rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 ring-1 ring-amber-200">
            Extend DOJ pending
          </span>
        ) : (
          <button
            type="button"
            onClick={() => {
              setExtendDojModalEmployee(row);
              setExtendDojReason('');
            }}
            className="self-start rounded border border-slate-300 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
          >
            Request Extend DOJ
          </button>
        )}
        {!unlock && (
          <p className="text-[10px] text-slate-500">
            Current DOJ: {row.date_of_joining || '—'}
          </p>
        )}
      </div>
    ) : null;

    const statusChangeControls =
      canRequestExtendContext && status ? (
        <div className="mt-1.5 flex flex-col gap-1 border-t border-slate-100 pt-1.5">
          {statusUnlock ? (
            <p className="text-[10px] text-emerald-800">
              Status unlocked once
              {row.joining_status_unlock_expires_at
                ? ` · Expires ${formatExpiry(row.joining_status_unlock_expires_at)}`
                : ''}
            </p>
          ) : pendingStatusChange ? (
            <span className="inline-flex w-fit rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-800 ring-1 ring-sky-200">
              Status change pending
            </span>
          ) : (
            <button
              type="button"
              onClick={() => {
                setStatusChangeModalEmployee(row);
                setStatusChangeReason('');
              }}
              className="self-start rounded border border-slate-300 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
            >
              Request status change
            </button>
          )}
        </div>
      ) : null;

    if (!canInlineEdit) {
      return (
        <div className="min-w-[220px]">
          <div>{defaultLabel(row)}</div>
          {statusChangeControls}
          {extendControls}
        </div>
      );
    }

    const currentValue = joiningInlineEmployeeId === row.id ? joiningInlineStatus : status;
    const currentDate = joiningInlineEmployeeId === row.id
      ? joiningInlineDate
      : String(row.joining_actual_date ?? '').trim();
    const currentEmpCode = joiningInlineEmployeeId === row.id
      ? joiningInlineEmpCode
      : String(row.emp_code ?? '').trim();
    const persistedDate = String(row.joining_actual_date ?? '').trim();
    const persistedEmpCode = String(row.emp_code ?? '').trim();
    const needsEmpCodeForCurrent =
      currentValue === 'JOINED' || currentValue === 'JOINED_OTHER_DATE';
    const shouldShowJoinedSave =
      needsEmpCodeForCurrent &&
      Boolean(String(currentEmpCode ?? '').trim()) &&
      (currentValue === 'JOINED_OTHER_DATE' || Boolean(currentDate) || currentValue === 'JOINED') &&
      (
        status !== currentValue ||
        (currentValue === 'JOINED_OTHER_DATE' && currentDate !== persistedDate) ||
        String(currentEmpCode ?? '').trim() !== persistedEmpCode
      );
    const allowedOptions = ['JOINED', 'NOT_JOINED', 'JOINED_OTHER_DATE', 'JOINED_ABSCONDED'];
    const dedupedOptions = Array.from(new Set(allowedOptions));
    const labelFor = (option) => {
      if (option === 'JOINED') return 'Joined';
      if (option === 'NOT_JOINED') return 'Not Joined';
      if (option === 'JOINED_OTHER_DATE') return 'Joined on other date';
      if (option === 'JOINED_ABSCONDED') return 'Joined and absconded';
      return option;
    };

    return (
      <div className="flex min-w-[220px] flex-col gap-1.5">
        <select
          value={currentValue || ''}
          onFocus={() => startInlineJoiningEdit(row)}
          onChange={(e) => handleInlineStatusChange(row, e.target.value)}
          disabled={joiningInlineLoading && joiningInlineEmployeeId === row.id}
          className="w-full rounded border border-slate-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300"
        >
          {!status ? <option value="">Set joining status…</option> : null}
          {dedupedOptions.map((option) => (
            <option key={option} value={option}>
              {labelFor(option)}
            </option>
          ))}
        </select>
        {currentValue === 'JOINED_OTHER_DATE' ? (
          <input
            type="date"
            value={currentDate}
            onChange={(e) => {
              setJoiningInlineEmployeeId(row.id);
              setJoiningInlineStatus('JOINED_OTHER_DATE');
              setJoiningInlineDate(e.target.value);
            }}
            className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
          />
        ) : null}
        {needsEmpCodeForCurrent ? (
          <input
            type="text"
            value={currentEmpCode}
            onChange={(e) => {
              setJoiningInlineEmployeeId(row.id);
              setJoiningInlineStatus(currentValue || 'JOINED');
              setJoiningInlineEmpCode(e.target.value);
            }}
            placeholder="Emp Code"
            className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
          />
        ) : null}
        {shouldShowJoinedSave ||
        (currentValue === 'JOINED_OTHER_DATE' &&
          currentDate &&
          (currentValue !== status || currentDate !== persistedDate)) ? (
          <button
            type="button"
            disabled={joiningInlineLoading && joiningInlineEmployeeId === row.id}
            onClick={() => saveInlineJoiningEdit(row)}
            className="self-start rounded bg-indigo-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {joiningInlineLoading && joiningInlineEmployeeId === row.id ? 'Saving…' : 'Save'}
          </button>
        ) : null}
        {statusChangeControls}
        {extendControls}
      </div>
    );
  };

  if (loading && !client) {
    return (
      <main className="mx-auto w-[98%] px-6 py-8 text-slate-500">Loading...</main>
    );
  }

  return (
    <main className="min-h-full">
        {client && activeTab !== 'attendance' && (
          <header className="sticky top-0 z-[60] isolate border-b border-slate-200 bg-white shadow-sm">
            <div className="mx-auto w-[98%] px-6 pb-4 pt-5">
              <ClientProjectMetaHeader
                title={client.client_name}
                contractCode={client.contract_code}
                contractStartDate={client.contract_start_date}
                contractEndDate={client.contract_end_date}
                openEndedContract={Boolean(client.open_ended_contract)}
                entity={client.entity}
                state={client.state}
                designations={client.designations}
                plApprovedCount={plApprovedRows.length}
                plRejectedCount={plRejectedRows.length}
                insuranceApplicable={Boolean(client.insurance_applicable)}
              >
                <nav className="mt-4 flex flex-wrap items-center gap-2" aria-label="Client views">
                  <NavLink
                    to={pmClientTabUrl(id, 'client_dashboard')}
                    className={({ isActive }) =>
                      `rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                        isActive
                          ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200/80'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      }`
                    }
                  >
                    Dashboard
                  </NavLink>
                  <NavLink
                    to={pmClientTabUrl(id, 'testing')}
                    className={({ isActive }) =>
                      `rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                        isActive
                          ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200/80'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      }`
                    }
                  >
                    Onboarding in Progress
                    <span className="ml-1.5 tabular-nums font-medium text-slate-500">({employees.length})</span>
                  </NavLink>
                </nav>
              </ClientProjectMetaHeader>
            </div>
          </header>
        )}

        <div className={activeTab === 'attendance' ? '' : 'bg-white'}>
          <div
            className={
              activeTab === 'attendance'
                ? 'px-6 pb-8 pt-4'
                : 'mx-auto w-[98%] px-6 py-6'
            }
          >
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded px-3 py-2 text-sm mb-4">
            {error}
          </div>
        )}

        {toast && (
          <div
            role="status"
            aria-live="polite"
            className="fixed bottom-6 left-1/2 z-[110] max-w-md -translate-x-1/2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900 shadow-lg"
          >
            {toast}
          </div>
        )}

        {activeTab === 'client_dashboard' && (
          <PmClientDashboard employees={employees} />
        )}

        {activeTab === 'attendance' && (
          <AttendancePanel clientId={id} role="PROGRAM_MANAGER" projectName={client?.client_name} />
        )}

        {(activeTab === 'pending' || activeTab === 'role_assigned') && (
          <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
            {activeTab === 'pending' && (
              <button
                type="button"
                onClick={() => {
                  setBulkRoleForceSendOnboarding(false);
                  setBulkRoleModalOpen(true);
                }}
                disabled={selectedIds.size === 0}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Set role details{selectedIds.size ? ` (${selectedIds.size})` : ''}
              </button>
            )}
            {activeTab === 'role_assigned' && (
              <button
                type="button"
                onClick={handleInitiate}
                disabled={selectedIds.size === 0 || ctaLoading}
                className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {ctaLoading ? 'Sending...' : `Send onboarding form${selectedIds.size ? ` (${selectedIds.size})` : ''}`}
              </button>
            )}
          </div>
        )}

        {((activeTab === 'in_progress' && inProgressSubtab === 'rejected') ||
          (activeTab === 'pl_reviewed' && plReviewedSubtab === 'rejected')) && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
            <p className="text-sm text-rose-900">
              Select rejected employees and re-initiate onboarding to let them refill the form from the beginning.
            </p>
            <button
              type="button"
              onClick={handleBulkReinitiate}
              disabled={selectedIds.size === 0 || ctaLoading}
              className="rounded-md bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {ctaLoading
                ? 'Re-initiating...'
                : `Re-initiate selected${selectedIds.size ? ` (${selectedIds.size})` : ''}`}
            </button>
          </div>
        )}

        {activeTab === 'employee_directory' && (
          <div className="mb-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3">
              <p className="text-sm text-indigo-900">
                Active employees in this project. Use Transfer to move an employee to another project.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[240px]">
                  <label className="mb-1 block text-xs font-medium text-slate-600">Filter by status</label>
                  <select
                    value={directoryStatusFilter}
                    onChange={(e) => {
                      setDirectoryStatusFilter(e.target.value);
                      setPageByTab((prev) => ({ ...prev, employee_directory: 1 }));
                    }}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  >
                    <option value="">All statuses</option>
                    {directoryStatusOptions.map((status) => (
                      <option key={status} value={status}>
                        {formatEmployeeStatusLabel(status)}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setDirectoryStatusFilter('');
                    setPageByTab((prev) => ({ ...prev, employee_directory: 1 }));
                  }}
                  disabled={!directoryStatusFilter}
                  className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Clear filter
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'testing' && (
          <div className="mb-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-1">
                <button
                  type="button"
                  onClick={() => setTestingSubtab('add_employee')}
                  className={`rounded-md px-4 py-2 text-sm font-medium ${
                    testingSubtab === 'add_employee'
                      ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200/80'
                      : 'text-slate-600 hover:bg-white/70'
                  }`}
                >
                  Add Employee
                </button>
                <button
                  type="button"
                  onClick={() => setTestingSubtab('employees')}
                  className={`rounded-md px-4 py-2 text-sm font-medium ${
                    testingSubtab === 'employees'
                      ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200/80'
                      : 'text-slate-600 hover:bg-white/70'
                  }`}
                >
                  Employees
                </button>
                <button
                  type="button"
                  onClick={() => setTestingSubtab('rejected')}
                  className={`rounded-md px-4 py-2 text-sm font-medium ${
                    testingSubtab === 'rejected'
                      ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200/80'
                      : 'text-slate-600 hover:bg-white/70'
                  }`}
                >
                  Rejected
                </button>
              </div>
              {(testingSubtab === 'employees' || testingSubtab === 'rejected') && (
                <div className="relative" ref={testingBulkMenuRef}>
                  <button
                    type="button"
                    onClick={() => setTestingBulkMenuOpen((v) => !v)}
                    disabled={selectedIds.size === 0 || ctaLoading || transferLoading}
                    className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Bulk Action
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
                    </svg>
                  </button>
                  {testingBulkMenuOpen && (
                    <div className="absolute right-0 z-[60] mt-2 w-56 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
                      {testingSubtab === 'employees' && (
                        <>
                          <button
                            type="button"
                            onClick={openBulkAssignRoleAndShareForm}
                            className="block w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"
                          >
                            Assign Role &amp; Share Form
                          </button>
                          <button
                            type="button"
                            onClick={handleTestingBulkExportCsv}
                            disabled={responsesExportLoading}
                            className="block w-full border-t border-slate-100 px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {responsesExportLoading ? 'Preparing...' : 'Download Response'}
                          </button>
                          <button
                            type="button"
                            onClick={openTestingBulkJoiningModal}
                            className="block w-full border-t border-slate-100 px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"
                          >
                            Update Joining Status
                          </button>
                        </>
                      )}
                      {testingSubtab === 'rejected' && (
                        <button
                          type="button"
                          onClick={() => {
                            setTestingBulkMenuOpen(false);
                            handleBulkReinitiate();
                          }}
                          disabled={ctaLoading}
                          className="block w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {ctaLoading ? 'Re-initiating...' : 'Re-initiate'}
                        </button>
                      )}
                      {(testingSubtab === 'employees' || testingSubtab === 'rejected') && (
                        <button
                          type="button"
                          onClick={openTestingBulkTransferModal}
                          className="block w-full border-t border-slate-100 px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"
                        >
                          Transfer
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="text-sm text-slate-700">
              {testingSubtab === 'add_employee'
                ? 'Add employees manually or upload them in bulk.'
                : testingSubtab === 'employees'
                  ? 'Showing all employee records from the employee table for this client.'
                  : 'Showing employees rejected by either PM or Payroll Lead. Select employees and use Bulk Action to re-initiate onboarding.'}
            </div>
            {testingSubtab === 'rejected' && (
              <>
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                  Re-initiate lets rejected employees refill the onboarding form from the beginning.
                </div>
                <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="min-w-[240px]">
                      <label className="mb-1 block text-xs font-medium text-slate-600">Filter by rejected by</label>
                      <select
                        value={testingRejectedByFilter}
                        onChange={(e) => {
                          setTestingRejectedByFilter(e.target.value);
                          setPageByTab((prev) => ({ ...prev, testing_rejected: 1 }));
                        }}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                      >
                        <option value="">All rejections</option>
                        {TESTING_REJECTED_BY_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setTestingRejectedByFilter('');
                        setPageByTab((prev) => ({ ...prev, testing_rejected: 1 }));
                      }}
                      disabled={!testingRejectedByFilter}
                      className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Clear filter
                    </button>
                  </div>
                </div>
              </>
            )}
            {testingSubtab === 'employees' && (
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-[240px]">
                    <label className="mb-1 block text-xs font-medium text-slate-600">Filter by form status</label>
                    <select
                      value={testingFormStatusFilter}
                      onChange={(e) => {
                        setTestingFormStatusFilter(e.target.value);
                        setPageByTab((prev) => ({ ...prev, testing_employees: 1 }));
                      }}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    >
                      <option value="">All form statuses</option>
                      {TESTING_FORM_STATUS_OPTIONS.map((status) => (
                        <option key={status} value={status}>
                          {formatEmployeeStatusLabel(status)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="min-w-[240px]">
                    <label className="mb-1 block text-xs font-medium text-slate-600">Filter by joining status</label>
                    <select
                      value={testingJoiningStatusFilter}
                      onChange={(e) => {
                        setTestingJoiningStatusFilter(e.target.value);
                        setPageByTab((prev) => ({ ...prev, testing_employees: 1 }));
                      }}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    >
                      <option value="">All joining statuses</option>
                      {TESTING_JOINING_STATUS_OPTIONS.map((status) => (
                        <option key={status.value} value={status.value}>
                          {status.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setTestingFormStatusFilter('');
                      setTestingJoiningStatusFilter('');
                      setPageByTab((prev) => ({ ...prev, testing_employees: 1 }));
                    }}
                    disabled={!testingFormStatusFilter && !testingJoiningStatusFilter}
                    className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Clear filters
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {showAddEmployeePanel && client && (
          <div className="mb-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 bg-slate-50/80 px-6 py-4">
              <h2 className="text-lg font-semibold text-slate-900">Add employees</h2>
              <p className="mt-0.5 text-sm text-slate-500">
                Upload many from a file or add one person manually — both options are available below.
              </p>
            </div>
            <div className="grid grid-cols-1 divide-y divide-slate-200 lg:grid-cols-2 lg:divide-x lg:divide-y-0 lg:divide-slate-200">
              <section className="flex min-h-[240px] flex-col p-6 lg:p-8">
                <h3 className="text-base font-semibold text-slate-900">Upload using CSV / Excel</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Use a spreadsheet with columns <code className="rounded bg-slate-100 px-1 text-xs">name</code>,{' '}
                  <code className="rounded bg-slate-100 px-1 text-xs">mobile</code>,{' '}
                  <code className="rounded bg-slate-100 px-1 text-xs">email</code>.
                </p>
                <div className="mt-4 min-h-0 flex-1">
                  <BulkUploadModal
                    embedded
                    clientId={id}
                    onClose={() => {}}
                    onDone={async () => {
                      await loadAll();
                      setToast('Employees imported successfully.');
                      setTimeout(() => setToast(null), 3500);
                    }}
                  />
                </div>
              </section>
              <section className="flex min-h-[240px] flex-col p-6 lg:p-8">
                <h3 className="text-base font-semibold text-slate-900">Add available employee</h3>
                <p className="mt-1 text-sm text-slate-500">Enter one employee to add to the available pool.</p>
                <div className="mt-4 min-h-0 flex-1">
                  <AddEmployeeModal
                    embedded
                    clientId={id}
                    onClose={() => {}}
                    onCreated={async (created) => {
                      await loadAll();
                      const name = String(created?.name ?? '').trim();
                      setToast(
                        name
                          ? `${name} was added successfully.`
                          : 'Employee was added successfully.'
                      );
                      setTimeout(() => setToast(null), 3500);
                    }}
                  />
                </div>
              </section>
            </div>
          </div>
        )}

        {activeTab === 'pending' && (
          <div className="bg-white border border-slate-200 rounded-lg p-4 mb-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[200px] flex-1">
                <label className="block text-xs font-medium text-slate-600 mb-1">Filter by name</label>
                <input
                  type="text"
                  value={availableFilters.name}
                  onChange={(e) => setAvailableFilter('name', e.target.value)}
                  placeholder="Type a name"
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>
              <div className="min-w-[180px] flex-1">
                <label className="block text-xs font-medium text-slate-600 mb-1">Filter by mobile</label>
                <input
                  type="text"
                  value={availableFilters.mobile}
                  onChange={(e) => setAvailableFilter('mobile', e.target.value)}
                  placeholder="Type a mobile"
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>
              <div className="min-w-[220px] flex-1">
                <label className="block text-xs font-medium text-slate-600 mb-1">Filter by email</label>
                <input
                  type="text"
                  value={availableFilters.email}
                  onChange={(e) => setAvailableFilter('email', e.target.value)}
                  placeholder="Type an email"
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>
              <button
                type="button"
                onClick={clearAvailableFilters}
                disabled={!hasActiveAvailableFilters}
                className="px-3 py-2 text-sm rounded border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Clear filters
              </button>
            </div>
          </div>
        )}

        {activeTab === 'role_assigned' && (
          <div className="bg-white border border-slate-200 rounded-lg p-4 mb-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[200px] flex-1">
                <label className="block text-xs font-medium text-slate-600 mb-1">Filter by name</label>
                <input
                  type="text"
                  value={roleFilters.name}
                  onChange={(e) => setRoleFilter('name', e.target.value)}
                  placeholder="Type a name"
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>
              <div className="min-w-[180px] flex-1">
                <label className="block text-xs font-medium text-slate-600 mb-1">Filter by mobile</label>
                <input
                  type="text"
                  value={roleFilters.mobile}
                  onChange={(e) => setRoleFilter('mobile', e.target.value)}
                  placeholder="Type a mobile"
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>
              <div className="min-w-[220px] flex-1">
                <label className="block text-xs font-medium text-slate-600 mb-1">Filter by email</label>
                <input
                  type="text"
                  value={roleFilters.email}
                  onChange={(e) => setRoleFilter('email', e.target.value)}
                  placeholder="Type an email"
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>
              <div className="min-w-[180px]">
                <label className="block text-xs font-medium text-slate-600 mb-1">Designation</label>
                <select
                  value={roleFilters.designation}
                  onChange={(e) => setRoleFilter('designation', e.target.value)}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                >
                  <option value="">All designations</option>
                  {(client?.designations ?? []).map((d) => {
                    const name = d && typeof d === 'object' ? d.name : d;
                    return (
                      <option key={name} value={name}>{formatDesignationLabel(name)}</option>
                    );
                  })}
                </select>
              </div>
              <div className="min-w-[220px]">
                <label className="block text-xs font-medium text-slate-600 mb-1">Pay Type</label>
                <div className="flex border border-slate-300 rounded-md overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setRoleFilter('pay_type', '')}
                    className={`px-3 py-2 text-sm border-r border-slate-300 ${roleFilters.pay_type === '' ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-slate-50'}`}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={() => setRoleFilter('pay_type', 'CTC')}
                    className={`px-3 py-2 text-sm border-r border-slate-300 ${roleFilters.pay_type === 'CTC' ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-slate-50'}`}
                  >
                    CTC
                  </button>
                  <button
                    type="button"
                    onClick={() => setRoleFilter('pay_type', 'NET_PAY')}
                    className={`px-3 py-2 text-sm ${roleFilters.pay_type === 'NET_PAY' ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-slate-50'}`}
                  >
                    Net Pay
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={clearRoleFilters}
                disabled={!hasActiveRoleFilters}
                className="px-3 py-2 text-sm rounded border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Clear filters
              </button>
            </div>
          </div>
        )}

        {activeTab === 'pl_reviewed' && plReviewedSubtab === 'approved' && (
          <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="min-w-[220px]">
              <label className="mb-1 block text-xs font-medium text-slate-600">Joining status (bulk)</label>
              <select
                value={joiningBulkStatus}
                onChange={(e) => setJoiningBulkStatus(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              >
                <option value="">Select status</option>
                <option value="NOT_JOINED">Not Joined</option>
                <option value="JOINED_ABSCONDED">Joined and absconded</option>
              </select>
              <p className="mt-1 text-[11px] text-slate-500">
                For Joined / Joined on other date, set Emp Code on each employee row.
              </p>
            </div>
            <button
              type="button"
              onClick={handleBulkJoiningStatus}
              disabled={
                selectedIds.size === 0 ||
                !joiningBulkStatus ||
                joiningBulkLoading
              }
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {joiningBulkLoading
                ? 'Updating...'
                : `Update joining status${selectedIds.size ? ` (${selectedIds.size})` : ''}`}
            </button>
          </div>
        )}

        {activeTab === 'in_progress' && (
          <div className="mb-4 flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-slate-50 p-1.5">
            <button
              type="button"
              onClick={() => setInProgressSubtab('form_sent')}
              className={`min-w-0 flex-1 rounded-lg px-4 py-2.5 text-center text-sm font-semibold transition-colors sm:flex-none sm:px-6 ${
                inProgressSubtab === 'form_sent'
                  ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200/80'
                  : 'text-slate-600 hover:bg-white/60 hover:text-slate-900'
              }`}
            >
              Form Sent
              <span className="ml-1.5 tabular-nums text-slate-500">({formSentRows.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setInProgressSubtab('responses')}
              className={`min-w-0 flex-1 rounded-lg px-4 py-2.5 text-center text-sm font-semibold transition-colors sm:flex-none sm:px-6 ${
                inProgressSubtab === 'responses'
                  ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200/80'
                  : 'text-slate-600 hover:bg-white/60 hover:text-slate-900'
              }`}
            >
              Responses
              <span className="ml-1.5 tabular-nums text-slate-500">({responsesRows.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setInProgressSubtab('correction_requested')}
              className={`min-w-0 flex-1 rounded-lg px-4 py-2.5 text-center text-sm font-semibold transition-colors sm:flex-none sm:px-6 ${
                inProgressSubtab === 'correction_requested'
                  ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200/80'
                  : 'text-slate-600 hover:bg-white/60 hover:text-slate-900'
              }`}
            >
              Correction Requested
              <span className="ml-1.5 tabular-nums text-slate-500">({correctionRequestedRows.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setInProgressSubtab('approved')}
              className={`min-w-0 flex-1 rounded-lg px-4 py-2.5 text-center text-sm font-semibold transition-colors sm:flex-none sm:px-6 ${
                inProgressSubtab === 'approved'
                  ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200/80'
                  : 'text-slate-600 hover:bg-white/60 hover:text-slate-900'
              }`}
            >
              Approved
              <span className="ml-1.5 tabular-nums text-slate-500">({inProgressApprovedRows.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setInProgressSubtab('rejected')}
              className={`min-w-0 flex-1 rounded-lg px-4 py-2.5 text-center text-sm font-semibold transition-colors sm:flex-none sm:px-6 ${
                inProgressSubtab === 'rejected'
                  ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200/80'
                  : 'text-slate-600 hover:bg-white/60 hover:text-slate-900'
              }`}
            >
              Rejected
              <span className="ml-1.5 tabular-nums text-slate-500">({rejectedRows.length})</span>
            </button>
          </div>
        )}

        {activeTab === 'in_progress' && inProgressSubtab === 'approved' && (
          <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-2 text-xs text-slate-600">
            These are PM-approved applications currently pending Payroll Lead decision.
          </div>
        )}

        {activeTab === 'in_progress' && inProgressSubtab === 'responses' && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3">
            <p className="text-sm text-indigo-900">
              Select submitted responses and download one CSV with all answers and document links (links download files when opened).
            </p>
            <button
              type="button"
              onClick={handleExportResponsesCsv}
              disabled={selectedIds.size === 0 || responsesExportLoading}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {responsesExportLoading
                ? 'Preparing...'
                : `Download Response${selectedIds.size ? ` (${selectedIds.size})` : ''}`}
            </button>
          </div>
        )}

        {activeTab === 'pl_reviewed' && (
          <div className="mb-4 flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-slate-50/80 p-1.5">
            <button
              type="button"
              onClick={() => setPlReviewedSubtab('approved')}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                plReviewedSubtab === 'approved'
                  ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200/80'
                  : 'text-slate-600 hover:bg-white/70'
              }`}
            >
              PL Approved
              <span className="ml-1.5 tabular-nums text-slate-500">({plApprovedRows.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setPlReviewedSubtab('rejected')}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                plReviewedSubtab === 'rejected'
                  ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200/80'
                  : 'text-slate-600 hover:bg-white/70'
              }`}
            >
              PL Rejected
              <span className="ml-1.5 tabular-nums text-slate-500">({plRejectedRows.length})</span>
            </button>
          </div>
        )}

        {showEmployeeTable && (
        <EmployeeTable
          rows={pagedRows}
          selectedIds={selectedIds}
          onToggle={toggle}
          onToggleAll={toggleAll}
          selectable={
            activeTab === 'pending' ||
            activeTab === 'role_assigned' ||
            (activeTab === 'testing' && testingSubtab === 'employees') ||
            (activeTab === 'testing' && testingSubtab === 'rejected') ||
            (activeTab === 'in_progress' && inProgressSubtab === 'responses') ||
            (activeTab === 'pl_reviewed' && plReviewedSubtab === 'approved') ||
            (activeTab === 'in_progress' && inProgressSubtab === 'rejected') ||
            (activeTab === 'pl_reviewed' && plReviewedSubtab === 'rejected')
          }
          showJobColumns={activeTab !== 'pending'}
          showStatusColumn={activeTab !== 'pl_reviewed' || plReviewedSubtab === 'approved'}
          statusColumnLabel={
            activeTab === 'testing'
              ? 'Form Status'
              : activeTab === 'pl_reviewed'
                ? 'PL Status'
                : 'Status'
          }
          showNotAssignedForMissingRoleDetails={activeTab === 'testing' && testingSubtab === 'employees'}
          forceNotSentStatusForMissingRoleDetails={activeTab === 'testing' && testingSubtab === 'employees'}
          showRespondedForSubmittedForms={activeTab === 'testing' && testingSubtab === 'employees'}
          showApprovedForPmApproved
          showPlApprovedForPayrollApproved
          showRequestCorrectionForReview={activeTab === 'testing' && testingSubtab === 'employees'}
          showJoiningStatus={activeTab === 'pl_reviewed' || (activeTab === 'testing' && testingSubtab === 'employees')}
          joiningStatusCellRenderer={renderJoiningStatusCell}
          showFormLink={activeTab === 'in_progress' && inProgressSubtab === 'form_sent'}
          formLinkForRow={
            activeTab === 'in_progress' && inProgressSubtab === 'form_sent' ? employeeOnboardingFormPath : null
          }
          showViewResponse={
            (activeTab === 'testing' && testingSubtab === 'employees') ||
            (activeTab === 'in_progress' && inProgressSubtab !== 'form_sent') ||
            (activeTab === 'pl_reviewed' && plReviewedSubtab === 'approved')
          }
          onViewResponse={openResponseModal}
          reviewColumnLabel={activeTab === 'testing' ? 'Review' : 'View'}
          showReviewTextCta={activeTab === 'testing' && testingSubtab === 'employees'}
          reviewCtaForSubmittedOnly={activeTab === 'testing' && testingSubtab === 'employees'}
          statusForRow={activeTab === 'testing' && testingSubtab === 'rejected' ? (row) => row.testing_form_status : null}
          showDateColumn={activeTab === 'testing' && testingSubtab === 'rejected'}
          dateForRow={activeTab === 'testing' && testingSubtab === 'rejected' ? (row) => formatReviewDateTime(row.testing_rejected_at) : null}
          showRemarksColumn={activeTab === 'testing' && testingSubtab === 'rejected'}
          remarksForRow={activeTab === 'testing' && testingSubtab === 'rejected' ? (row) => String(row.testing_rejected_remarks ?? '').trim() || '-' : null}
          actionLabel={activeTab === 'pending' ? 'Set Details' : activeTab === 'employee_directory' ? 'Transfer' : null}
          onRowAction={
            activeTab === 'pending'
              ? (row) => setRowRoleModalEmployee(row)
              : activeTab === 'employee_directory'
                ? openTransferModal
                : null
          }
        />
        )}

        {showEmployeeTable && visibleRows.length > 0 && !paginationDisabled && (
          <div className="flex items-center justify-between mt-3 text-sm text-slate-600">
            <div>
              Showing {(currentPage - 1) * effectivePageSize + 1}
              {' - '}
              {Math.min(currentPage * effectivePageSize, visibleRows.length)}
              {' of '}
              {visibleRows.length}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setPageByTab((prev) => ({
                    ...prev,
                    [paginationTabKey]: Math.max(1, currentPage - 1)
                  }))
                }
                disabled={currentPage === 1}
                className="px-3 py-1.5 rounded border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="text-slate-700">Page {currentPage} of {totalPages}</span>
              <button
                type="button"
                onClick={() =>
                  setPageByTab((prev) => ({
                    ...prev,
                    [paginationTabKey]: Math.min(totalPages, currentPage + 1)
                  }))
                }
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 rounded border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {testingJoiningModalOpen && (
          <ModalOverlay onClose={closeTestingBulkJoiningModal} backdropClassName="bg-slate-900/50">
            <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-2xl">
              <h3 className="text-lg font-semibold text-slate-900">Update Joining Status (Bulk)</h3>
              <p className="mt-1 text-sm text-slate-600">
                Applies to {testingBulkJoiningEligibleCount} selected employee
                {testingBulkJoiningEligibleCount === 1 ? '' : 's'} at PL Approved stage with joining status unset.
                Others in the selection will be skipped.
              </p>
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <div className="min-w-[220px] flex-1">
                  <label className="mb-1 block text-xs font-medium text-slate-600">Joining status</label>
                  <select
                    value={joiningBulkStatus}
                    onChange={(e) => setJoiningBulkStatus(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    disabled={joiningBulkLoading || extendDojBulkLoading}
                  >
                    <option value="">Select status</option>
                    <option value="NOT_JOINED">Not Joined</option>
                    <option value="JOINED_ABSCONDED">Joined and absconded</option>
                  </select>
                  <p className="mt-1 text-[11px] text-slate-500">
                    For Joined / Joined on other date, set Emp Code on each employee row.
                  </p>
                </div>
              </div>
              <div className="mt-5 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={handleTestingBulkJoiningStatus}
                  disabled={
                    testingBulkJoiningEligibleCount === 0 ||
                    !joiningBulkStatus ||
                    joiningBulkLoading ||
                    extendDojBulkLoading
                  }
                  className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {joiningBulkLoading ? 'Updating...' : 'Update joining status'}
                </button>
              </div>

              <div className="mt-6 border-t border-slate-200 pt-5">
                <h4 className="text-sm font-semibold text-slate-900">Request Extend DOJ</h4>
                <p className="mt-1 text-sm text-slate-600">
                  Applies to {testingBulkExtendDojEligibleCount} selected employee
                  {testingBulkExtendDojEligibleCount === 1 ? '' : 's'} at PL Approved stage with DOJ set and no
                  pending/unlocked request. Others in the selection will be skipped.
                </p>
                <label className="mt-3 mb-1 block text-xs font-medium text-slate-600">
                  Reason (optional, applied to all)
                </label>
                <textarea
                  value={extendDojBulkReason}
                  onChange={(e) => setExtendDojBulkReason(e.target.value)}
                  rows={2}
                  disabled={joiningBulkLoading || extendDojBulkLoading}
                  placeholder="Why do these employees need an extended joining date?"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:opacity-60"
                />
                <div className="mt-4 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={closeTestingBulkJoiningModal}
                    disabled={joiningBulkLoading || extendDojBulkLoading}
                    className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleTestingBulkExtendDoj}
                    disabled={
                      testingBulkExtendDojEligibleCount === 0 ||
                      joiningBulkLoading ||
                      extendDojBulkLoading
                    }
                    className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {extendDojBulkLoading ? 'Sending…' : 'Request Extend DOJ'}
                  </button>
                </div>
              </div>
            </div>
          </ModalOverlay>
        )}
        {bulkRoleModalOpen && (
          <RoleDetailsModal
            title={bulkRoleForceSendOnboarding ? 'Assign Role & Share Form' : 'Set Role Details (Bulk)'}
            description={
              bulkRoleForceSendOnboarding
                ? `Assign expected date of joining, CTC or Net Pay, and state, then share onboarding form for ${selectedIds.size} selected employee${selectedIds.size === 1 ? '' : 's'}.`
                : `Apply the same role details (expected date of joining, CTC or Net Pay, state) to ${selectedIds.size} selected available employee${selectedIds.size === 1 ? '' : 's'}.`
            }
            designations={client?.designations ?? []}
            defaultState={client?.state ?? ''}
            zoneDependency={Boolean(client?.zone_dependency)}
            cushionType={client?.cushion_type ?? null}
            cushionValue={client?.cushion_value ?? null}
            submitting={roleDetailsLoading}
            showSendOnboardingOption={!bulkRoleForceSendOnboarding}
            onClose={handleBulkRoleModalClose}
            onSubmit={handleBulkRoleDetailsFromModal}
          />
        )}
        {rowRoleModalEmployee && (
          <RoleDetailsModal
            title={`Set Role Details - ${rowRoleModalEmployee.name}`}
            description="Set designation, expected date of joining, CTC or Net Pay, and state for this employee."
            designations={client?.designations ?? []}
            defaultState={client?.state ?? ''}
            zoneDependency={Boolean(client?.zone_dependency)}
            cushionType={client?.cushion_type ?? null}
            cushionValue={client?.cushion_value ?? null}
            submitting={roleDetailsLoading}
            onClose={() => setRowRoleModalEmployee(null)}
            onSubmit={handleSingleRoleDetails}
          />
        )}
        {(transferModalEmployee || testingBulkTransferModalOpen) && (
          <ModalOverlay
            onClose={closeTransferModal}
            backdropClassName="bg-slate-900/50"
          >
            <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-2xl">
              <h3 className="text-lg font-semibold text-slate-900">
                {testingBulkTransferModalOpen
                  ? 'Confirm transfer & mark exit (Bulk)'
                  : 'Confirm transfer & mark exit'}
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                Review the details below. Transferring will mark exit from{' '}
                <span className="font-medium text-slate-800">
                  {client?.client_name || 'this project'}
                </span>
                , reset onboarding, and move the employee to Available on the target project.
              </p>

              {!testingBulkTransferModalOpen && transferModalEmployee && (
                <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Employee details
                  </p>
                  <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-xs text-slate-500">Name</dt>
                      <dd className="font-medium text-slate-900">{transferModalEmployee.name || '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Reference ID</dt>
                      <dd className="font-mono text-xs text-slate-800">
                        {transferModalEmployee.reference_id || '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Emp Code</dt>
                      <dd className="font-mono text-xs text-slate-800">
                        {transferModalEmployee.emp_code || '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Mobile</dt>
                      <dd className="text-slate-800">{transferModalEmployee.mobile || '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Email</dt>
                      <dd className="break-all text-slate-800">{transferModalEmployee.email || '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Designation</dt>
                      <dd className="text-slate-800">
                        {formatDesignationLabel(transferModalEmployee.designation) || '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Expected Date of Joining</dt>
                      <dd className="text-slate-800">
                        {transferModalEmployee.date_of_joining || '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Current project</dt>
                      <dd className="text-slate-800">{client?.client_name || '—'}</dd>
                    </div>
                  </dl>
                </div>
              )}

              {testingBulkTransferModalOpen && (
                <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-sm text-slate-700">
                    <span className="font-semibold text-slate-900">{selectedIds.size}</span> selected
                    employee{selectedIds.size === 1 ? '' : 's'} will be marked exited from{' '}
                    <span className="font-medium">{client?.client_name || 'this project'}</span> and
                    transferred.
                  </p>
                </div>
              )}

              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                This marks exit from the current project assignment (inactive with exit reason) before
                assigning to the new project.
              </div>

              <div className="mt-4 space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Target project
                  </label>
                  <select
                    value={transferTargetClientId}
                    onChange={(e) => setTransferTargetClientId(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  >
                    <option value="">Select target project</option>
                    {transferTargetProjects.map((pmClient) => (
                      <option key={pmClient.id} value={pmClient.id}>
                        {pmClient.client_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Exit / transfer reason <span className="normal-case text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={transferReason}
                    onChange={(e) => setTransferReason(e.target.value)}
                    placeholder="e.g. Project completed / Client request"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                </div>
                {transferTargetProjects.length === 0 && (
                  <p className="text-xs text-amber-700">
                    No other projects available under your access for transfer.
                  </p>
                )}
              </div>
              <div className="mt-5 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={closeTransferModal}
                  disabled={transferLoading}
                  className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={testingBulkTransferModalOpen ? handleTestingBulkTransfer : handleTransferEmployee}
                  disabled={
                    !transferTargetClientId ||
                    !String(transferReason ?? '').trim() ||
                    transferLoading ||
                    (testingBulkTransferModalOpen && selectedIds.size === 0)
                  }
                  className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {transferLoading
                    ? 'Transferring...'
                    : testingBulkTransferModalOpen
                      ? `Confirm exit & transfer${selectedIds.size ? ` (${selectedIds.size})` : ''}`
                      : 'Confirm exit & transfer'}
                </button>
              </div>
            </div>
          </ModalOverlay>
        )}

        {extendDojModalEmployee && (
          <ModalOverlay
            onClose={() => {
              if (extendDojLoading) return;
              setExtendDojModalEmployee(null);
              setExtendDojReason('');
            }}
            backdropClassName="bg-slate-900/50"
          >
            <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl">
              <h3 className="text-lg font-semibold text-slate-900">Request Extend DOJ</h3>
              <p className="mt-1 text-sm text-slate-600">
                Super Admin will approve or reject this request for{' '}
                <span className="font-medium text-slate-900">{extendDojModalEmployee.name}</span>.
                Current DOJ: {extendDojModalEmployee.date_of_joining || '—'}.
              </p>
              <label className="mt-4 mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Reason (optional)
              </label>
              <textarea
                value={extendDojReason}
                onChange={(e) => setExtendDojReason(e.target.value)}
                rows={3}
                placeholder="Why does this employee need an extended joining date?"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  disabled={extendDojLoading}
                  onClick={() => {
                    setExtendDojModalEmployee(null);
                    setExtendDojReason('');
                  }}
                  className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={extendDojLoading}
                  onClick={submitExtendDojRequest}
                  className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
                >
                  {extendDojLoading ? 'Sending…' : 'Send request'}
                </button>
              </div>
            </div>
          </ModalOverlay>
        )}

        {statusChangeModalEmployee && (
          <ModalOverlay
            onClose={() => {
              if (statusChangeLoading) return;
              setStatusChangeModalEmployee(null);
              setStatusChangeReason('');
            }}
            backdropClassName="bg-slate-900/50"
          >
            <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl">
              <h3 className="text-lg font-semibold text-slate-900">Request joining status change</h3>
              <p className="mt-1 text-sm text-slate-600">
                Super Admin will unlock a one-time change for{' '}
                <span className="font-medium text-slate-900">{statusChangeModalEmployee.name}</span>.
                Current status: {statusChangeModalEmployee.joining_status || '—'}.
              </p>
              <label className="mt-4 mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Reason (optional)
              </label>
              <textarea
                value={statusChangeReason}
                onChange={(e) => setStatusChangeReason(e.target.value)}
                rows={3}
                placeholder="Why does this status need to change?"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  disabled={statusChangeLoading}
                  onClick={() => {
                    setStatusChangeModalEmployee(null);
                    setStatusChangeReason('');
                  }}
                  className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={statusChangeLoading}
                  onClick={submitJoiningStatusChangeRequest}
                  className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
                >
                  {statusChangeLoading ? 'Sending…' : 'Send request'}
                </button>
              </div>
            </div>
          </ModalOverlay>
        )}

        <EmployeeFormResponseModal
          open={responseModalOpen}
          onClose={closeResponseModal}
          employeeName={responseModalEmployee?.name ?? ''}
          loading={responseModalLoading}
          error={responseModalError}
          form={responseModalForm}
          previousCorrectionRejectedFields={responseModalPreviousRejectedFields}
          onDecision={handleResponseDecision}
          deciding={responseDecisionLoading}
        />
          </div>
        </div>
    </main>
  );
}
