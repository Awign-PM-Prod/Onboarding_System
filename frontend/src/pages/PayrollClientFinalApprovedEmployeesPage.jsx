import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';

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

export default function PayrollClientFinalApprovedEmployeesPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [employees, setEmployees] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
  const approvedRows = useMemo(
    () =>
      employees.filter(
        (row) =>
          String(row.form_review_status || '').trim() === 'APPROVED' &&
          String(row.form_payroll_review_status || '').trim() === 'PAYROLL_APPROVED'
      ),
    [employees]
  );

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Approved Employees</h1>
          <p className="mt-1 text-sm text-slate-500">
            {client?.client_name || 'Client'}: employees finally approved by Payroll Lead.
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

      {!loading && !error && approvedRows.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          No finally approved employees for this client yet.
        </div>
      )}

      {!loading && !error && approvedRows.length > 0 && (
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
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {approvedRows.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3 text-slate-900">{row.name}</td>
                  <td className="px-4 py-3 text-slate-700">{row.mobile}</td>
                  <td className="px-4 py-3 text-slate-700">{row.email || '-'}</td>
                  <td className="px-4 py-3 text-slate-700">{row.designation || '-'}</td>
                  <td className="px-4 py-3 text-slate-700">{row.onboarding_status || '-'}</td>
                  <td className="px-4 py-3 text-slate-700">{joiningStatusLabel(row)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
