import { Link } from 'react-router-dom';

function IconBackArrow({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
    </svg>
  );
}

/**
 * Top-of-content back control: ← Back to Clients
 */
export default function BackToClientsLink({ to, className = '' }) {
  return (
    <Link
      to={to}
      className={`inline-flex items-center gap-1.5 text-sm font-medium text-slate-800 hover:text-indigo-700 ${className}`.trim()}
    >
      <IconBackArrow className="h-4 w-4 shrink-0" />
      <span>Back to Clients</span>
    </Link>
  );
}
