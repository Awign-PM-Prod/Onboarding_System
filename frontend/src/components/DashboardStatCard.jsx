/** Shared KPI/stat card used on PM, PL, and Super Admin dashboards. */

export const DASHBOARD_STAT_ICONS = {
  users: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 19a4 4 0 0 0-8 0m12 0a4 4 0 0 0-3-3.87M9 7a4 4 0 1 0 6 0A4 4 0 0 0 9 7Zm10 4a3 3 0 1 0-2.83-4"
      />
    </svg>
  ),
  activations: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 19a4 4 0 0 0-8 0m12 0a4 4 0 0 0-3-3.87M9 7a4 4 0 1 0 6 0A4 4 0 0 0 9 7Zm10 4a3 3 0 1 0-2.83-4"
      />
    </svg>
  ),
  submitted: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.5 20.118a7.5 7.5 0 0 1 15 0"
      />
    </svg>
  ),
  pending: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  ),
  approved: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  ),
  rejected: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  ),
  correction: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125"
      />
    </svg>
  ),
  check: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
    </svg>
  ),
  building: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.75 21h16.5M4.5 3h15v18h-15V3Zm4.5 4.5h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15"
      />
    </svg>
  ),
  document: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
      />
    </svg>
  ),
};

const TONES = {
  emerald: { icon: 'bg-emerald-50 text-emerald-600', value: 'text-emerald-700' },
  rose: { icon: 'bg-rose-50 text-rose-600', value: 'text-rose-700' },
  indigo: { icon: 'bg-indigo-50 text-indigo-600', value: 'text-indigo-700' },
  amber: { icon: 'bg-amber-50 text-amber-600', value: 'text-amber-700' },
  violet: { icon: 'bg-violet-50 text-violet-600', value: 'text-slate-900' },
  slate: { icon: 'bg-slate-100 text-slate-600', value: 'text-slate-900' },
};

export default function DashboardStatCard({ title, value, tone = 'slate', icon }) {
  const t = TONES[tone] || TONES.slate;
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{title}</p>
        {icon ? (
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${t.icon}`}>
            {icon}
          </span>
        ) : null}
      </div>
      <p className={`mt-1 text-2xl font-semibold ${t.value}`}>{value}</p>
    </div>
  );
}
