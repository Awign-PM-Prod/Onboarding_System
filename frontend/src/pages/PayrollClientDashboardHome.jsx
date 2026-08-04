import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import ClientProjectMetaHeader from '../components/ClientProjectMetaHeader';
import {
  resolveEmployeeStatusLabel,
  employeeStatusBadgeClass,
  isPlApprovedReview,
  isPlRejectedReview
} from '../lib/employeeStatusBadge';

const LEAVE_CODES = ['EL', 'SL', 'CL', 'PL', 'ML', 'RH', 'CO'];
const RECORDS_PREVIEW_COUNT = 5;
const PIPELINE_PREVIEW_COUNT = 6;

function currentMonthYm() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(ym) {
  const [y, m] = String(ym ?? '').split('-').map(Number);
  if (!y || !m) return ym || '-';
  return new Date(y, m - 1, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' });
}

function relativeTime(iso) {
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return '';
  const diffMs = Date.now() - ts;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatNumber(value) {
  const n = Number(value) || 0;
  const rounded = Math.round(n * 100) / 100;
  return rounded.toLocaleString('en-IN');
}

const STAT_ICONS = {
  employees: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-1a4 4 0 0 0-3-3.87M9 20H4v-1a4 4 0 0 1 3-3.87m8-4.13a4 4 0 1 0-6 0m9 9v-1a6 6 0 0 0-12 0v1" />
    </svg>
  ),
  leaves: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3M4 11h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" />
    </svg>
  ),
  paidDays: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  ),
  rejected: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3h.008v.008H12v-.008ZM21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  ),
  identity: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 3h4M7 3h10a2 2 0 0 1 2 2v16l-3-2-2 2-2-2-2 2-2-2-3 2V5a2 2 0 0 1 2-2Z" />
    </svg>
  )
};

