import { useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { matchPmClientDetailPath, pmClientTabUrl } from '../lib/pmClientRoutes';
import { api } from '../lib/api';
import CollapsibleAppSidebar, {
  IconClients,
  IconDashboard,
  IconOnboarding,
  readSidebarCollapsed
} from './CollapsibleAppSidebar';

function IconMenu({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
    </svg>
  );
}

function IconClose({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function JoiningStatusReminderModal({ title, rows, onClose, onNext }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 px-4">
      <div className="w-full max-w-2xl rounded-xl bg-white p-5 shadow-2xl">
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
        <p className="mt-1 text-sm text-slate-600">Please update their status after confirmations.</p>
        <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Client Name</th>
                <th className="px-4 py-2 text-left font-medium">DOJ</th>
                <th className="px-4 py-2 text-left font-medium">Number of employees</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {rows.map((row) => (
                <tr key={`${row.client_id}-${row.doj_label}`}>
                  <td className="px-4 py-2 text-slate-800">{row.client_name}</td>
                  <td className="px-4 py-2 text-slate-700">{row.doj_label}</td>
                  <td className="px-4 py-2 text-slate-700">{row.employee_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Close
          </button>
          {onNext && (
            <button
              type="button"
              onClick={onNext}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PmLayout() {
  const { profile, user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSidebarCollapsed);
  const [joiningReminderToday, setJoiningReminderToday] = useState([]);
  const [joiningReminderOverdue, setJoiningReminderOverdue] = useState([]);
  const [joiningReminderStep, setJoiningReminderStep] = useState('');

  const pathname = location.pathname;
  const clientRoute = useMemo(() => matchPmClientDetailPath(pathname), [pathname]);
  const isClientDetail = Boolean(clientRoute);
  const clientsNavActive =
    pathname === '/pm-dashboard/clients' || pathname.startsWith('/pm-dashboard/client/');
  const dashboardNavActive = pathname === '/pm-dashboard/dashboard';

  const c = clientRoute?.clientId;
  const clientTabSeg = clientRoute?.tabSegment;
  const isClientOnboardingModule =
    clientTabSeg === 'dashboard' || clientTabSeg === 'in-progress';

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;
    const loadJoiningReminders = async () => {
      try {
        const payload = await api.getPmJoiningStatusReminders();
        if (cancelled) return;
        const todayRows = Array.isArray(payload?.today) ? payload.today : [];
        const overdueRows = Array.isArray(payload?.overdue) ? payload.overdue : [];
        setJoiningReminderToday(todayRows);
        setJoiningReminderOverdue(overdueRows);
        if (todayRows.length > 0) setJoiningReminderStep('today');
        else if (overdueRows.length > 0) setJoiningReminderStep('overdue');
      } catch {
        // Non-blocking: PM navigation should continue even if reminder fetch fails.
      }
    };
    loadJoiningReminders();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  const closeMobile = () => setMobileNavOpen(false);

  const defaultItems = [
    {
      id: 'dashboard',
      to: '/pm-dashboard/dashboard',
      label: 'Dashboard',
      active: dashboardNavActive,
      icon: <IconDashboard className="h-full w-full" />
    },
    {
      id: 'clients',
      to: '/pm-dashboard/clients',
      label: 'Clients',
      active: clientsNavActive && !isClientDetail,
      icon: <IconClients className="h-full w-full" />
    }
  ];

  const clientItems = c
    ? [
        {
          id: 'onboarding',
          to: pmClientTabUrl(c, 'client_dashboard'),
          label: 'Onboarding',
          active: isClientOnboardingModule,
          icon: <IconOnboarding className="h-full w-full" filled={isClientOnboardingModule} />
        }
      ]
    : [];

  const renderSidebar = (showCollapseToggle = true) => (
    <CollapsibleAppSidebar
      homeTo="/pm-dashboard/clients"
      profile={profile}
      user={user}
      onSignOut={handleSignOut}
      onNavigate={closeMobile}
      collapsed={sidebarCollapsed}
      onCollapsedChange={setSidebarCollapsed}
      showCollapseToggle={showCollapseToggle}
      items={isClientDetail && c ? clientItems : defaultItems}
    />
  );

  return (
    <div className="flex h-screen max-h-screen overflow-hidden bg-slate-100">
      <aside className="relative z-30 hidden h-full max-h-screen shrink-0 overflow-visible border-r border-slate-800/80 lg:block">
        {renderSidebar(true)}
      </aside>

      {mobileNavOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-sm lg:hidden"
          aria-label="Close menu"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 h-screen max-h-screen overflow-visible border-r border-slate-800/80 shadow-2xl transition-transform duration-200 ease-out lg:hidden ${
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {renderSidebar(false)}
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="z-20 flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
          <button
            type="button"
            onClick={() => setMobileNavOpen((v) => !v)}
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
            aria-expanded={mobileNavOpen}
            aria-label={mobileNavOpen ? 'Close navigation' : 'Open navigation'}
          >
            {mobileNavOpen ? <IconClose className="h-6 w-6" /> : <IconMenu className="h-6 w-6" />}
          </button>
          <span className="min-w-0 truncate text-sm font-semibold text-slate-900">Onboarding System</span>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
          <Outlet />
        </div>
      </div>

      {joiningReminderStep === 'today' && joiningReminderToday.length > 0 && (
        <JoiningStatusReminderModal
          title="Joining Status Update Reminder (DOJ - Today)"
          rows={joiningReminderToday}
          onClose={() => setJoiningReminderStep('')}
          onNext={joiningReminderOverdue.length > 0 ? () => setJoiningReminderStep('overdue') : null}
        />
      )}
      {joiningReminderStep === 'overdue' && joiningReminderOverdue.length > 0 && (
        <JoiningStatusReminderModal
          title="Joining Status Update Reminder (DOJ - Overdue)"
          rows={joiningReminderOverdue}
          onClose={() => setJoiningReminderStep('')}
          onNext={null}
        />
      )}
    </div>
  );
}
