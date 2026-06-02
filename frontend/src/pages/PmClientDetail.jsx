import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { PM_TAB_SEGMENT_TO_KEY, pmClientTabUrl } from '../lib/pmClientRoutes';
import EmployeeTable from '../components/EmployeeTable';
import EmployeeFormResponseModal from '../components/EmployeeFormResponseModal';
import AddEmployeeModal from '../components/AddEmployeeModal';
import BulkUploadModal from '../components/BulkUploadModal';
import RoleDetailsModal from '../components/RoleDetailsModal';
import { api } from '../lib/api';
import { employeeOnboardingFormPath } from '../lib/onboardingFormLink';

const PAGE_SIZE = 50;
const DIRECTORY_STATUS_OPTIONS = [
  'AVAILABLE',
  'PENDING',
  'ROLE_ASSIGNED',
  'FORM_SENT',
  'Form Submitted',
  'Submitted',
  'SUBMITTED',
  'CORRECTION_REQUESTED',
  'Correction Requested',
  'APPROVED',
  'REJECTED',
  'PM Approved',
  'PM Rejected',
  'PENDING_PAYROLL_LEAD',
  'Pending Payroll Review',
  'PAYROLL_APPROVED',
  'PAYROLL_REJECTED',
  'Payroll Approved',
  'Payroll Rejected',
  'JOINED',
  'Joined',
  'NOT_JOINED',
  'Not Joined',
  'JOINED_OTHER_DATE',
  'Joined on other date',
  'JOINED_ABSCONDED',
  'Joined and absconded'
];

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

