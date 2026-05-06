export default function PmDashboardHome() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-2">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">Overview and activity for your assigned programs.</p>
      </div>
      <div className="mt-8 rounded-2xl border border-dashed border-slate-200 bg-white p-14 text-center shadow-sm">
        <p className="text-sm font-medium text-slate-600">Your dashboard is empty</p>
        <p className="mt-1 text-sm text-slate-400">Charts and summaries will appear here in a future update.</p>
      </div>
    </main>
  );
}
