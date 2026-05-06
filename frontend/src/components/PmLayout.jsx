import { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { matchPmClientDetailPath, pmClientTabUrl } from '../lib/pmClientRoutes';

const ROLE_LABEL = {
  PAYROLL_LEAD: 'Payroll Lead',
  PROGRAM_MANAGER: 'Program Manager'
};

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

function IconArrowLeft({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
    </svg>
  );
}

function initialsFromName(name) {
  if (!name || typeof name !== 'string') return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function PmLayout() {
  const { profile, user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [clientSidebarMeta, setClientSidebarMeta] = useState(null);

  const pathname = location.pathname;
  const clientRoute = useMemo(() => matchPmClientDetailPath(pathname), [pathname]);
  const isClientDetail = Boolean(clientRoute);
  const clientsNavActive =
    pathname === '/pm-dashboard/clients' || pathname.startsWith('/pm-dashboard/client/');
  const dashboardNavActive = pathname === '/pm-dashboard/dashboard';

  useEffect(() => {
    if (!isClientDetail) setClientSidebarMeta(null);
  }, [isClientDetail]);

  useEffect(() => {
    // Close drawer on in-app or browser history navigation
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync UI to external route
    setMobileNavOpen(false);
  }, [pathname]);

  const initials = useMemo(
    () => initialsFromName(profile?.name ?? user?.email ?? ''),
    [profile?.name, user?.email]
  );

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  const c = clientRoute?.clientId;
  const tabSeg = clientRoute?.tabSegment;
  const cc = clientSidebarMeta?.counts;

  const sidebarFooter = (
    <div className="shrink-0 border-t border-slate-700/80 p-4 space-y-3">
      <div>
        <button
          type="button"
          onClick={() => setProfileOpen((v) => !v)}
          className="flex w-full items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/50 px-2 py-2 text-left text-slate-200 transition-colors hover:border-slate-600 hover:bg-slate-800"
          aria-expanded={profileOpen}
          aria-label="Profile"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-500 text-xs font-semibold text-white">
            {initials}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-white">{profile?.name ?? 'Profile'}</span>
            <span className="block truncate text-xs text-slate-400">
              {ROLE_LABEL[profile?.role] ?? profile?.role ?? ''}
            </span>
          </span>
        </button>
        {profileOpen && (
          <div className="mt-2 rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-xs text-slate-300">
            <p className="truncate font-medium text-white">{profile?.name}</p>
            <p className="mt-0.5 truncate text-slate-400">{user?.email}</p>
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={handleSignOut}
        className="w-full rounded-lg border border-slate-600 bg-transparent px-3 py-2 text-sm font-medium text-slate-200 transition-colors hover:border-red-500/50 hover:bg-red-950/40 hover:text-red-100"
      >
        Log out
      </button>
    </div>
  );

  const defaultSidebarContent = (
    <>
      <div className="shrink-0 border-b border-slate-700/80 px-5 py-6">
        <NavLink
          to="/pm-dashboard/clients"
          className="block text-lg font-semibold tracking-tight text-white transition-colors hover:text-indigo-200"
          onClick={() => setMobileNavOpen(false)}
        >
          Onboarding System
        </NavLink>
        <p className="mt-1 text-xs text-slate-400">Program Manager portal</p>
      </div>

      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-y-contain px-3 py-4" aria-label="Main">
        <NavLink
          to="/pm-dashboard/dashboard"
          className={() =>
            `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              dashboardNavActive
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/30'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`
          }
          onClick={() => setMobileNavOpen(false)}
        >
          <IconDashboard className="h-5 w-5 shrink-0 opacity-90" />
          Dashboard
        </NavLink>
        <NavLink
          to="/pm-dashboard/clients"
          className={() =>
            `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              clientsNavActive
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/30'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`
          }
          onClick={() => setMobileNavOpen(false)}
        >
          <IconClients className="h-5 w-5 shrink-0 opacity-90" />
          Clients
        </NavLink>
      </nav>

      {sidebarFooter}
    </>
  );

  const clientSidebarContent =
    c &&
    (
      <>
        <div className="shrink-0 space-y-4 border-b border-slate-700/80 px-4 py-5">
          <NavLink
            to="/pm-dashboard/clients"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-indigo-200 transition-colors hover:bg-slate-800 hover:text-white"
            onClick={() => setMobileNavOpen(false)}
          >
            <IconArrowLeft className="h-4 w-4 shrink-0" />
            Back to clients
          </NavLink>
        </div>

        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-y-contain px-3 py-4" aria-label="Client sections">
          <NavLink
            to={pmClientTabUrl(c, 'add_employee')}
            className={() =>
              `flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                tabSeg === 'add-employees'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/30'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`
            }
            onClick={() => setMobileNavOpen(false)}
          >
            Add Employee
          </NavLink>
          <NavLink
            to={pmClientTabUrl(c, 'pending')}
            className={() =>
              `flex items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                tabSeg === 'pending'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/30'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`
            }
            onClick={() => setMobileNavOpen(false)}
          >
            <span>Available Employees</span>
            {cc && <span className={tabSeg === 'pending' ? 'text-indigo-100' : 'text-slate-500'}>({cc.pending})</span>}
          </NavLink>
          <NavLink
            to={pmClientTabUrl(c, 'role_assigned')}
            className={() =>
              `flex items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                tabSeg === 'role-assigned'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/30'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`
            }
            onClick={() => setMobileNavOpen(false)}
          >
            <span>Role Assigned</span>
            {cc && <span className={tabSeg === 'role-assigned' ? 'text-indigo-100' : 'text-slate-500'}>({cc.role_assigned})</span>}
          </NavLink>
          <NavLink
            to={pmClientTabUrl(c, 'in_progress')}
            className={() =>
              `flex items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                tabSeg === 'in-progress'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/30'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`
            }
            onClick={() => setMobileNavOpen(false)}
          >
            <span>Onboarding In Progress</span>
            {cc && <span className={tabSeg === 'in-progress' ? 'text-indigo-100' : 'text-slate-500'}>({cc.in_progress})</span>}
          </NavLink>
          <NavLink
            to={pmClientTabUrl(c, 'pl_reviewed')}
            className={() =>
              `flex items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                tabSeg === 'pl-reviewed'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/30'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`
            }
            onClick={() => setMobileNavOpen(false)}
          >
            <span>PL Reviewed</span>
            {cc && <span className={tabSeg === 'pl-reviewed' ? 'text-indigo-100' : 'text-slate-500'}>({cc.pl_reviewed})</span>}
          </NavLink>
        </nav>

        {sidebarFooter}
      </>
    );

  const sidebarContent = isClientDetail && clientSidebarContent ? clientSidebarContent : defaultSidebarContent;

  return (
    <div className="flex h-screen max-h-screen overflow-hidden bg-slate-100">
      <aside className="relative z-30 hidden h-full max-h-screen w-64 shrink-0 flex-col overflow-hidden border-r border-slate-800 bg-slate-900 lg:flex">
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
        className={`fixed inset-y-0 left-0 z-50 flex h-screen max-h-screen w-[min(18rem,88vw)] flex-col overflow-hidden border-r border-slate-800 bg-slate-900 shadow-2xl transition-transform duration-200 ease-out lg:hidden ${
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
          <Outlet context={{ setClientSidebarMeta }} />
        </div>
      </div>
    </div>
  );
}
