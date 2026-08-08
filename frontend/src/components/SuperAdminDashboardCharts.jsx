import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';

const FUNNEL_COLORS = ['#4f46e5', '#6366f1', '#059669', '#047857'];
const STATUS_COLORS = {
  activations: '#4f46e5',
  submitted: '#6366f1',
  pending: '#d97706',
  pm_approved: '#059669',
  pl_approved: '#047857'
};

function ChartCard({ title, children, className = '' }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
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

  const outcomeData = [
    { name: 'Onboarded', value: totals.total_onboarded || 0, fill: '#059669' },
    { name: 'Active', value: totals.active_employees || 0, fill: '#4f46e5' },
    { name: 'Dropout', value: totals.total_dropout || 0, fill: '#e11d48' }
  ].filter((d) => d.value > 0);

  const clientChartData = (clients || [])
    .slice()
    .sort((a, b) => (b.employee_count || 0) - (a.employee_count || 0))
    .slice(0, 12)
    .map((c) => ({
      name:
        String(c.client_name || c.contract_code || 'Client').length > 16
          ? `${String(c.client_name || c.contract_code).slice(0, 14)}…`
          : c.client_name || c.contract_code || 'Client',
      activations: c.onboarding_activations || 0,
      submitted: c.employees_submitted || 0,
      pending: c.submission_pending || 0,
      pm_approved: c.pm_approved || 0,
      pl_approved: c.payroll_approved || 0
    }));

  const hasFunnel = funnelData.some((d) => d.value > 0);
  const hasOutcome = outcomeData.length > 0;
  const hasClients = clientChartData.length > 0;

  if (!hasFunnel && !hasOutcome && !hasClients) {
    return null;
  }

  return (
    <div className="mb-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
      <ChartCard title="Pipeline funnel">
        {hasFunnel ? (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={funnelData} layout="vertical" margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: '#64748b' }} />
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
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="py-10 text-center text-sm text-slate-500">No pipeline data yet.</p>
        )}
      </ChartCard>

      <ChartCard title="Onboarded vs dropout">
        {hasOutcome ? (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={outcomeData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={52}
                  outerRadius={88}
                  paddingAngle={2}
                >
                  {outcomeData.map((entry) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ borderRadius: 8, borderColor: '#e2e8f0', fontSize: 12 }}
                />
                <Legend
                  verticalAlign="bottom"
                  height={28}
                  formatter={(value) => <span className="text-xs text-slate-600">{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="py-10 text-center text-sm text-slate-500">No onboarding outcomes yet.</p>
        )}
      </ChartCard>

      <ChartCard title="Client-wise onboarding status" className="xl:col-span-2">
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
                <Bar dataKey="activations" name="Activations" stackId="a" fill={STATUS_COLORS.activations} />
                <Bar dataKey="submitted" name="Submitted" stackId="a" fill={STATUS_COLORS.submitted} />
                <Bar dataKey="pending" name="Pending" stackId="a" fill={STATUS_COLORS.pending} />
                <Bar dataKey="pm_approved" name="PM Approved" stackId="a" fill={STATUS_COLORS.pm_approved} />
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
