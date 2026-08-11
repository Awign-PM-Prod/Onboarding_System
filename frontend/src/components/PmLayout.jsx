import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { matchPmClientDetailPath, pmClientTabUrl } from '../lib/pmClientRoutes';
import { api } from '../lib/api';
import {
  IconClients,
  IconDashboard,
  IconOnboarding
} from './CollapsibleAppSidebar';
import TwoPaneSidebar, {
  SidebarModulesPanel,
  writeSidebarPanelOpen
} from './TwoPaneSidebar';
import ModalOverlay from './ModalOverlay';

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

function IconBulkAlerts({ className }) {
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

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function JoiningStatusReminderModal({
  title,
  rows: initialRows,
  bucket,
  onClose,
  onNext,
  onRefresh,
}) {
  const [rows, setRows] = useState(() =>
    (initialRows ?? []).map((r) => ({
      ...r,
      employees: Array.isArray(r.employees) ? r.employees : [],
    }))
  );
  const [empCodes, setEmpCodes] = useState({});
  const [extendReasons, setExtendReasons] = useState({});
  const [busyKey, setBusyKey] = useState('');
  const [actionError, setActionError] = useState('');
  const [expandedClients, setExpandedClients] = useState(() =>
    new Set((initialRows ?? []).map((r) => r.client_id))
  );

  useEffect(() => {
    setRows(
      (initialRows ?? []).map((r) => ({
        ...r,
        employees: Array.isArray(r.employees) ? r.employees : [],
      }))
    );
    setExpandedClients(new Set((initialRows ?? []).map((r) => r.client_id)));
  }, [initialRows]);

  const removeEmployeeLocally = (clientId, employeeId) => {
    setRows((prev) =>
      prev
        .map((clientRow) => {
          if (clientRow.client_id !== clientId) return clientRow;
          const employees = (clientRow.employees ?? []).filter((e) => e.id !== employeeId);
          return {
            ...clientRow,
            employees,
            employee_count: employees.length,
          };
        })
        .filter((clientRow) => (clientRow.employees ?? []).length > 0)
    );
  };

  const markPendingExtendLocally = (clientId, employeeId) => {
    setRows((prev) =>
      prev.map((clientRow) => {
        if (clientRow.client_id !== clientId) return clientRow;
        return {
          ...clientRow,
          employees: (clientRow.employees ?? []).map((e) =>
            e.id === employeeId ? { ...e, doj_extend_request_pending: true } : e
          ),
        };
      })
    );
  };

  const runAction = async (key, fn) => {
    if (busyKey) return;
    setBusyKey(key);
    setActionError('');
    try {
      await fn();
      if (typeof onRefresh === 'function') onRefresh();
    } catch (err) {
      setActionError(err?.message || 'Action failed.');
    } finally {
      setBusyKey('');
    }
  };

  const handleMarkJoined = (clientId, emp) => {
    const empCode = String(empCodes[emp.id] ?? emp.emp_code ?? '').trim();
    if (!empCode) {
      setActionError(`Enter Emp Code for ${emp.name || 'employee'} before marking Joined.`);
      return;
    }
    return runAction(`joined:${emp.id}`, async () => {
      await api.setJoiningStatus({
        clientId,
        employeeId: emp.id,
        joiningStatus: 'JOINED',
        empCode,
      });
      removeEmployeeLocally(clientId, emp.id);
    });
  };

  const handleMarkNotJoined = (clientId, emp) =>
    runAction(`not-joined:${emp.id}`, async () => {
      await api.setJoiningStatus({
        clientId,
        employeeId: emp.id,
        joiningStatus: 'NOT_JOINED',
      });
      removeEmployeeLocally(clientId, emp.id);
    });

  const handleRequestExtend = (clientId, emp) =>
    runAction(`extend:${emp.id}`, async () => {
      await api.requestDojExtend({
        clientId,
        employeeId: emp.id,
        reason: extendReasons[emp.id] || null,
      });
      markPendingExtendLocally(clientId, emp.id);
    });

  const handleExport = (clientId, clientName) =>
    runAction(`export:${clientId}`, async () => {
      const blob = await api.exportPmJoiningStatusReminder({ clientId, bucket });
      const safe = String(clientName || 'client').replace(/[^\w-]+/g, '_').slice(0, 40);
      downloadBlob(blob, `joining-reminder-${bucket}-${safe}.csv`);
    });

  const toggleExpanded = (clientId) => {
    setExpandedClients((prev) => {
      const next = new Set(prev);
      if (next.has(clientId)) next.delete(clientId);
      else next.add(clientId);
      return next;
    });
  };

  return (
    <ModalOverlay onClose={onClose} backdropClassName="bg-slate-900/50">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-xl bg-white p-5 shadow-2xl">
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
        <p className="mt-1 text-sm text-slate-600">
          Mark joining status or request Extend DOJ for each pending employee.
        </p>
        {actionError ? (
          <p className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {actionError}
          </p>
        ) : null}
        <div className="mt-4 min-h-0 flex-1 overflow-y-auto rounded-lg border border-slate-200">
          {rows.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-500">No pending employees left in this reminder.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {rows.map((row) => {
                const expanded = expandedClients.has(row.client_id);
                const employees = row.employees ?? [];
                return (
                  <li key={`${row.client_id}-${row.doj_label}`} className="bg-white">
                    <div className="flex flex-wrap items-center gap-2 px-4 py-3">
                      <button
                        type="button"
                        onClick={() => toggleExpanded(row.client_id)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <p className="font-medium text-slate-900">{row.client_name}</p>
                        <p className="text-xs text-slate-500">
                          {row.doj_label} · {employees.length} employee{employees.length === 1 ? '' : 's'}
                        </p>
                      </button>
                      {employees.length > 1 ? (
                        <button
                          type="button"
                          disabled={Boolean(busyKey)}
                          onClick={() => handleExport(row.client_id, row.client_name)}
                          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        >
                          {busyKey === `export:${row.client_id}` ? 'Exporting…' : 'Export'}
                        </button>
                      ) : null}
                    </div>
                    {expanded ? (
                      <div className="space-y-3 border-t border-slate-100 bg-slate-50/70 px-4 py-3">
                        {employees.map((emp) => {
                          const pendingExtend = Boolean(emp.doj_extend_request_pending);
                          const unlocked = Boolean(emp.doj_extend_unlock);
                          const empBusy =
                            busyKey === `joined:${emp.id}` ||
                            busyKey === `not-joined:${emp.id}` ||
                            busyKey === `extend:${emp.id}`;
                          return (
                            <div
                              key={emp.id}
                              className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
                            >
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="font-medium text-slate-900">{emp.name || 'Employee'}</p>
                                  <p className="text-xs text-slate-500">
                                    DOJ {emp.date_of_joining || '—'}
                                    {emp.mobile ? ` · ${emp.mobile}` : ''}
                                    {emp.reference_id ? ` · ${emp.reference_id}` : ''}
                                  </p>
                                  {pendingExtend ? (
                                    <p className="mt-1 text-xs font-medium text-amber-700">
                                      Extend DOJ request pending
                                    </p>
                                  ) : null}
                                  {unlocked ? (
                                    <p className="mt-1 text-xs font-medium text-amber-700">
                                      DOJ unlocked — set Extended DOJ on the client page
                                    </p>
                                  ) : null}
                                </div>
                              </div>
                              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
                                <div className="min-w-[160px] flex-1">
                                  <label className="mb-1 block text-[11px] font-medium text-slate-600">
                                    Emp Code (for Joined)
                                  </label>
                                  <input
                                    type="text"
                                    value={empCodes[emp.id] ?? emp.emp_code ?? ''}
                                    onChange={(e) =>
                                      setEmpCodes((prev) => ({ ...prev, [emp.id]: e.target.value }))
                                    }
                                    disabled={Boolean(busyKey)}
                                    placeholder="StaffingGo Emp Code"
                                    className="w-full rounded-md border border-slate-300 px-2 py-1.5 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:opacity-60"
                                  />
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  <button
                                    type="button"
                                    disabled={Boolean(busyKey)}
                                    onClick={() => handleMarkJoined(row.client_id, emp)}
                                    className="rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                                  >
                                    {busyKey === `joined:${emp.id}` ? 'Saving…' : 'Mark Joined'}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={Boolean(busyKey)}
                                    onClick={() => handleMarkNotJoined(row.client_id, emp)}
                                    className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                                  >
                                    {busyKey === `not-joined:${emp.id}` ? 'Saving…' : 'Not Joined'}
                                  </button>
                                </div>
                              </div>
                              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
                                <div className="min-w-0 flex-1">
                                  <label className="mb-1 block text-[11px] font-medium text-slate-600">
                                    Extend DOJ reason (optional)
                                  </label>
                                  <input
                                    type="text"
                                    value={extendReasons[emp.id] ?? ''}
                                    onChange={(e) =>
                                      setExtendReasons((prev) => ({
                                        ...prev,
                                        [emp.id]: e.target.value,
                                      }))
                                    }
                                    disabled={Boolean(busyKey) || pendingExtend || unlocked}
                                    placeholder="Why extend DOJ?"
                                    className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:opacity-60"
                                  />
                                </div>
                                <button
                                  type="button"
                                  disabled={Boolean(busyKey) || pendingExtend || unlocked}
                                  onClick={() => handleRequestExtend(row.client_id, emp)}
                                  className="rounded-md bg-amber-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {busyKey === `extend:${emp.id}`
                                    ? 'Sending…'
                                    : pendingExtend
                                      ? 'Request pending'
                                      : 'Request Extend DOJ'}
                                </button>
                              </div>
                              {empBusy ? (
                                <p className="mt-2 text-[11px] text-slate-500">Working…</p>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
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
    </ModalOverlay>
  );
}

export default function PmLayout() {
  const { profile, user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [clients, setClients] = useState([]);
  const [joiningReminderWithin, setJoiningReminderWithin] = useState([]);
  const [joiningReminderOverdue, setJoiningReminderOverdue] = useState([]);
  const [joiningReminderStep, setJoiningReminderStep] = useState('');
  const [dojDecisionUpdates, setDojDecisionUpdates] = useState([]);
  const [dojDecisionAcking, setDojDecisionAcking] = useState(false);
  const joiningReminderDismissedRef = useRef(false);
  const mainScrollRef = useRef(null);

  const pathname = location.pathname;
  const clientRoute = useMemo(() => matchPmClientDetailPath(pathname), [pathname]);
  const clientId = clientRoute?.clientId ?? null;
  const clientTabSeg = clientRoute?.tabSegment;
  const isClientOnboardingModule = clientTabSeg && clientTabSeg !== 'attendance';
  const isClientAttendanceModule = clientTabSeg === 'attendance';
  const isClientsListPage = pathname === '/pm-dashboard/clients';

  const loadClients = useCallback(async () => {
    try {
      const data = await api.listPmClients();
      setClients(Array.isArray(data) ? data : []);
    } catch {
      setClients([]);
    }
  }, []);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  // Match PL: keep the sidebar fixed and reset the main pane when routes change.
  useEffect(() => {
    mainScrollRef.current?.scrollTo({ top: 0, left: 0 });
  }, [pathname]);

  const setPanelOpenPersist = (open) => {
    setPanelOpen(open);
    writeSidebarPanelOpen(open);
  };

  // Second sidebar (modules) only while a client workspace is open.
  useEffect(() => {
    if (clientId) {
      setPanelOpen(true);
      writeSidebarPanelOpen(true);
    } else {
      setPanelOpen(false);
      writeSidebarPanelOpen(false);
    }
  }, [clientId]);

  const joiningReminderLoadRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    const loadJoiningReminders = async () => {
      try {
        const payload = await api.getPmJoiningStatusReminders();
        if (cancelled) return;
        const withinRows = Array.isArray(payload?.within_2_days)
          ? payload.within_2_days
          : Array.isArray(payload?.today)
            ? payload.today
            : [];
        const overdueRows = Array.isArray(payload?.overdue) ? payload.overdue : [];
        setJoiningReminderWithin(withinRows);
        setJoiningReminderOverdue(overdueRows);
        if (!joiningReminderDismissedRef.current) {
          if (withinRows.length > 0) setJoiningReminderStep('within');
          else if (overdueRows.length > 0) setJoiningReminderStep('overdue');
          else setJoiningReminderStep('');
        } else if (withinRows.length === 0 && overdueRows.length === 0) {
          joiningReminderDismissedRef.current = false;
          setJoiningReminderStep('');
        }
      } catch {
        // Non-blocking: PM navigation should continue even if reminder fetch fails.
      }
    };
    joiningReminderLoadRef.current = loadJoiningReminders;

    const loadDojDecisionUpdates = async () => {
      try {
        const payload = await api.getPmDojExtendRequestUpdates();
        if (cancelled) return;
        const updates = Array.isArray(payload?.updates) ? payload.updates : [];
        setDojDecisionUpdates(updates);
      } catch {
        // Non-blocking
      }
    };

    const refreshAll = () => {
      loadJoiningReminders();
      loadDojDecisionUpdates();
    };

    refreshAll();
    const onFocus = () => refreshAll();
    window.addEventListener('focus', onFocus);
    const intervalId = window.setInterval(refreshAll, 90_000);

    return () => {
      cancelled = true;
      window.removeEventListener('focus', onFocus);
      window.clearInterval(intervalId);
    };
  }, [pathname]);

  const refreshJoiningReminders = useCallback(() => {
    joiningReminderLoadRef.current?.();
  }, []);

  const dismissJoiningReminder = () => {
    joiningReminderDismissedRef.current = true;
    setJoiningReminderStep('');
    refreshJoiningReminders();
  };

  const ackDojDecisions = async () => {
    if (dojDecisionUpdates.length === 0) return;
    setDojDecisionAcking(true);
    try {
      await api.ackPmDojExtendRequestUpdates(dojDecisionUpdates.map((u) => u.id));
      setDojDecisionUpdates([]);
    } catch {
      // Keep modal open so PM can retry
    } finally {
      setDojDecisionAcking(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  const clientsRailActive = Boolean(clientId) || isClientsListPage;

  const railItems = [
    {
      id: 'dashboard',
      to: '/pm-dashboard/dashboard',
      label: 'Dashboard',
      active: pathname === '/pm-dashboard/dashboard',
      icon: <IconDashboard className="h-full w-full" />,
      onClick: () => setPanelOpenPersist(false)
    },
    {
      id: 'clients',
      to: '/pm-dashboard/clients',
      label: 'Clients',
      active: clientsRailActive,
      icon: <IconClients className="h-full w-full" />,
      onClick: () => setPanelOpenPersist(false)
    },
    {
      id: 'bulk-alerts',
      to: '/pm-dashboard/bulk-alerts',
      label: 'Bulk Alerts',
      active: pathname.startsWith('/pm-dashboard/bulk-alerts'),
      icon: <IconBulkAlerts className="h-full w-full" />,
      onClick: () => setPanelOpenPersist(false)
    }
  ];

  const moduleItems = clientId
    ? [
        {
          id: 'onboarding',
          to: pmClientTabUrl(clientId, 'client_dashboard'),
          label: 'Onboarding',
          active: isClientOnboardingModule,
          icon: <IconOnboarding className="h-full w-full" filled={isClientOnboardingModule} />
        },
        {
          id: 'attendance',
          to: pmClientTabUrl(clientId, 'attendance'),
          label: 'Attendance',
          active: isClientAttendanceModule,
          icon: <IconCalendar className="h-full w-full" />
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
          navigate('/pm-dashboard/clients');
          setPanelOpenPersist(false);
          closeDrawer?.();
        }}
        onNavigate={closeDrawer}
      />
    );
  };

  const renderSidebar = ({ forceExpanded = false, labeledRail = false } = {}) => (
    <TwoPaneSidebar
      homeTo="/pm-dashboard/dashboard"
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
              onClick={() => navigate('/pm-dashboard/clients')}
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

      {dojDecisionUpdates.length > 0 && (
        <ModalOverlay onClose={ackDojDecisions} backdropClassName="bg-slate-900/50">
          <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-2xl">
            <h3 className="text-lg font-semibold text-slate-900">Extend DOJ request update</h3>
            <p className="mt-1 text-sm text-slate-600">
              Super Admin responded to your Extend DOJ request(s).
            </p>
            <ul className="mt-4 max-h-64 space-y-3 overflow-y-auto">
              {dojDecisionUpdates.map((u) => (
                <li key={u.id} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <p className="font-medium text-slate-900">
                    {u.employee_name} · {u.client_name}
                  </p>
                  <p className="mt-0.5 text-slate-700">
                    {u.status === 'APPROVED'
                      ? 'Approved — you can edit Extended DOJ once for this employee.'
                      : 'Rejected — DOJ remains locked for this employee.'}
                  </p>
                  {u.review_note ? (
                    <p className="mt-1 text-slate-500">Note: {u.review_note}</p>
                  ) : null}
                </li>
              ))}
            </ul>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={ackDojDecisions}
                disabled={dojDecisionAcking}
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {dojDecisionAcking ? 'Saving…' : 'Got it'}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {dojDecisionUpdates.length === 0 && joiningReminderStep === 'within' && joiningReminderWithin.length > 0 && (
        <JoiningStatusReminderModal
          title="Joining Status Update Reminder (Within 2 working days of DOJ)"
          rows={joiningReminderWithin}
          bucket="within_2_days"
          onClose={dismissJoiningReminder}
          onRefresh={refreshJoiningReminders}
          onNext={joiningReminderOverdue.length > 0 ? () => setJoiningReminderStep('overdue') : null}
        />
      )}
      {dojDecisionUpdates.length === 0 && joiningReminderStep === 'overdue' && joiningReminderOverdue.length > 0 && (
        <JoiningStatusReminderModal
          title="Joining Status Update Reminder (DOJ - Overdue)"
          rows={joiningReminderOverdue}
          bucket="overdue"
          onClose={dismissJoiningReminder}
          onRefresh={refreshJoiningReminders}
          onNext={null}
        />
      )}
    </div>
  );
}
