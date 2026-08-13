import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';

const FUNNEL_COLORS = ['#4f46e5', '#6366f1', '#059669', '#047857'];
// Match previous Super Admin client-wise palette (indigo → violet → amber → emerald).
const STATUS_COLORS = {
  pending: '#4f46e5',
  awaiting_pm: '#6366f1',
  correction: '#d97706',
  pm_rejected: '#f43f5e',
  awaiting_pl: '#059669',
  pl_approved: '#047857',
  pl_rejected: '#be123c'
};

/** Mutually exclusive pipeline buckets so stacked height matches real headcount. */
function exclusiveClientStatus(c, { includeCorrection = false } = {}) {
  const pending = Number(c.submission_pending) || 0;
  const submitted = Number(c.employees_submitted) || 0;
  const pmApproved = Number(c.pm_approved) || 0;
  const pmRejected = Number(c.pm_rejected) || 0;
  const correction = Number(c.pm_correction_requested) || 0;
  const plApproved = Number(c.payroll_approved) || 0;
  const plRejected = Number(c.payroll_rejected) || 0;

  const reviewed = pmApproved + pmRejected + (includeCorrection ? correction : 0);
  const awaitingPm = Math.max(0, submitted - reviewed);
  const awaitingPl = Math.max(0, pmApproved - plApproved - plRejected);

  return {
    pending,
    awaiting_pm: awaitingPm,
    correction: includeCorrection ? correction : 0,
    pm_rejected: pmRejected,
    awaiting_pl: awaitingPl,
    pl_approved: plApproved,
    pl_rejected: plRejected,
    total:
      pending +
      awaitingPm +
      (includeCorrection ? correction : 0) +
      pmRejected +
      awaitingPl +
      plApproved +
      plRejected
  };
}

function shortName(raw) {
  const text = String(raw || 'Client');
  return text.length > 16 ? `${text.slice(0, 14)}…` : text;
}

