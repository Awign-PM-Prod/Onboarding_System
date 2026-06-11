import { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { matchPmClientDetailPath, pmClientTabUrl } from '../lib/pmClientRoutes';
import { api } from '../lib/api';

const ROLE_LABEL = {
  PAYROLL_LEAD: 'Payroll Lead',
  PROGRAM_MANAGER: 'Program Manager'
};

function IconLogo({ className }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden>
      <path
        d="M6 8h9v9H6V8zm11 0h9v9h-9V8zM6 19h9v9H6v-9zm11 0h9v9h-9v-9z"
        fill="currentColor"
        opacity="0.95"
      />
    </svg>
  );
}

function IconDashboard({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 8.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
    </svg>
  );
}

function IconClients({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  );
}

function IconOnboarding({ className, filled = false }) {
  if (filled) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M12 12a4 4 0 100-8 4 4 0 000 8zm-7 9a7 7 0 1114 0H5z" />
      </svg>
    );
  }
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
    </svg>
  );
}

function IconSettings({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function IconLogout({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 9V5.25A2.25 2.25 0 0110.5 3h9a2.25 2.25 0 012.25 2.25v13.5A2.25 2.25 0 0119.5 21h-9a2.25 2.25 0 01-2.25-2.25V15m-3 0l3-3m0 0l3 3m-3-3H3.75" />
    </svg>
  );
}

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

function IconChevronLeft({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
    </svg>
  );
}

function SidebarTile({ to, onClick, active, label, children, ariaLabel }) {
  const className = `flex w-full max-w-full flex-col items-center justify-center gap-2 rounded-2xl px-1.5 py-3.5 text-center transition-colors ${
    active
      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/30'
      : 'bg-white/[0.06] text-slate-300 hover:bg-white/10 hover:text-white'
  }`;

  const body = (
    <>
      <span className="flex h-7 w-7 items-center justify-center">{children}</span>
      <span className="max-w-full break-words text-[10px] font-medium leading-tight tracking-wide">{label}</span>
    </>
  );

  if (to) {
    return (
      <NavLink to={to} className={className} aria-label={ariaLabel ?? label} onClick={onClick}>
        {body}
      </NavLink>
    );
  }

  return (
    <button type="button" className={className} onClick={onClick} aria-label={ariaLabel ?? label}>
      {body}
    </button>
  );
}

function SidebarBackLink({ to, label = 'Back', ariaLabel, onClick }) {
  return (
    <NavLink
      to={to}
      className="group flex w-full max-w-full flex-col items-center justify-center gap-1.5 rounded-xl px-1 py-2 text-center transition-colors"
      aria-label={ariaLabel ?? label}
      onClick={onClick}
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 bg-white/[0.04] text-slate-300 transition-colors group-hover:border-white/25 group-hover:bg-white/[0.08] group-hover:text-white">
        <IconChevronLeft className="h-5 w-5" />
      </span>
      <span className="max-w-full break-words text-[10px] font-medium leading-tight tracking-wide text-slate-400 transition-colors group-hover:text-slate-200">
        {label}
      </span>
    </NavLink>
  );
}

function JoiningStatusReminderModal({ title, rows, onClose, onNext }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 px-4">
      <div className="w-full max-w-2xl rounded-xl bg-white p-5 shadow-2xl">
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
        <p className="mt-1 text-sm text-slate-600">
          Please update their status after confirmations.
        </p>
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

function SidebarShell({ children, footer, profileOpen, profile, user, onCloseMobile }) {
  return (
    <div className="flex h-full flex-col overflow-x-hidden bg-[#0c0f14]">
      <div className="flex shrink-0 justify-center px-3 pb-2 pt-5">
        <NavLink
          to="/pm-dashboard/clients"
          className="flex h-11 w-11 items-center justify-center rounded-xl text-white transition-opacity hover:opacity-80"
          aria-label="Onboarding System home"
          onClick={onCloseMobile}
        >
          <IconLogo className="h-8 w-8" />
        </NavLink>
      </div>

      <nav className="flex min-h-0 flex-1 flex-col items-stretch gap-3 overflow-x-hidden overflow-y-auto px-2 py-4" aria-label="Modules">
        {children}
      </nav>

      <div className="relative shrink-0 overflow-x-hidden px-2 pb-5 pt-2">
        {profileOpen && (
          <div className="absolute bottom-full left-2 right-2 mb-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-xs text-slate-300 shadow-xl">
            <p className="truncate font-medium text-white">{profile?.name}</p>
            <p className="mt-0.5 truncate text-slate-400">{user?.email}</p>
            <p className="mt-1 text-slate-500">{ROLE_LABEL[profile?.role] ?? profile?.role ?? ''}</p>
          </div>
        )}
        <div className="flex w-full flex-col items-stretch gap-3">{footer}</div>
      </div>
    </div>
  );
}

export default function PmLayout() {
  const { profile, user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
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
    setProfileOpen(false);
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

  const sidebarFooter = (
    <>
      <SidebarTile
        active={profileOpen}
        label="Settings"
        ariaLabel="Settings and profile"
        onClick={() => setProfileOpen((v) => !v)}
      >
        <IconSettings className="h-6 w-6" />
      </SidebarTile>
      <SidebarTile label="Logout" ariaLabel="Log out" onClick={handleSignOut}>
        <IconLogout className="h-6 w-6" />
      </SidebarTile>
    </>
  );

  const defaultSidebarContent = (
    <SidebarShell
      profileOpen={profileOpen}
      profile={profile}
      user={user}
      onCloseMobile={closeMobile}
      footer={sidebarFooter}
    >
      <SidebarTile
        to="/pm-dashboard/dashboard"
        active={dashboardNavActive}
        label="Dashboard"
        onClick={closeMobile}
      >
        <IconDashboard className="h-6 w-6" />
      </SidebarTile>
      <SidebarTile
        to="/pm-dashboard/clients"
        active={clientsNavActive && !isClientDetail}
        label="Clients"
        onClick={closeMobile}
      >
        <IconClients className="h-6 w-6" />
      </SidebarTile>
    </SidebarShell>
  );

  const clientSidebarContent =
    c &&
    (
      <SidebarShell
        profileOpen={profileOpen}
        profile={profile}
        user={user}
        onCloseMobile={closeMobile}
        footer={sidebarFooter}
      >
        <SidebarBackLink
          to="/pm-dashboard/clients"
          label="Back"
          ariaLabel="Back to clients"
          onClick={closeMobile}
        />
        <div className="mx-1 border-t border-white/10" aria-hidden />
        <SidebarTile
          to={pmClientTabUrl(c, 'client_dashboard')}
          active={isClientOnboardingModule}
          label="Onboarding"
          onClick={closeMobile}
        >
          <IconOnboarding className="h-6 w-6" filled={isClientOnboardingModule} />
        </SidebarTile>
      </SidebarShell>
    );

  const sidebarContent = isClientDetail && clientSidebarContent ? clientSidebarContent : defaultSidebarContent;

  const sidebarWidthClass = 'w-[5.75rem]';

  return (
    <div className="flex h-screen max-h-screen overflow-hidden bg-slate-100">
      <aside
        className={`relative z-30 hidden h-full max-h-screen ${sidebarWidthClass} shrink-0 flex-col overflow-x-hidden overflow-y-hidden border-r border-slate-800/80 lg:flex`}
      >
        {sidebarContent}
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
        className={`fixed inset-y-0 left-0 z-50 flex h-screen max-h-screen ${sidebarWidthClass} flex-col overflow-x-hidden overflow-y-hidden border-r border-slate-800/80 shadow-2xl transition-transform duration-200 ease-out lg:hidden ${
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {sidebarContent}
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