function StatCard({ title, value, tone, icon }) {
  const tones = {
    indigo: { icon: 'bg-indigo-50 text-indigo-600', value: 'text-slate-900' },
    amber: { icon: 'bg-amber-50 text-amber-600', value: 'text-slate-900' },
    emerald: { icon: 'bg-emerald-50 text-emerald-600', value: 'text-slate-900' },
    rose: { icon: 'bg-rose-50 text-rose-600', value: 'text-rose-700' }
  };
  const t = tones[tone] || tones.indigo;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${t.icon}`}>{icon}</span>
      </div>
      <p className={`mt-1 text-2xl font-bold ${t.value}`}>{value}</p>
    </div>
  );
}

const PIPELINE_BADGES = {
  emerald: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-700',
  rose: 'bg-rose-50 text-rose-700',
  indigo: 'bg-indigo-50 text-indigo-700'
};

export default function PayrollClientDashboardHome() {
  const { id } = useParams();
  const [clients, setClients] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [attendance, setAttendance] = useState({ sheet: null, rows: [] });
  const [month, setMonth] = useState(currentMonthYm);
  const [loading, setLoading] = useState(true);
  const [attendanceLoading, setAttendanceLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    Promise.all([api.listClients(), api.listEmployees(id)])
      .then(([clientRows, employeeRows]) => {
        if (!active) return;
        setClients(clientRows || []);
        setEmployees(employeeRows || []);
      })
      .catch((err) => {
        if (active) setError(err.message || 'Could not load client dashboard.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  useEffect(() => {
    let active = true;
    setAttendanceLoading(true);
    api
      .getAttendance({ clientId: id, month })
      .then((data) => {
        if (!active) return;
        setAttendance({ sheet: data?.sheet || null, rows: Array.isArray(data?.rows) ? data.rows : [] });
      })
      .catch(() => {
        if (active) setAttendance({ sheet: null, rows: [] });
      })
      .finally(() => {
        if (active) setAttendanceLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, month]);

  const client = useMemo(() => clients.find((c) => c.id === id) || null, [clients, id]);

  const employeesById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const employeesByEmpCode = useMemo(() => {
    const map = new Map();
    for (const e of employees) {
      const code = String(e.emp_code ?? '').trim();
      if (code) map.set(code, e);
    }
    return map;
  }, [employees]);

  const plApprovedCount = useMemo(
    () => employees.filter((e) => isPlApprovedReview(e)).length,
    [employees]
  );
  const plRejectedCount = useMemo(
    () => employees.filter((e) => isPlRejectedReview(e)).length,
    [employees]
  );

  const stats = useMemo(() => {
    const rejected = employees.filter(
      (e) =>
        isPlRejectedReview(e) || String(e.form_review_status ?? '').trim().toUpperCase() === 'REJECTED'
    ).length;

    const pendingIdentity = employees.filter((e) => {
      if (!isPlApprovedReview(e)) return false;
      const joiningStatus = String(e.joining_status ?? '').trim();
      if (joiningStatus !== 'JOINED' && joiningStatus !== 'JOINED_OTHER_DATE') return false;
      const formUan = String(e.form_bp_pf_uan_number ?? '').trim();
      const formEsic = String(e.form_bp_esic_number ?? '').trim();
      const assignedUan = String(e.payroll_pf_uan_number ?? '').trim();
      const assignedEsic = String(e.payroll_esic_number ?? '').trim();
      return (!formUan && !assignedUan) || (!formEsic && !assignedEsic);
    }).length;

    let totalPaidDays = 0;
    let totalLeaves = 0;
    for (const row of attendance.rows) {
      totalPaidDays += Number(row.paid_days) || 0;
      const lt = row.legend_totals || {};
      for (const code of LEAVE_CODES) totalLeaves += Number(lt[code]) || 0;
    }

    return {
      totalEmployees: employees.length,
      rejected,
      pendingIdentity,
      totalPaidDays,
      totalLeaves
    };
  }, [employees, attendance.rows]);

  const payrollRecords = useMemo(() => {
    const sheetPm = String(attendance.sheet?.project_manager_name ?? '').trim();
    const clientPm = String(client?.program_manager_name ?? '').trim();

    if (attendance.rows.length > 0) {
      return attendance.rows.map((row) => {
        const emp =
          (row.employee_id && employeesById.get(row.employee_id)) ||
          employeesByEmpCode.get(String(row.emp_code ?? '').trim()) ||
          null;
        return {
          key: row.id,
          empCode: row.emp_code || emp?.emp_code || '-',
          name: row.employee_name_snapshot || emp?.name || '-',
          paidDays: row.paid_days === null || row.paid_days === undefined ? null : Number(row.paid_days),
          statusLabel: emp ? resolveEmployeeStatusLabel(emp) : row.status_label || '-',
          pm: emp?.form_pm_approver_name || sheetPm || clientPm || '-'
        };
      });
    }

    // No attendance sheet yet for this month: fall back to PL-approved employees.
    return employees
      .filter((e) => isPlApprovedReview(e))
      .map((e) => ({
        key: e.id,
        empCode: e.emp_code || '-',
        name: e.name || '-',
        paidDays: null,
        statusLabel: resolveEmployeeStatusLabel(e),
        pm: e.form_pm_approver_name || clientPm || '-'
      }));
  }, [attendance, employees, employeesById, employeesByEmpCode, client]);

  const pipeline = useMemo(() => {
    const events = [];

    for (const e of employees) {
      const plStatus = String(e.form_payroll_review_status ?? '').trim().toUpperCase();
      if (e.form_payroll_reviewed_at && (plStatus === 'PAYROLL_APPROVED' || plStatus === 'PAYROLL_REJECTED')) {
        const approved = plStatus === 'PAYROLL_APPROVED';
        events.push({
          key: `pl-${e.id}`,
          at: e.form_payroll_reviewed_at,
          title: e.name || 'Employee',
          detail: approved
            ? 'Payroll Lead approved the onboarding form.'
            : `Rejected by Payroll Lead${e.form_payroll_review_reason ? `: ${e.form_payroll_review_reason}` : '.'}`,
          badge: approved ? 'PL Approved' : 'Rejected',
          tone: approved ? 'emerald' : 'rose'
        });
      }

      const pmStatus = String(e.form_review_status ?? '').trim().toUpperCase();
      if (e.form_reviewed_at && pmStatus) {
        if (pmStatus === 'APPROVED') {
          events.push({
            key: `pm-${e.id}`,
            at: e.form_reviewed_at,
            title: e.name || 'Employee',
            detail: `PM approval submitted${e.form_pm_approver_name ? ` by ${e.form_pm_approver_name}` : ''}.`,
            badge: plStatus === 'PENDING_PAYROLL_LEAD' ? 'PL Pending' : 'PM Approved',
            tone: plStatus === 'PENDING_PAYROLL_LEAD' ? 'amber' : 'emerald'
          });
        } else if (pmStatus === 'REJECTED') {
          events.push({
            key: `pm-${e.id}`,
            at: e.form_reviewed_at,
            title: e.name || 'Employee',
            detail: 'Rejected by PM during form review.',
            badge: 'Rejected',
            tone: 'rose'
          });
        } else if (pmStatus === 'CORRECTION_REQUESTED') {
          events.push({
            key: `pm-${e.id}`,
            at: e.form_reviewed_at,
            title: e.name || 'Employee',
            detail: 'PM requested corrections on the form.',
            badge: 'PM Pending',
            tone: 'amber'
          });
        }
      }
    }

    const sheet = attendance.sheet;
    if (sheet?.submitted_at) {
      events.push({
        key: `sheet-submit-${sheet.id}`,
        at: sheet.submitted_at,
        title: `${monthLabel(month)} Attendance`,
        detail: `Attendance sheet submitted${sheet.project_manager_name ? ` by ${sheet.project_manager_name}` : ''}.`,
        badge: 'Submitted',
        tone: 'indigo'
      });
    } else if (sheet?.uploaded_at) {
      events.push({
        key: `sheet-upload-${sheet.id}`,
        at: sheet.uploaded_at,
        title: `${monthLabel(month)} Attendance`,
        detail: 'Attendance sheet uploaded, submission pending.',
        badge: 'PM Pending',
        tone: 'amber'
      });
    }

    return events
      .filter((ev) => ev.at)
      .sort((a, b) => new Date(b.at) - new Date(a.at))
      .slice(0, PIPELINE_PREVIEW_COUNT);
  }, [employees, attendance.sheet, month]);

  const visibleRecords = payrollRecords.slice(0, RECORDS_PREVIEW_COUNT);

  return (
    <main className="mx-auto max-w-7xl px-4 pb-8 pt-4 sm:px-6">
      <ClientProjectMetaHeader
        className="mb-6"
        title={client?.client_name || 'Client Dashboard'}
        contractCode={client?.contract_code}
        contractStartDate={client?.contract_start_date}
        contractEndDate={client?.contract_end_date}
        openEndedContract={Boolean(client?.open_ended_contract)}
        entity={client?.entity}
        state={client?.state}
        designations={client?.designations}
        plApprovedCount={plApprovedCount}
        plRejectedCount={plRejectedCount}
        insuranceApplicable={Boolean(client?.insurance_applicable)}
        month={month}
        onMonthChange={setMonth}
      />

      {loading && (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-500">Loading dashboard...</div>
      )}
      {error && !loading && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>
      )}

      {!loading && !error && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <StatCard title="Total Employees" value={formatNumber(stats.totalEmployees)} tone="indigo" icon={STAT_ICONS.employees} />
            <StatCard
              title="Total Leaves"
              value={attendanceLoading ? '...' : formatNumber(stats.totalLeaves)}
              tone="amber"
              icon={STAT_ICONS.leaves}
            />
            <StatCard
              title="Total Paid Days"
              value={attendanceLoading ? '...' : formatNumber(stats.totalPaidDays)}
              tone="emerald"
              icon={STAT_ICONS.paidDays}
            />
            <StatCard title="Rejected" value={formatNumber(stats.rejected)} tone="rose" icon={STAT_ICONS.rejected} />
            <StatCard
              title="Pending UAN & ESIC"
              value={formatNumber(stats.pendingIdentity)}
              tone="amber"
              icon={STAT_ICONS.identity}
            />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm xl:col-span-2">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                <h2 className="text-sm font-semibold text-slate-900">Active Payroll Records</h2>
                <p className="text-xs text-slate-500">Sort by: Recent</p>
              </div>

              {attendanceLoading ? (
                <div className="p-10 text-center text-sm text-slate-500">Loading records...</div>
              ) : payrollRecords.length === 0 ? (
                <div className="p-10 text-center text-sm text-slate-500">
                  No payroll records yet for this client.{' '}
                  <Link to={`/dashboard/client/${id}/attendance`} className="font-medium text-indigo-700 hover:underline">
                    Go to Attendance
                  </Link>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="bg-slate-50 text-slate-600">
                        <tr>
                          <th className="px-4 py-2 text-left font-medium">S.No</th>
                          <th className="px-4 py-2 text-left font-medium">Emp Code</th>
                          <th className="px-4 py-2 text-left font-medium">Employee</th>
                          <th className="px-4 py-2 text-left font-medium">Paid Days</th>
                          <th className="px-4 py-2 text-left font-medium">Status</th>
                          <th className="px-4 py-2 text-left font-medium">PM</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {visibleRecords.map((row, idx) => (
                          <tr key={row.key}>
                            <td className="px-4 py-3 text-slate-500">{idx + 1}</td>
                            <td className="px-4 py-3 text-slate-700">{row.empCode}</td>
                            <td className="px-4 py-3 font-medium text-slate-900">{row.name}</td>
                            <td className="px-4 py-3 text-slate-700">
                              {row.paidDays === null || Number.isNaN(row.paidDays)
                                ? '-'
                                : `${formatNumber(row.paidDays)} days`}
                            </td>
                            <td className="px-4 py-3">
                              <span className={employeeStatusBadgeClass(row.statusLabel)}>{row.statusLabel}</span>
                            </td>
                            <td className="px-4 py-3 text-slate-700">{row.pm}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
                    <p className="text-xs text-slate-500">
                      Showing {visibleRecords.length} of {payrollRecords.length} record
                      {payrollRecords.length === 1 ? '' : 's'}
                    </p>
                    <Link
                      to={`/dashboard/client/${id}/attendance`}
                      className="text-sm font-medium text-indigo-700 hover:underline"
                    >
                      View All Records &rarr;
                    </Link>
                  </div>
                </>
              )}
            </section>

            <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-4 py-3">
                <h2 className="text-sm font-semibold text-slate-900">Approval Pipeline</h2>
                <p className="mt-0.5 text-xs text-slate-500">Realtime validation of payroll cycles</p>
              </div>
              {pipeline.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">No approval activity yet.</div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {pipeline.map((ev) => (
                    <li key={ev.key} className="px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-semibold text-slate-900">{ev.title}</p>
                        <span className="shrink-0 text-xs text-slate-400">{relativeTime(ev.at)}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">{ev.detail}</p>
                      <span
                        className={`mt-2 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          PIPELINE_BADGES[ev.tone] || PIPELINE_BADGES.indigo
                        }`}
                      >
                        {ev.badge}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </main>
  );
}
