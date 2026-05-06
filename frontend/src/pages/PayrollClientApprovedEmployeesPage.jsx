import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import EmployeeFormResponseModal from '../components/EmployeeFormResponseModal';

function IconEye({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function joiningStatusLabel(row) {
  const status = String(row?.joining_status ?? '').trim().toUpperCase();
  if (!status) return '-';
  if (status === 'JOINED') return 'Joined';
  if (status === 'NOT_JOINED') return 'Not Joined';
  if (status === 'JOINED_ABSCONDED') return 'Joined and absconded';
  if (status === 'JOINED_OTHER_DATE') {
    return row?.joining_actual_date
      ? `Joined on other date (${row.joining_actual_date})`
      : 'Joined on other date';
  }
  return status;
}

export default function PayrollClientApprovedEmployeesPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [employees, setEmployees] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [responseModalOpen, setResponseModalOpen] = useState(false);
  const [responseModalEmployee, setResponseModalEmployee] = useState(null);
  const [responseModalForm, setResponseModalForm] = useState(null);
  const [responseModalPreviousRejectedFields, setResponseModalPreviousRejectedFields] = useState([]);
  const [responseModalPmApproverName, setResponseModalPmApproverName] = useState(null);
  const [responseModalLoading, setResponseModalLoading] = useState(false);
  const [responseModalError, setResponseModalError] = useState('');
  const [responseDecisionLoading, setResponseDecisionLoading] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [employeeRows, clientRows] = await Promise.all([api.listEmployees(id), api.listClients()]);
        if (!active) return;
        setEmployees(employeeRows || []);
        setClients(clientRows || []);
      } catch (err) {
        if (!active) return;
        setError(err.message || 'Could not load approved employees.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [id]);

  const client = useMemo(() => clients.find((c) => c.id === id) || null, [clients, id]);
  const awaitingPlRows = useMemo(
    () =>
      employees.filter(
        (row) =>
          String(row.form_review_status || '').trim() === 'APPROVED' &&
          String(row.form_payroll_review_status || '').trim() === 'PENDING_PAYROLL_LEAD'
      ),
    [employees]
  );

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
    setResponseModalPmApproverName(null);
    setResponseModalError('');
    setResponseModalLoading(true);
    try {
      const data = await api.getEmployeeJobAppForm({
        clientId: id,
        employeeId: row.id,
        payrollReview: true
      });
      setResponseModalForm(data.form);
      setResponseModalPreviousRejectedFields(
        Array.isArray(data.previous_correction_rejected_fields) ? data.previous_correction_rejected_fields : []
      );
      const pmName = data.pm_approver?.name != null ? String(data.pm_approver.name).trim() : '';
      setResponseModalPmApproverName(pmName || null);
    } catch (err) {
      setResponseModalError(err.message || 'Could not load application.');
    } finally {
      setResponseModalLoading(false);
    }
  };

  const handlePayrollDecision = async (decisionPayload) => {
    if (!responseModalEmployee) return;
    setResponseModalError('');
    setResponseDecisionLoading(true);
    try {
      const data = await api.reviewEmployeePayrollJobAppForm({
        clientId: id,
        employeeId: responseModalEmployee.id,
        payload: decisionPayload
      });
      setResponseModalForm(data.form ?? null);
      const d = String(decisionPayload?.decision_status ?? '').toUpperCase();
      const msg =
        d === 'APPROVED'
          ? 'Application approved by Payroll Lead.'
          : 'Application rejected — returned to Program Manager.';
      setToast(msg);
      setTimeout(() => setToast(null), 3500);
      const [employeeRows, clientRows] = await Promise.all([api.listEmployees(id), api.listClients()]);
      setEmployees(employeeRows || []);
      setClients(clientRows || []);
      closeResponseModal();
    } catch (err) {
      setResponseModalError(err.message || 'Could not submit Payroll Lead decision.');
    } finally {
      setResponseDecisionLoading(false);
    }
  };

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[110] max-w-md -translate-x-1/2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 shadow-lg">
          {toast}
        </div>
      )}
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">PM Approved</h1>
          <p className="mt-1 text-sm text-slate-500">
            {client?.client_name || 'Client'}: Program Manager–approved applications awaiting Payroll Lead review.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/dashboard')}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
        >
          Back to Clients
        </button>
      </div>

      {loading && (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-500">
          Loading employees...
        </div>
      )}
      {error && !loading && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>
      )}

      {!loading && !error && awaitingPlRows.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          No employees awaiting Payroll Lead review for this client.
        </div>
      )}

      {!loading && !error && awaitingPlRows.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Employee</th>
                <th className="px-4 py-2 text-left font-medium">Mobile</th>
                <th className="px-4 py-2 text-left font-medium">Email</th>
                <th className="px-4 py-2 text-left font-medium">Designation</th>
                <th className="px-4 py-2 text-left font-medium">Onboarding Status</th>
                <th className="px-4 py-2 text-left font-medium">Joining Status</th>
                <th className="w-14 px-3 py-2 text-center font-medium">View</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {awaitingPlRows.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3 text-slate-900">{row.name}</td>
                  <td className="px-4 py-3 text-slate-700">{row.mobile}</td>
                  <td className="px-4 py-3 text-slate-700">{row.email || '-'}</td>
                  <td className="px-4 py-3 text-slate-700">{row.designation || '-'}</td>
                  <td className="px-4 py-3 text-slate-700">{row.onboarding_status || '-'}</td>
                  <td className="px-4 py-3 text-slate-700">{joiningStatusLabel(row)}</td>
                  <td className="px-2 py-3 text-center">
                    <button
                      type="button"
                      onClick={() => openResponseModal(row)}
                      className="inline-flex rounded-lg p-2 text-slate-600 hover:bg-indigo-50 hover:text-indigo-700"
                      title="Review application"
                      aria-label={`Review application for ${row.name}`}
                    >
                      <IconEye className="h-5 w-5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
        onDecision={handlePayrollDecision}
        deciding={responseDecisionLoading}
        reviewMode="payroll"
        pmApproverName={responseModalPmApproverName}
      />
    </main>
  );
}
