import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import CollapsibleAppSidebar, {
  IconDashboard,
  IconOnboarding,
  SidebarCollapseToggle,
  readSidebarCollapsed,
  writeSidebarCollapsed
} from './CollapsibleAppSidebar';
import BackToClientsLink from './BackToClientsLink';

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

function IconCheck({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function IconReject({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function IconId({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5zm6-10.125a1.875 1.875 0 11-3.75 0 1.875 1.875 0 013.75 0zm1.294 6.336a6.721 6.721 0 01-3.17.789 6.721 6.721 0 01-3.168-.789 3.376 3.376 0 016.338 0z"
      />
    </svg>
  );
}

function IconCalendar({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"
      />
    </svg>
  );
}

function IconSettings({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function IconUserSwitch({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"
      />
    </svg>
  );
}

export default function PayrollClientLayout() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, user, signOut } = useAuth();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSidebarCollapsed);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  const closeMobile = () => setMobileNavOpen(false);
  const base = `/dashboard/client/${id}`;
  const path = location.pathname;

  const items = [
    {
      id: 'dashboard',
      to: `${base}/dashboard`,
      label: 'Dashboard',
      active: /\/dashboard\/?$/.test(path),
      icon: <IconDashboard className="h-full w-full" />
    },
    {
      id: 'pm-approved',
      to: `${base}/approved-employees`,
      label: 'PM Approved',
      active: /\/approved-employees\/?$/.test(path),
      icon: <IconOnboarding className="h-full w-full" />
    },
    {
      id: 'approved',
      to: `${base}/pl-approved-employees`,
      label: 'Approved',
      active: path.includes('/pl-approved-employees'),
      icon: <IconCheck className="h-full w-full" />
    },
    {
      id: 'rejected',
      to: `${base}/rejected-employees`,
      label: 'Rejected',
      active: path.includes('/rejected-employees'),
      icon: <IconReject className="h-full w-full" />
    },
    {
      id: 'identity',
      to: `${base}/identity-numbers`,
      label: 'UAN & ESIC',
      active: path.includes('/identity-numbers'),
      icon: <IconId className="h-full w-full" />
    },
    {
      id: 'attendance',
      to: `${base}/attendance`,
      label: 'Attendance',
      active: path.includes('/attendance'),
      icon: <IconCalendar className="h-full w-full" />
    },
    {
      id: 'policy',
      to: `${base}/policy`,
      label: 'Policy Configuration',
      active: path.includes('/policy'),
      icon: <IconSettings className="h-full w-full" />
    },
    {
      id: 'assign-pm',
      to: `${base}/assign-pm`,
      label: 'Assign Program Manager',
      active: path.includes('/assign-pm'),
      icon: <IconUserSwitch className="h-full w-full" />
    }
  ];

  const renderSidebar = () => (
    <CollapsibleAppSidebar
      homeTo="/dashboard/clients"
      profile={profile}
      user={user}
      onSignOut={handleSignOut}
      onNavigate={closeMobile}
      collapsed={sidebarCollapsed}
      onCollapsedChange={setSidebarCollapsed}
      items={items}
    />
  );

  const toggleSidebarCollapsed = () => {
    setSidebarCollapsed((v) => {
      const next = !v;
      writeSidebarCollapsed(next);
      return next;
    });
  };

  return (
    <div className="flex h-screen max-h-screen overflow-hidden bg-slate-100">
      <aside className="relative z-30 hidden h-full max-h-screen shrink-0 overflow-visible border-r border-slate-800/80 lg:block">
        {renderSidebar()}
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
        {renderSidebar()}
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="z-20 flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white/95 px-3 py-2 backdrop-blur">
          <button
            type="button"
            onClick={() => setMobileNavOpen((v) => !v)}
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
            aria-expanded={mobileNavOpen}
            aria-label={mobileNavOpen ? 'Close navigation' : 'Open navigation'}
          >
            {mobileNavOpen ? <IconClose className="h-6 w-6" /> : <IconMenu className="h-6 w-6" />}
          </button>
          <SidebarCollapseToggle
            collapsed={sidebarCollapsed}
            onToggle={toggleSidebarCollapsed}
            className="hidden lg:inline-flex"
          />
          <span className="min-w-0 truncate text-sm font-semibold text-slate-900 lg:hidden">Onboarding System</span>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
          <div className="px-6 pt-6">
            <BackToClientsLink to="/dashboard/clients" />
          </div>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
