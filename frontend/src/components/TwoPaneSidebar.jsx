import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  IconLogout,
  IconSettings,
  ROLE_LABEL,
  initialsFromName
} from './CollapsibleAppSidebar';

const PANEL_KEY = 'obs.sidebar.panelOpen';

/** Panel open state persists within the tab session so login always starts collapsed. */
export function readSidebarPanelOpen() {
  try {
    return sessionStorage.getItem(PANEL_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeSidebarPanelOpen(open) {
  try {
    sessionStorage.setItem(PANEL_KEY, open ? '1' : '0');
  } catch {
    /* ignore */
  }
}

function IconLogo({ className }) {
  return (
    <img
      src="/logo.png"
      alt="Staffing-Go logo"
      className={`${className ?? ''} rounded-lg object-contain`}
      draggable={false}
    />
  );
}

function IconChevronLeft({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
    </svg>
  );
}

function IconPlus({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

function railItemClass(active) {
  return `flex w-full items-center justify-center rounded-xl px-1 py-2.5 transition-colors ${
    active
      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/25'
      : 'text-slate-300 hover:bg-white/10 hover:text-white'
  }`;
}

function panelItemClass(active) {
  return `flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
    active
      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/25'
      : 'text-slate-300 hover:bg-white/10 hover:text-white'
  }`;
}

function RailItem({ item, onNavigate }) {
  const { to, label, active, icon, onClick } = item;
  const className = railItemClass(active);
  const body = <span className="flex h-6 w-6 shrink-0 items-center justify-center">{icon}</span>;

  if (to) {
    return (
      <NavLink
        to={to}
        className={className}
        aria-label={label}
        title={label}
        onClick={() => {
          onClick?.();
          onNavigate?.();
        }}
      >
        {body}
      </NavLink>
    );
  }

  return (
    <button type="button" className={className} aria-label={label} title={label} onClick={onClick}>
      {body}
    </button>
  );
}

/**
 * Contextual panel content: list of clients with an optional top action (e.g. Add Client).
 */
export function SidebarClientsPanel({
  title = 'Clients',
  subtitle = 'Select a client to open it.',
  clients = [],
  loading = false,
  error = null,
  onRetry,
  activeClientId = null,
  clientLink,
  addClientTo = null,
  onNavigate,
  onClientSelect
}) {
  const navigate = useNavigate();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 px-4 pb-3 pt-5">
        <p className="text-sm font-semibold text-white">{title}</p>
        <p className="mt-0.5 text-[11px] text-slate-400">{subtitle}</p>
      </div>

      {addClientTo && (
        <div className="shrink-0 px-3 pb-3">
          <NavLink
            to={addClientTo}
            onClick={onNavigate}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-3 py-2.5 text-sm font-medium text-white shadow-md shadow-indigo-900/25 transition hover:bg-indigo-500"
          >
            <IconPlus className="h-4 w-4 shrink-0" />
            Add Client
          </NavLink>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3 pb-4">
        {loading && <p className="px-3 py-2 text-sm text-slate-400">Loading clients...</p>}

        {error && !loading && (
          <div className="rounded-xl border border-red-400/30 bg-red-950/30 px-3 py-3 text-xs text-red-200">
            <p>{error}</p>
            {onRetry && (
              <button type="button" onClick={onRetry} className="mt-2 font-medium underline">
                Retry
              </button>
            )}
          </div>
        )}

        {!loading && !error && clients.length === 0 && (
          <p className="px-3 py-2 text-sm text-slate-400">No clients yet.</p>
        )}

        {!loading && !error && clients.length > 0 && (
          <nav className="flex flex-col gap-1.5" aria-label="Clients">
            {clients.map((client) => {
              const active = String(client.id) === String(activeClientId ?? '');
              const to = clientLink(client);
              return (
                <NavLink
                  key={client.id}
                  to={to}
                  onClick={(event) => {
                    // Always open the client modules panel, even when already on this
                    // client's URL (NavLink would otherwise be a same-route no-op).
                    event.preventDefault();
                    onClientSelect?.(client);
                    navigate(to);
                    onNavigate?.();
                  }}
                  className={panelItemClass(active)}
                  title={client.client_name}
                >
                  <span className="min-w-0">
                    <span className="block truncate">{client.client_name}</span>
                    {client.contract_code && (
                      <span className={`block truncate text-[11px] font-normal ${active ? 'text-indigo-200' : 'text-slate-500'}`}>
                        {client.contract_code}
                      </span>
                    )}
                  </span>
                </NavLink>
              );
            })}
          </nav>
        )}
      </div>
    </div>
  );
}

/**
 * Contextual panel content: modules of the currently opened client.
 */
export function SidebarModulesPanel({ clientName, items = [], onShowClients, onNavigate }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 px-3 pb-3 pt-5">
        {onShowClients && (
          <button
            type="button"
            onClick={onShowClients}
            className="mb-2 flex items-center gap-1.5 rounded-lg px-1 py-1 text-[11px] font-medium text-slate-400 transition hover:text-white"
          >
            <IconChevronLeft className="h-3.5 w-3.5 shrink-0" />
            All Clients
          </button>
        )}
        <p className="truncate px-1 text-sm font-semibold text-white" title={clientName}>
          {clientName}
        </p>
      </div>

      <nav className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto overscroll-y-contain px-3 pb-4" aria-label="Client modules">
        {items.map((item) => (
          <NavLink
            key={item.id}
            to={item.to}
            className={panelItemClass(item.active)}
            title={item.label}
            onClick={onNavigate}
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center">{item.icon}</span>
            <span className="truncate">{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

/**
 * Two-pane sidebar: a slim icon rail plus a contextual slide-out panel.
 * `railItems`: { id, label, icon, active, to?, onClick? }
 * `panel`: node rendered inside the second pane when `panelOpen` is true.
 */
export default function TwoPaneSidebar({
  homeTo = '/',
  railItems = [],
  panelOpen = false,
  panel = null,
  profile,
  user,
  onSignOut,
  onNavigate
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef(null);

  const initials = useMemo(
    () => initialsFromName(profile?.name ?? user?.email ?? ''),
    [profile?.name, user?.email]
  );

  const roleLabel = ROLE_LABEL[profile?.role] ?? profile?.role ?? '';

  useEffect(() => {
    if (!settingsOpen) return undefined;

    const handlePointerDown = (event) => {
      if (settingsRef.current && !settingsRef.current.contains(event.target)) {
        setSettingsOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setSettingsOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [settingsOpen]);

  const handleNav = () => {
    setSettingsOpen(false);
    onNavigate?.();
  };

  return (
    <div className="flex h-full min-h-0 max-h-screen bg-[#1a1f3a]">
      {/* Icon rail */}
      <div className="flex h-full min-h-0 w-[4.5rem] shrink-0 flex-col">
        <div className="flex shrink-0 items-center justify-center px-2 pb-3 pt-5">
          <NavLink
            to={homeTo}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white transition-opacity hover:opacity-80"
            aria-label="Home"
            title="Staffing-Go"
            onClick={handleNav}
          >
            <IconLogo className="h-9 w-9" />
          </NavLink>
        </div>

        <nav
          className="flex min-h-0 flex-1 flex-col items-stretch gap-1.5 overflow-x-hidden overflow-y-auto px-2 py-2"
          aria-label="Modules"
        >
          {railItems.map((item) => (
            <RailItem key={item.id} item={item} onNavigate={handleNav} />
          ))}
        </nav>

        <div ref={settingsRef} className="relative z-20 shrink-0 border-t border-white/10 px-2 py-3">
          <div className="flex flex-col items-stretch gap-2">
            {settingsOpen && (
              <div className="overflow-hidden rounded-lg border border-slate-700/80 bg-[#1e2438] shadow-lg">
                <div className="px-2 py-2">
                  <p
                    className="truncate text-center text-[11px] font-semibold text-white"
                    title={profile?.name ?? 'Profile'}
                  >
                    {profile?.name ?? 'Profile'}
                  </p>
                  {roleLabel && (
                    <p className="mt-0.5 truncate text-center text-[10px] text-slate-400">{roleLabel}</p>
                  )}
                </div>
                <div className="border-t border-white/10" aria-hidden />
                <button
                  type="button"
                  onClick={onSignOut}
                  className="flex w-full items-center justify-center gap-1.5 px-2 py-2.5 text-[11px] font-medium text-rose-400 transition hover:bg-white/5"
                >
                  <IconLogout className="h-4 w-4 shrink-0" />
                  Logout
                </button>
              </div>
            )}
            <span
              className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-indigo-500 text-xs font-semibold text-white ring-2 ring-indigo-400/30"
              aria-hidden
            >
              {initials}
            </span>
            <button
              type="button"
              onClick={() => setSettingsOpen((v) => !v)}
              className={railItemClass(settingsOpen)}
              aria-label="Settings"
              aria-expanded={settingsOpen}
              title="Settings"
            >
              <IconSettings className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Contextual panel */}
      <div
        className={`h-full min-h-0 overflow-hidden border-l border-white/10 transition-[width] duration-200 ease-out ${
          panelOpen ? 'w-64' : 'w-0 border-l-0'
        }`}
      >
        <div className="h-full w-64">{panel}</div>
      </div>
    </div>
  );
}
