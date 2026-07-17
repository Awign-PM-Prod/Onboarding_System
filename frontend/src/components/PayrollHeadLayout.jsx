import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import CollapsibleAppSidebar, {
  IconClients,
  IconDashboard,
  SidebarCollapseToggle,
  readSidebarCollapsed,
  writeSidebarCollapsed
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

export default function PayrollHeadLayout() {
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

  if (location.pathname === '/admin-dashboard') {
    return <Navigate to="/admin-dashboard/dashboard" replace />;
  }

  const pathname = location.pathname;
  const items = [
    {
      id: 'dashboard',
      to: '/admin-dashboard/dashboard',
      label: 'Dashboard',
      active: pathname === '/admin-dashboard/dashboard',
      icon: <IconDashboard className="h-full w-full" />
    },
    {
      id: 'clients',
      to: '/admin-dashboard/clients',
      label: 'Clients',
      active: pathname.startsWith('/admin-dashboard/clients'),
      icon: <IconClients className="h-full w-full" />
    }
  ];

  const renderSidebar = () => (
    <CollapsibleAppSidebar
      homeTo="/admin-dashboard/dashboard"
      profile={profile}
      user={user}
      onSignOut={handleSignOut}
      onNavigate={() => setMobileNavOpen(false)}
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
          <Outlet />
        </div>
      </div>
    </div>
  );
}
