import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { WorkspaceBasePathProvider, useWorkspacePaths } from '../context/WorkspaceBasePath';
import { api } from '../lib/api';
import {
  IconClients,
  IconDashboard,
  IconOnboarding,
  IconSalary,
  IconSettings
} from './CollapsibleAppSidebar';
import SalaryChangeNotice from './SalaryChangeNotice';
import { usePendingSalaryChanges } from '../hooks/usePendingSalaryChanges';
import TwoPaneSidebar, {
  SidebarModulesPanel,
  writeSidebarPanelOpen
} from './TwoPaneSidebar';
import ChangeRequestReviewPopups from './ChangeRequestReviewPopups';

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

function IconClipboardCheck({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M11.35 3.836c.065-.24.24-.44.48-.505A2.25 2.25 0 0114.25 3.75h1.5a2.25 2.25 0 012.25 2.25v.5M11.35 3.836A2.25 2.25 0 019.75 3.75h-1.5a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 008.25 21.75h7.5A2.25 2.25 0 0018 19.5V6A2.25 2.25 0 0015.75 3.75h-1.5a2.25 2.25 0 00-2.25 2.25v.5m-3.9 4.704l1.5 1.5 3-3.75"
      />
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

function IconActivity({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.75 12h4.5l2.25 6 3-12 2.25 6h4.5"
      />
    </svg>
  );
}

function IconMail({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
      />
    </svg>
  );
}

function IconBell({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
      />
    </svg>
  );
}

function IconBulkAlerts({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
      />
    </svg>
  );
}

function IconLock({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
      />
    </svg>
  );
}

function IconWage({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 8.25H9m6 3H9m3 6l-3-3h1.5a3 3 0 100-6M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function IconMap({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 6.75V15m0-8.25L15.75 4.5 21 6.75v11.25L15.75 15.75 9 18 3 15.75V4.5L9 6.75zm6.75-2.25V15"
      />
    </svg>
  );
}

function SuperAdminLayoutInner() {
  const navigate = useNavigate();
  const location = useLocation();
  const paths = useWorkspacePaths();
  const { profile, user, signOut } = useAuth();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [clients, setClients] = useState([]);
  const mainScrollRef = useRef(null);

  const listSaDoj = useCallback(() => api.listSuperAdminDojExtendRequests('PENDING'), []);
  const reviewSaDoj = useCallback(
    (requestId, opts) => api.reviewSuperAdminDojExtendRequest(requestId, opts),
    []
  );
  const listSaJoining = useCallback(
    () => api.listSuperAdminJoiningStatusChangeRequests('PENDING'),
    []
  );
  const reviewSaJoining = useCallback(
    (requestId, opts) => api.reviewSuperAdminJoiningStatusChangeRequest(requestId, opts),
    []
  );

  const pathname = location.pathname;
  const clientId = paths.matchClientId(pathname);
  const isSalaryChangesPage = pathname.includes('/salary-changes');
  const pendingSalary = usePendingSalaryChanges(clientId);
  const isClientsListPage = pathname === paths.clients;
  const isClientFormPage = paths.isClientFormPath(pathname);
  const isActivityPage = pathname.startsWith('/super-admin/activity');
  const isMailTrackerPage = pathname.startsWith('/super-admin/mail-tracker');
  const isSalaryPage = pathname.startsWith('/super-admin/salary-config');
  const isHolidayCalendarPage = pathname.startsWith('/super-admin/holiday-calendar');
  const isLeaveConfigPage = pathname.startsWith('/super-admin/leave-config');
  const isRegionZonesPage = pathname.startsWith('/super-admin/region-zones');
  const isTaskRemindersPage = pathname.startsWith('/super-admin/task-reminders');
  const isBulkAlertsPage = pathname.startsWith('/super-admin/bulk-alerts');
  const isStaffAccountsPage = pathname.startsWith('/super-admin/staff-accounts');
  const isOnboardingPage = /\/client\/[^/]+\/onboarding(\/|$)/.test(pathname);

  const loadClients = useCallback(async () => {
    try {
      const data = await api.listClients();
      setClients(Array.isArray(data) ? data : []);
    } catch {
      setClients([]);
    }
  }, []);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  useEffect(() => {
    if (isClientsListPage) loadClients();
  }, [isClientsListPage, loadClients]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    mainScrollRef.current?.scrollTo({ top: 0, left: 0 });
  }, [pathname]);

  const setPanelOpenPersist = (open) => {
    setPanelOpen(open);
    writeSidebarPanelOpen(open);
  };

  useEffect(() => {
    if (clientId) {
      setPanelOpen(true);
      writeSidebarPanelOpen(true);
    } else {
      setPanelOpen(false);
      writeSidebarPanelOpen(false);
    }
  }, [clientId]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  if (pathname === paths.basePath) {
    return <Navigate to={paths.home} replace />;
  }

  const clientsRailActive = Boolean(clientId) || isClientsListPage || isClientFormPage;

  const railItems = [
    {
      id: 'dashboard',
      to: paths.home,
      label: 'Dashboard',
      active: pathname === paths.home,
      icon: <IconDashboard className="h-full w-full" />,
      onClick: () => setPanelOpenPersist(false)
    },
    {
      id: 'clients',
      to: paths.clients,
      label: 'Clients',
      active: clientsRailActive,
      icon: <IconClients className="h-full w-full" />,
      onClick: () => setPanelOpenPersist(false)
    },
    {
      id: 'activity',
      to: '/super-admin/activity',
      label: 'Activity Logs',
      active: isActivityPage,
      icon: <IconActivity className="h-full w-full" />,
      onClick: () => setPanelOpenPersist(false)
    },
    {
      id: 'mail-tracker',
      to: '/super-admin/mail-tracker',
      label: 'Mail Tracker',
      active: isMailTrackerPage,
      icon: <IconMail className="h-full w-full" />,
      onClick: () => setPanelOpenPersist(false)
    },
    {
      id: 'salary',
      to: '/super-admin/salary-config',
      label: 'Salary Config',
      active: isSalaryPage,
      icon: <IconWage className="h-full w-full" />,
      onClick: () => setPanelOpenPersist(false)
    },
    {
      id: 'region-zones',
      to: '/super-admin/region-zones',
      label: 'Region Zones',
      active: isRegionZonesPage,
      icon: <IconMap className="h-full w-full" />,
      onClick: () => setPanelOpenPersist(false)
    },
    {
      id: 'holiday-calendar',
      to: '/super-admin/holiday-calendar',
      label: 'Holiday Calendar',
      active: isHolidayCalendarPage,
      icon: <IconCalendar className="h-full w-full" />,
      onClick: () => setPanelOpenPersist(false)
    },
    {
      id: 'leave-config',
      to: '/super-admin/leave-config',
      label: 'Leave Config',
      active: isLeaveConfigPage,
      icon: <IconClipboardCheck className="h-full w-full" />,
      onClick: () => setPanelOpenPersist(false)
    },
    {
      id: 'task-reminders',
      to: '/super-admin/task-reminders',
      label: 'Task Reminders',
      active: isTaskRemindersPage,
      icon: <IconBell className="h-full w-full" />,
      onClick: () => setPanelOpenPersist(false)
    },
    {
      id: 'bulk-alerts',
      to: '/super-admin/bulk-alerts',
      label: 'Bulk Alerts',
      active: isBulkAlertsPage,
      icon: <IconBulkAlerts className="h-full w-full" />,
      onClick: () => setPanelOpenPersist(false)
    },
    {
      id: 'staff-accounts',
      to: '/super-admin/staff-accounts',
      label: 'Staff Accounts',
      active: isStaffAccountsPage,
      icon: <IconLock className="h-full w-full" />,
      onClick: () => setPanelOpenPersist(false)
    }
  ];

  const moduleItems = clientId
    ? [
        {
          id: 'dashboard',
          to: paths.client(clientId, 'dashboard'),
          label: 'Dashboard',
          active: /\/client\/[^/]+\/dashboard\/?$/.test(pathname),
          icon: <IconDashboard className="h-full w-full" />
        },
        {
          id: 'onboarding',
          to: paths.clientOnboarding(clientId, 'dashboard'),
          label: 'Onboarding',
          active: isOnboardingPage,
          icon: <IconOnboarding className="h-full w-full" />
        },
        {
          id: 'pm-approved',
          to: paths.client(clientId, 'approved-employees'),
          label: 'PM Approved',
          active: /\/approved-employees\/?$/.test(pathname),
          icon: <IconClipboardCheck className="h-full w-full" />
        },
        {
          id: 'approved',
          to: paths.client(clientId, 'pl-approved-employees'),
          label: 'Approved',
          active: pathname.includes('/pl-approved-employees'),
          icon: <IconCheck className="h-full w-full" />
        },
        {
          id: 'rejected',
          to: paths.client(clientId, 'rejected-employees'),
          label: 'Rejected',
          active: pathname.includes('/rejected-employees'),
          icon: <IconReject className="h-full w-full" />
        },
        {
          id: 'identity',
          to: paths.client(clientId, 'identity-numbers'),
          label: 'UAN & ESIC',
          active: pathname.includes('/identity-numbers'),
          icon: <IconId className="h-full w-full" />
        },
        {
          id: 'attendance',
          to: paths.client(clientId, 'attendance'),
          label: 'Attendance',
          active: pathname.includes('/attendance'),
          icon: <IconCalendar className="h-full w-full" />
        },
        {
          id: 'policy',
          to: paths.client(clientId, 'policy'),
          label: 'Policy Configuration',
          active: pathname.includes('/policy'),
          icon: <IconSettings className="h-full w-full" />
        },
        {
          id: 'salary-changes',
          to: paths.client(clientId, 'salary-changes'),
          label: 'Salary Changes',
          active: pathname.includes('/salary-changes'),
          icon: <IconSalary className="h-full w-full" />,
          badge: pendingSalary.count || null
        },
        {
          id: 'assign-pm',
          to: paths.client(clientId, 'assign-pm'),
          label: 'Re-Assign Program Manager',
          active: pathname.includes('/assign-pm'),
          icon: <IconUserSwitch className="h-full w-full" />
        }
      ]
    : [];

  const activeClient = clientId
    ? clients.find((c) => String(c.id) === String(clientId))
    : null;

  const renderPanel = (closeDrawer) => (collapsed) => {
    if (!clientId) return null;
    return (
      <SidebarModulesPanel
        collapsed={collapsed}
        clientName={activeClient?.client_name ?? 'Client'}
        items={moduleItems}
        onShowClients={() => {
          navigate(paths.clients);
          setPanelOpenPersist(false);
          closeDrawer?.();
        }}
        onNavigate={closeDrawer}
      />
    );
  };

  const renderSidebar = ({ forceExpanded = false, labeledRail = false } = {}) => (
    <TwoPaneSidebar
      homeTo={paths.home}
      profile={profile}
      user={user}
      onSignOut={handleSignOut}
      onNavigate={() => setMobileNavOpen(false)}
      railItems={railItems}
      panelVisible={Boolean(clientId)}
      panelExpanded={Boolean(clientId) && (panelOpen || forceExpanded)}
      onPanelExpandedChange={labeledRail ? undefined : setPanelOpenPersist}
      labeledRail={labeledRail}
      panel={renderPanel(() => setMobileNavOpen(false))}
    />
  );

  return (
    <div className="flex h-screen max-h-screen w-full min-w-0 overflow-hidden bg-slate-100">
      <aside className="relative z-30 hidden h-screen max-h-screen min-h-0 shrink-0 overflow-visible border-r border-slate-800/80 lg:block">
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
        {renderSidebar({ forceExpanded: true, labeledRail: true })}
      </aside>

      <div className="relative z-0 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="z-20 flex shrink-0 items-center gap-2 border-b border-slate-200 bg-white/95 px-3 py-2 backdrop-blur lg:hidden">
          <button
            type="button"
            onClick={() => setMobileNavOpen((v) => !v)}
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
            aria-expanded={mobileNavOpen}
            aria-label={mobileNavOpen ? 'Close navigation' : 'Open navigation'}
          >
            {mobileNavOpen ? <IconClose className="h-6 w-6" /> : <IconMenu className="h-6 w-6" />}
          </button>
          {clientId ? (
            <button
              type="button"
              onClick={() => navigate(paths.clients)}
              className="inline-flex min-w-0 items-center gap-1.5 truncate text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              <span aria-hidden className="text-base leading-none">
                ←
              </span>
              <span className="truncate">Back to Clients</span>
            </button>
          ) : (
            <span className="min-w-0 truncate text-sm font-semibold text-slate-900">Staffing-Go</span>
          )}
        </header>

        <div ref={mainScrollRef} className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain">
          <Outlet />
        </div>
      </div>

      {clientId && !isSalaryChangesPage && pendingSalary.showNotice ? (
        <SalaryChangeNotice
          count={pendingSalary.count}
          onOpen={() => navigate(paths.client(clientId, 'salary-changes'))}
          onDismiss={pendingSalary.dismiss}
        />
      ) : null}

      <ChangeRequestReviewPopups
        listDoj={listSaDoj}
        reviewDoj={reviewSaDoj}
        listJoining={listSaJoining}
        reviewJoining={reviewSaJoining}
        readOnlyWhenRouted
      />
    </div>
  );
}

export default function SuperAdminLayout() {
  return (
    <WorkspaceBasePathProvider basePath="/super-admin">
      <SuperAdminLayoutInner />
    </WorkspaceBasePathProvider>
  );
}
