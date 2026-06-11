function StatCard({ title, value, tone = 'slate' }) {
  const valueClass =
    tone === 'emerald'
      ? 'text-emerald-700'
      : tone === 'rose'
        ? 'text-rose-700'
        : tone === 'indigo'
          ? 'text-indigo-700'
          : tone === 'amber'
            ? 'text-amber-700'
            : 'text-slate-900';
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{title}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${valueClass}`}>{value}</p>
    </div>
  );
}

function computeStats(employees) {
  const stats = {
    total_employees: employees.length,
    available: 0,
    role_assigned: 0,
    onboarding_activations: 0,
    employees_submitted: 0,
    submission_pending: 0,
    pm_approved: 0,
    pm_rejected: 0,
    pm_correction_requested: 0,
    payroll_approved: 0,
    payroll_rejected: 0,
    joined: 0,
    joining_pending: 0,
  };

  for (const row of employees) {
    const onboardingStatus = String(row.onboarding_status ?? '').trim().toUpperCase();
    if (onboardingStatus === 'AVAILABLE' || onboardingStatus === 'PENDING') stats.available += 1;
    if (onboardingStatus === 'ROLE_ASSIGNED') stats.role_assigned += 1;

    if (row.onboarding_initiated) stats.onboarding_activations += 1;

    const submissionStatus = String(row.form_submission_status ?? '').trim();
    const reviewStatus = String(row.form_review_status ?? '').trim();
    const payrollReviewStatus = String(row.form_payroll_review_status ?? '').trim();
    const joiningStatus = String(row.joining_status ?? '').trim().toUpperCase();

    if (submissionStatus === 'Submitted') stats.employees_submitted += 1;
    else if (row.onboarding_initiated) stats.submission_pending += 1;

    if (reviewStatus === 'APPROVED') stats.pm_approved += 1;
    if (reviewStatus === 'REJECTED') stats.pm_rejected += 1;
    if (reviewStatus === 'CORRECTION_REQUESTED') stats.pm_correction_requested += 1;

    if (payrollReviewStatus === 'PAYROLL_APPROVED') {
      stats.payroll_approved += 1;
      if (joiningStatus) stats.joined += 1;
      else stats.joining_pending += 1;
    }
    if (payrollReviewStatus === 'PAYROLL_REJECTED') stats.payroll_rejected += 1;
  }

  return stats;
}

export default function PmClientDashboard({ employees = [] }) {
  const stats = computeStats(employees);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Client dashboard</h2>
        <p className="mt-1 text-sm text-slate-500">
          Onboarding snapshot for this project. Use Onboarding in Progress to manage employees.
        </p>
      </div>

      <div>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Pipeline</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard title="Total Employees" value={stats.total_employees} />
          <StatCard title="Available" value={stats.available} tone="amber" />
          <StatCard title="Role Assigned" value={stats.role_assigned} tone="indigo" />
          <StatCard title="Onboarding Activations" value={stats.onboarding_activations} tone="indigo" />
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Forms &amp; review</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard title="Employees Submitted" value={stats.employees_submitted} />
          <StatCard title="Submission Pending" value={stats.submission_pending} tone="amber" />
          <StatCard title="PM Approved" value={stats.pm_approved} tone="emerald" />
          <StatCard title="PM Rejected" value={stats.pm_rejected} tone="rose" />
          <StatCard title="Correction Requested" value={stats.pm_correction_requested} tone="amber" />
          <StatCard title="Payroll Approved" value={stats.payroll_approved} tone="emerald" />
          <StatCard title="Payroll Rejected" value={stats.payroll_rejected} tone="rose" />
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Joining</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard title="Joining Status Set" value={stats.joined} tone="emerald" />
          <StatCard title="Joining Status Pending" value={stats.joining_pending} tone="amber" />
        </div>
      </div>
    </div>
  );
}