export default function PmClientDetail() {
  const { id, tab: tabSegment } = useParams();
  const navigate = useNavigate();
  const { setClientSidebarMeta } = useOutletContext() ?? {};
  const [client, setClient] = useState(null);
  const [pmClients, setPmClients] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const activeTab = PM_TAB_SEGMENT_TO_KEY[tabSegment] ?? 'pending';
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
    ctc_type: ''
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
  const [joiningInlineEmployeeId, setJoiningInlineEmployeeId] = useState(null);
  const [joiningInlineStatus, setJoiningInlineStatus] = useState('');
  const [joiningInlineDate, setJoiningInlineDate] = useState('');
  const [joiningInlineLoading, setJoiningInlineLoading] = useState(false);
  const [transferModalEmployee, setTransferModalEmployee] = useState(null);
  const [transferTargetClientId, setTransferTargetClientId] = useState('');
  const [transferReason, setTransferReason] = useState('');
  const [transferLoading, setTransferLoading] = useState(false);
  const [directoryStatusFilter, setDirectoryStatusFilter] = useState('');

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

  useEffect(() => { loadAll(); }, [id]);

  useEffect(() => {
    if (tabSegment && !PM_TAB_SEGMENT_TO_KEY[tabSegment]) {
      navigate(pmClientTabUrl(id, 'pending'), { replace: true });
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
        else if (formReviewStatus === 'APPROVED') latestStatus = 'PM Approved';
        else if (formReviewStatus === 'REJECTED') latestStatus = 'PM Rejected';
        else if (formReviewStatus === 'CORRECTION_REQUESTED') latestStatus = 'Correction Requested';
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
            testing_rejected_at: plRejected ? row.form_payroll_reviewed_at : row.form_reviewed_at,
            testing_rejected_remarks: plRejected ? row.form_payroll_review_reason : row.form_review_reason,
          };
        }),
    [employees]
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
    const ctcTypeQ = roleFilters.ctc_type.trim().toUpperCase();
    return roleAssigned.filter((row) => {
      const name = String(row.name ?? '').toLowerCase();
      const mobile = String(row.mobile ?? '').toLowerCase();
      const email = String(row.email ?? '').toLowerCase();
      const designation = String(row.designation ?? '').toLowerCase();
      const ctcType = String(row.ctc_type ?? '').toUpperCase();
      if (nameQ && !name.includes(nameQ)) return false;
      if (mobileQ && !mobile.includes(mobileQ)) return false;
      if (emailQ && !email.includes(emailQ)) return false;
      if (designationQ && designation !== designationQ) return false;
      if (ctcTypeQ && ctcType !== ctcTypeQ) return false;
      return true;
    });
  }, [roleAssigned, roleFilters.name, roleFilters.mobile, roleFilters.email, roleFilters.designation, roleFilters.ctc_type]);
  const hasActiveAvailableFilters = Boolean(availableFilters.name || availableFilters.mobile || availableFilters.email);
  const hasActiveRoleFilters = Boolean(
    roleFilters.name ||
    roleFilters.mobile ||
    roleFilters.email ||
    roleFilters.designation ||
    roleFilters.ctc_type
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
  const visibleRows =
    activeTab === 'pending'
      ? filteredPending
      : activeTab === 'role_assigned'
        ? filteredRoleAssigned
        : activeTab === 'testing'
          ? testingSubtab === 'add_employee'
            ? []
            : testingSubtab === 'employees'
            ? employees
            : testingRejectedRows
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
    setBulkRoleForceSendOnboarding(false);
  }, [activeTab, tabSegment, inProgressSubtab, plReviewedSubtab, testingSubtab]);

  useEffect(() => {
    if (activeTab !== 'testing') return;
    setTestingSubtab('employees');
  }, [activeTab]);

  useEffect(() => {
    if (!setClientSidebarMeta) return;
    setClientSidebarMeta({
      counts: {
        pending: pending.length,
        role_assigned: roleAssigned.length,
        in_progress: inProgressTotal,
        pl_reviewed: plReviewedTotal,
        employee_directory: employees.length,
        testing: employees.length
      }
    });
  }, [
    setClientSidebarMeta,
    pending.length,
    roleAssigned.length,
    inProgressTotal,
    plReviewedTotal,
    employees.length
  ]);
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
      navigate(pmClientTabUrl(id, 'in_progress'));
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
      navigate(pmClientTabUrl(id, 'in_progress'));
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
    setTransferTargetClientId('');
    setTransferReason('');
  };

  const handleTransferEmployee = async () => {
    if (!transferModalEmployee || !transferTargetClientId) return;
    setTransferLoading(true);
    setError(null);
    try {
      const res = await api.transferEmployeeProject({
        clientId: id,
        employeeId: transferModalEmployee.id,
        targetClientId: transferTargetClientId,
        reason: transferReason,
      });
      const targetClientName =
        pmClients.find((c) => c.id === transferTargetClientId)?.client_name || 'target project';
      setToast(`${res?.employee?.name ?? transferModalEmployee.name} transferred to ${targetClientName}.`);
      closeTransferModal();
      await loadAll();
      navigate(pmClientTabUrl(id, 'employee_directory'));
      setTimeout(() => setToast(null), 3500);
    } catch (err) {
      setError(err.message || 'Could not transfer employee.');
    } finally {
      setTransferLoading(false);
    }
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
        navigate(pmClientTabUrl(id, 'in_progress'));
      } else {
        setToast(`Role details set for ${res.updated} employee${res.updated === 1 ? '' : 's'}`);
        navigate(pmClientTabUrl(id, 'role_assigned'));
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

  const closeResponseModal = () => {
    if (responseDecisionLoading) return;
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
      closeResponseModal();
    } catch (err) {
      setResponseModalError(err.message || 'Could not submit review decision.');
    } finally {
      setResponseDecisionLoading(false);
    }
  };

  const handleExportResponsesCsv = async () => {
    if (selectedIds.size === 0) return;
    setResponsesExportLoading(true);
    setError(null);
    try {
      const blob = await api.exportJobAppFormsCsv({
        clientId: id,
        employeeIds: Array.from(selectedIds)
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
      setToast(`Downloaded CSV for ${selectedIds.size} response${selectedIds.size === 1 ? '' : 's'}.`);
      setTimeout(() => setToast(null), 3500);
    } catch (err) {
      setError(err.message || 'Could not export responses.');
    } finally {
      setResponsesExportLoading(false);
    }
  };

  const handleBulkJoiningStatus = async () => {
    if (selectedIds.size === 0 || !joiningBulkStatus) return;
    if (joiningBulkStatus === 'JOINED_OTHER_DATE' && !joiningBulkDate) {
      setError('Please select a date for "Joined on other date".');
      return;
    }
    setJoiningBulkLoading(true);
    setError(null);
    try {
      const res = await api.bulkSetJoiningStatus({
        clientId: id,
        employeeIds: Array.from(selectedIds),
        joiningStatus: joiningBulkStatus,
        joiningActualDate: joiningBulkStatus === 'JOINED_OTHER_DATE' ? joiningBulkDate : null
      });
      const failedCount = Array.isArray(res.failed) ? res.failed.length : 0;
      if (failedCount > 0) {
        setError(`Updated ${res.updated} employees; ${failedCount} could not be updated due to transition/rule checks.`);
      } else {
        setToast(`Joining status updated for ${res.updated} employee${res.updated === 1 ? '' : 's'}.`);
        setTimeout(() => setToast(null), 3500);
      }
      setSelectedIds(new Set());
      await loadAll();
    } catch (err) {
      setError(err.message || 'Could not update joining status.');
    } finally {
      setJoiningBulkLoading(false);
    }
  };

  const startInlineJoiningEdit = (row) => {
    setJoiningInlineEmployeeId(row.id);
    setJoiningInlineStatus(String(row.joining_status ?? '').trim().toUpperCase());
    setJoiningInlineDate(String(row.joining_actual_date ?? '').trim());
    setError(null);
  };

  const cancelInlineJoiningEdit = () => {
    if (joiningInlineLoading) return;
    setJoiningInlineEmployeeId(null);
    setJoiningInlineStatus('');
    setJoiningInlineDate('');
  };

  const saveInlineJoiningEdit = async (row) => {
    if (!joiningInlineStatus) return;
    if (joiningInlineStatus === 'JOINED_OTHER_DATE' && !joiningInlineDate) {
      setError('Please select a date for "Joined on other date".');
      return;
    }
    setJoiningInlineLoading(true);
    setError(null);
    try {
      const res = await api.setJoiningStatus({
        clientId: id,
        employeeId: row.id,
        joiningStatus: joiningInlineStatus,
        joiningActualDate: joiningInlineStatus === 'JOINED_OTHER_DATE' ? joiningInlineDate : null
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
    if (!value) return;
    if (value === currentStatus) return;
    if (value !== 'JOINED_OTHER_DATE') {
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
        setJoiningInlineEmployeeId(null);
        setJoiningInlineStatus('');
        setJoiningInlineDate('');
      } catch (err) {
        setError(err.message || 'Could not update joining status.');
      } finally {
        setJoiningInlineLoading(false);
      }
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
      navigate(pmClientTabUrl(id, 'role_assigned'));
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
    setRoleFilters({ name: '', mobile: '', email: '', designation: '', ctc_type: '' });
    setPageByTab((prev) => ({ ...prev, role_assigned: 1 }));
  };

  const transferTargetProjects = useMemo(
    () => pmClients.filter((pmClient) => pmClient.id !== id),
    [pmClients, id]
  );

  const designationLayoutClass =
    client && client.designations.length > 4
      ? 'grid grid-cols-2 gap-1.5 sm:grid-cols-4'
      : 'flex flex-col gap-1.5 sm:flex-row sm:flex-wrap';

  const renderJoiningStatusCell = (row, defaultLabel) => {
    const status = String(row.joining_status ?? '').trim().toUpperCase();
    const changeCount = Number(row.joining_status_change_count ?? 0);
    const canSecondStageAbscond = changeCount < 3 && status === 'JOINED_OTHER_DATE';
    const inTestingEmployees = activeTab === 'testing' && testingSubtab === 'employees';
    const isPayrollApprovedRow = String(row.form_payroll_review_status ?? '').trim().toUpperCase() === 'PAYROLL_APPROVED';
    const canInlineEdit =
      ((activeTab === 'pl_reviewed' && plReviewedSubtab === 'approved') || (inTestingEmployees && isPayrollApprovedRow)) &&
      (
        !status ||
        (changeCount < 2 && (status === 'JOINED' || status === 'JOINED_OTHER_DATE' || status === 'NOT_JOINED')) ||
        canSecondStageAbscond
      );
    if (!canInlineEdit) return defaultLabel(row);

    const currentValue = joiningInlineEmployeeId === row.id ? joiningInlineStatus : status;
    const currentDate = joiningInlineEmployeeId === row.id
      ? joiningInlineDate
      : String(row.joining_actual_date ?? '').trim();
    const persistedDate = String(row.joining_actual_date ?? '').trim();
    const shouldShowJoinedOtherDateSave =
      currentValue === 'JOINED_OTHER_DATE' &&
      Boolean(currentDate) &&
      (
        status !== 'JOINED_OTHER_DATE' ||
        currentDate !== persistedDate
      );
    const allowedOptions = [];
    if (!status) {
      allowedOptions.push('JOINED', 'NOT_JOINED', 'JOINED_OTHER_DATE', 'JOINED_ABSCONDED');
    } else {
      allowedOptions.push(status);
      if (status === 'NOT_JOINED' && changeCount < 2) allowedOptions.push('JOINED_OTHER_DATE');
      if ((status === 'JOINED' || status === 'JOINED_OTHER_DATE') && changeCount < 2) {
        allowedOptions.push('JOINED_ABSCONDED');
      }
      if (status === 'JOINED_OTHER_DATE' && changeCount >= 2 && changeCount < 3) {
        allowedOptions.push('JOINED_ABSCONDED');
      }
    }
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
          value={currentValue}
          onFocus={() => {
            setJoiningInlineEmployeeId(row.id);
            setJoiningInlineStatus(status);
            setJoiningInlineDate(String(row.joining_actual_date ?? '').trim());
          }}
          onChange={(e) => handleInlineStatusChange(row, e.target.value)}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
          disabled={joiningInlineLoading}
        >
          <option value="">Select status</option>
          {dedupedOptions.map((option) => (
            <option key={option} value={option}>
              {labelFor(option)}
            </option>
          ))}
        </select>
        {currentValue === 'JOINED_OTHER_DATE' && (
          <>
            <input
              type="date"
              value={currentDate}
              onChange={(e) => {
                setJoiningInlineEmployeeId(row.id);
                setJoiningInlineStatus('JOINED_OTHER_DATE');
                setJoiningInlineDate(e.target.value);
              }}
              className="w-full rounded border border-slate-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
            {shouldShowJoinedOtherDateSave && (
              <button
                type="button"
                onClick={() => saveInlineJoiningEdit(row)}
                disabled={joiningInlineLoading}
                className="self-start rounded bg-indigo-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {joiningInlineLoading ? 'Saving...' : 'Save'}
              </button>
            )}
          </>
        )}
      </div>
    );
  };

  if (loading && !client) {
    return (
      <main className="mx-auto w-[98%] px-6 py-8 text-slate-500">Loading...</main>
    );
  }

  return (
    <main className="flex min-h-full flex-col">
        {client && (
          <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur-sm">
            <div className="mx-auto w-[98%] px-6 pb-4 pt-5">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="min-w-0 text-2xl font-semibold tracking-tight text-slate-900">
                  {client.client_name}
                </h1>
                {client.insurance_applicable && (
                  <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800 ring-1 ring-emerald-600/15">
                    Insured
                  </span>
                )}
              </div>

              <div className="mt-5 grid gap-5 border-t border-slate-100 pt-5 sm:grid-cols-2 lg:grid-cols-12 lg:items-start lg:gap-x-8">
                <div className="lg:col-span-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Contract code</p>
                  <p className="mt-1 font-mono text-sm font-semibold text-slate-900">{client.contract_code}</p>
                </div>

                <div className="lg:col-span-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Contract period</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="min-w-0 rounded-md border border-slate-200/90 bg-slate-100 px-2.5 py-1 text-center text-xs font-medium tabular-nums text-emerald-700 break-words sm:text-left">
                      {client.contract_start_date}
                    </span>
                    <span className="text-slate-300" aria-hidden>
                      →
                    </span>
                    <span className="min-w-0 rounded-md border border-slate-200/90 bg-slate-100 px-2.5 py-1 text-center text-xs font-medium tabular-nums text-red-700 break-words sm:text-left">
                      {client.contract_end_date}
                    </span>
                  </div>
                </div>

                <div className="sm:col-span-2 lg:col-span-5">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Designations</p>
                  <div className={`mt-2 ${designationLayoutClass}`}>
                    {client.designations.map((d) => (
                      <span
                        key={d}
                        className="bg-slate-100 text-center text-xs font-medium text-slate-800 break-words rounded-md border border-slate-200/90 px-2.5 py-1 min-w-0 sm:text-left"
                      >
                        {d}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </header>
        )}

        <div className="flex w-full min-h-0 flex-1 flex-col bg-white">
          <div className="mx-auto w-[98%] flex-1 px-6 py-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded px-3 py-2 text-sm mb-4">
            {error}
          </div>
        )}

        {toast && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded px-3 py-2 text-sm mb-4">
            {toast}
          </div>
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
                        {status}
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
              {testingSubtab === 'employees' && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setTestingBulkMenuOpen((v) => !v)}
                    disabled={selectedIds.size === 0}
                    className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Bulk Action
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
                    </svg>
                  </button>
                  {testingBulkMenuOpen && (
                    <div className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
                      <button
                        type="button"
                        onClick={openBulkAssignRoleAndShareForm}
                        className="block w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"
                      >
                        Assign Role &amp; Share Form
                      </button>
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
                  : 'Showing employees rejected by either PM or Payroll Lead.'}
            </div>
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
                      setToast('Employees imported from file.');
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
                    onCreated={async () => {
                      await loadAll();
                      setToast('Employee added.');
                      navigate(pmClientTabUrl(id, 'pending'));
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
                  {(client?.designations ?? []).map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              <div className="min-w-[220px]">
                <label className="block text-xs font-medium text-slate-600 mb-1">CTC Type</label>
                <div className="flex border border-slate-300 rounded-md overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setRoleFilter('ctc_type', '')}
                    className={`px-3 py-2 text-sm border-r border-slate-300 ${roleFilters.ctc_type === '' ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-slate-50'}`}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={() => setRoleFilter('ctc_type', 'MONTHLY')}
                    className={`px-3 py-2 text-sm border-r border-slate-300 ${roleFilters.ctc_type === 'MONTHLY' ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-slate-50'}`}
                  >
                    Monthly
                  </button>
                  <button
                    type="button"
                    onClick={() => setRoleFilter('ctc_type', 'ANNUAL')}
                    className={`px-3 py-2 text-sm ${roleFilters.ctc_type === 'ANNUAL' ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-slate-50'}`}
                  >
                    Annual
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
                <option value="JOINED">Joined</option>
                <option value="NOT_JOINED">Not Joined</option>
                <option value="JOINED_OTHER_DATE">Joined on other date</option>
                <option value="JOINED_ABSCONDED">Joined and absconded</option>
              </select>
            </div>
            {joiningBulkStatus === 'JOINED_OTHER_DATE' && (
              <div className="min-w-[180px]">
                <label className="mb-1 block text-xs font-medium text-slate-600">Joined date</label>
                <input
                  type="date"
                  value={joiningBulkDate}
                  onChange={(e) => setJoiningBulkDate(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>
            )}
            <button
              type="button"
              onClick={handleBulkJoiningStatus}
              disabled={
                selectedIds.size === 0 ||
                !joiningBulkStatus ||
                joiningBulkLoading ||
                (joiningBulkStatus === 'JOINED_OTHER_DATE' && !joiningBulkDate)
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
                ? 'Preparing CSV...'
                : `Download CSV${selectedIds.size ? ` (${selectedIds.size})` : ''}`}
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

        {!showAddEmployeePanel && (
        <EmployeeTable
          rows={pagedRows}
          selectedIds={selectedIds}
          onToggle={toggle}
          onToggleAll={toggleAll}
          selectable={
            activeTab === 'pending' ||
            activeTab === 'role_assigned' ||
            (activeTab === 'testing' && testingSubtab === 'employees') ||
            (activeTab === 'in_progress' && inProgressSubtab === 'responses') ||
            (activeTab === 'pl_reviewed' && plReviewedSubtab === 'approved') ||
            (activeTab === 'in_progress' && inProgressSubtab === 'rejected') ||
            (activeTab === 'pl_reviewed' && plReviewedSubtab === 'rejected')
          }
          showJobColumns={activeTab !== 'pending'}
          showStatusColumn={activeTab !== 'pl_reviewed'}
          statusColumnLabel={activeTab === 'testing' ? 'Form Status' : 'Status'}
          showNotAssignedForMissingRoleDetails={activeTab === 'testing' && testingSubtab === 'employees'}
          forceNotSentStatusForMissingRoleDetails={activeTab === 'testing' && testingSubtab === 'employees'}
          showRespondedForSubmittedForms={activeTab === 'testing' && testingSubtab === 'employees'}
          showApprovedForPmApproved={activeTab === 'testing' && testingSubtab === 'employees'}
          showPlApprovedForPayrollApproved={activeTab === 'testing' && testingSubtab === 'employees'}
          showRequestCorrectionForReview={activeTab === 'testing' && testingSubtab === 'employees'}
          showJoiningStatus={activeTab === 'pl_reviewed' || (activeTab === 'testing' && testingSubtab === 'employees')}
          joiningStatusCellRenderer={renderJoiningStatusCell}
          showFormLink={activeTab === 'in_progress' && inProgressSubtab === 'form_sent'}
          formLinkForRow={
            activeTab === 'in_progress' && inProgressSubtab === 'form_sent' ? employeeOnboardingFormPath : null
          }
          showViewResponse={
            (activeTab === 'testing' && testingSubtab === 'employees') ||
            (activeTab === 'in_progress' && inProgressSubtab !== 'form_sent' && inProgressSubtab !== 'approved')
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

        {!showAddEmployeePanel && visibleRows.length > 0 && !paginationDisabled && (
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

        {bulkRoleModalOpen && (
          <RoleDetailsModal
            title={bulkRoleForceSendOnboarding ? 'Assign Role & Share Form' : 'Set Role Details (Bulk)'}
            description={
              bulkRoleForceSendOnboarding
                ? `Assign role details and share onboarding form for ${selectedIds.size} selected employee${selectedIds.size === 1 ? '' : 's'}.`
                : `Apply the same role details to ${selectedIds.size} selected available employee${selectedIds.size === 1 ? '' : 's'}.`
            }
            designations={client?.designations ?? []}
            submitting={roleDetailsLoading}
            showSendOnboardingOption={!bulkRoleForceSendOnboarding}
            onClose={handleBulkRoleModalClose}
            onSubmit={handleBulkRoleDetailsFromModal}
          />
        )}
        {rowRoleModalEmployee && (
          <RoleDetailsModal
            title={`Set Role Details - ${rowRoleModalEmployee.name}`}
            description="Set designation, DOJ, and CTC for this employee."
            designations={client?.designations ?? []}
            submitting={roleDetailsLoading}
            onClose={() => setRowRoleModalEmployee(null)}
            onSubmit={handleSingleRoleDetails}
          />
        )}
        {transferModalEmployee && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4">
            <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-2xl">
              <h3 className="text-lg font-semibold text-slate-900">Transfer Employee</h3>
              <p className="mt-1 text-sm text-slate-600">
                Transfer <span className="font-medium text-slate-800">{transferModalEmployee.name}</span> to another project.
                Current onboarding data will reset and status will move to Available.
              </p>
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
                    Reason (optional)
                  </label>
                  <input
                    type="text"
                    value={transferReason}
                    onChange={(e) => setTransferReason(e.target.value)}
                    placeholder="Transfer reason"
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
                  onClick={handleTransferEmployee}
                  disabled={!transferTargetClientId || transferLoading}
                  className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {transferLoading ? 'Transferring...' : 'Transfer'}
                </button>
              </div>
            </div>
          </div>
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