function ChartCard({ title, children, className = '', hint = '' }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {hint ? <p className="mt-0.5 text-xs text-slate-500">{hint}</p> : null}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

export default function SuperAdminDashboardCharts({ totals, clients }) {
  const funnelData = [
    { name: 'Activations', value: totals.onboarding_activations || 0 },
    { name: 'Submitted', value: totals.employees_submitted || 0 },
    { name: 'PM Approved', value: totals.pm_approved || 0 },
    { name: 'PL Approved', value: totals.payroll_approved || 0 }
  ];

  // Active + Dropout partition onboarded (Active = Onboarded − Dropout).
  const onboarded = totals.total_onboarded || 0;
  const activeCount = totals.active_employees || 0;
  const dropoutCount = totals.total_dropout || 0;
  const outcomeData = [
    { name: 'Active', value: activeCount, fill: '#059669' },
    { name: 'Dropout', value: dropoutCount, fill: '#e11d48' }
  ].filter((d) => d.value > 0);

  const clientChartData = (clients || [])
    .slice()
    .sort((a, b) => (b.employee_count || 0) - (a.employee_count || 0))
    .slice(0, 12)
    .map((c) => ({
      name: shortName(c.client_name || c.contract_code),
      ...exclusiveClientStatus(c, { includeCorrection: true })
    }));

  const hasFunnel = funnelData.some((d) => d.value > 0);
  const hasOutcome = outcomeData.length > 0;
  const hasClients = clientChartData.some((d) => d.total > 0);

  if (!hasFunnel && !hasOutcome && !hasClients) {
    return null;
  }

  return (
    <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
      <ChartCard title="Pipeline funnel" hint="Each bar is a live headcount at that stage (not cumulative stack).">
        {hasFunnel ? (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={funnelData} layout="vertical" margin={{ left: 8, right: 28, top: 8, bottom: 28 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis
                  type="number"
                  allowDecimals={false}
                  tick={{ fontSize: 12, fill: '#64748b' }}
                  label={{
                    value: 'Total Headcount',
                    position: 'insideBottom',
                    offset: -18,
                    style: { fill: '#64748b', fontSize: 12 }
                  }}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={96}
                  tick={{ fontSize: 12, fill: '#475569' }}
                />
                <Tooltip
                  contentStyle={{ borderRadius: 8, borderColor: '#e2e8f0', fontSize: 12 }}
                />
                <Bar dataKey="value" name="Employees" radius={[0, 6, 6, 0]} barSize={22}>
                  {funnelData.map((entry, index) => (
                    <Cell key={entry.name} fill={FUNNEL_COLORS[index % FUNNEL_COLORS.length]} />
                  ))}
                  <LabelList
                    dataKey="value"
                    position="right"
                    fill="#334155"
                    fontSize={12}
                    fontWeight={600}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="py-10 text-center text-sm text-slate-500">No pipeline data yet.</p>
        )}
      </ChartCard>

      <ChartCard title="Active vs dropout" hint="Onboarded = Active + Dropout (PL-approved).">
        {hasOutcome || onboarded > 0 ? (
          <div className="flex h-64 flex-col">
            <div className="min-h-0 flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={
                      outcomeData.length > 0
                        ? outcomeData
                        : [{ name: 'Onboarded', value: onboarded || 1, fill: '#059669' }]
                    }
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={88}
                    paddingAngle={outcomeData.length > 1 ? 3 : 0}
                    stroke="#fff"
                    strokeWidth={3}
                  >
                    {(outcomeData.length > 0
                      ? outcomeData
                      : [{ name: 'Onboarded', fill: '#059669' }]
                    ).map((entry) => (
                      <Cell key={entry.name} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value, name) => [value, name]}
                    contentStyle={{ borderRadius: 8, borderColor: '#e2e8f0', fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-1 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-sm bg-[#4f46e5]" aria-hidden />
                <span className="text-xs text-slate-600">Onboarded</span>
                <span className="text-xs font-semibold text-slate-900">{onboarded}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-sm bg-[#059669]" aria-hidden />
                <span className="text-xs text-slate-600">Active</span>
                <span className="text-xs font-semibold text-slate-900">{activeCount}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-sm bg-[#e11d48]" aria-hidden />
                <span className="text-xs text-slate-600">Dropout</span>
                <span className="text-xs font-semibold text-slate-900">{dropoutCount}</span>
              </div>
            </div>
          </div>
        ) : (
          <p className="py-10 text-center text-sm text-slate-500">No onboarding outcomes yet.</p>
        )}
      </ChartCard>

      <ChartCard
        title="Client-wise onboarding status"
        className="lg:col-span-2"
        hint="Stacked segments are exclusive statuses (no double-counting)."
      >
        {hasClients ? (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={clientChartData} margin={{ left: 0, right: 8, top: 8, bottom: 48 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis
                  dataKey="name"
                  interval={0}
                  angle={-28}
                  textAnchor="end"
                  height={60}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <Tooltip
                  contentStyle={{ borderRadius: 8, borderColor: '#e2e8f0', fontSize: 12 }}
                />
                <Legend
                  wrapperStyle={{ fontSize: 12 }}
                  formatter={(value) => <span className="text-xs text-slate-600">{value}</span>}
                />
                <Bar dataKey="pending" name="Pending" stackId="a" fill={STATUS_COLORS.pending} />
                <Bar dataKey="awaiting_pm" name="Awaiting PM" stackId="a" fill={STATUS_COLORS.awaiting_pm} />
                <Bar dataKey="correction" name="Correction" stackId="a" fill={STATUS_COLORS.correction} />
                <Bar dataKey="pm_rejected" name="PM Rejected" stackId="a" fill={STATUS_COLORS.pm_rejected} />
                <Bar dataKey="awaiting_pl" name="Awaiting PL" stackId="a" fill={STATUS_COLORS.awaiting_pl} />
                <Bar dataKey="pl_rejected" name="PL Rejected" stackId="a" fill={STATUS_COLORS.pl_rejected} />
                <Bar
                  dataKey="pl_approved"
                  name="PL Approved"
                  stackId="a"
                  fill={STATUS_COLORS.pl_approved}
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="py-10 text-center text-sm text-slate-500">No clients to chart.</p>
        )}
        {clients?.length > 12 && (
          <p className="mt-1 text-xs text-slate-500">Showing top 12 clients by employee count.</p>
        )}
      </ChartCard>
    </div>
  );
}
