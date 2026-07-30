import { NavLink, useNavigate } from 'react-router-dom';
import ProfileLogoutMenu from './ProfileLogoutMenu';

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
 * When `collapsed`, shows icons only (narrow rail) like the primary sidebar.
 */
export function SidebarModulesPanel({
  clientName,
  items = [],
  onShowClients,
  onNavigate,
  collapsed = false
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={`shrink-0 pb-3 pt-5 ${collapsed ? 'px-2' : 'px-3'}`}>
        {onShowClients && (
          <button
            type="button"
            onClick={onShowClients}
            className={`mb-2 flex items-center rounded-lg py-1 text-[11px] font-medium text-slate-400 transition hover:text-white ${
              collapsed ? 'w-full justify-center px-1' : 'gap-1.5 px-1'
            }`}
            title="Back to Clients"
            aria-label="Back to Clients"
          >
            <IconChevronLeft className="h-3.5 w-3.5 shrink-0" />
            {!collapsed && 'Back to Clients'}
          </button>
        )}
        <p
          className={`truncate font-semibold text-white ${
            collapsed ? 'px-0 text-center text-[11px]' : 'px-1 text-sm'
          }`}
          title={clientName}
        >
          {clientName}
        </p>
      </div>

      <nav
        className={`flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto overscroll-y-contain pb-4 ${
          collapsed ? 'px-2' : 'px-3'
        }`}
        aria-label="Client modules"
      >
        {items.map((item) => (
          <NavLink
            key={item.id}
            to={item.to}
            className={collapsed ? railItemClass(item.active) : panelItemClass(item.active)}
            title={item.label}
            aria-label={item.label}
            onClick={onNavigate}
          >
            <span
              className={`flex shrink-0 items-center justify-center ${
                collapsed ? 'h-6 w-6' : 'h-5 w-5'
              }`}
            >
              {item.icon}
            </span>
            {!collapsed && <span className="truncate">{item.label}</span>}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

/**
 * Two-pane sidebar: a slim icon rail plus a contextual slide-out panel.
 * `railItems`: { id, label, icon, active, to?, onClick? }
 * `panelVisible`: second pane shown (e.g. while on a client route).
 * `panelExpanded`: full labels vs icon-only collapsed rail.
 * `panel`: node or `(collapsed) => node` for the second pane.
 */
export default function TwoPaneSidebar({
  homeTo = '/',
  railItems = [],
  panelVisible = false,
  panelExpanded = true,
  onPanelExpandedChange,
  /** @deprecated use panelVisible + panelExpanded */
  panelOpen,
  panel = null,
  profile,
  user,
  onSignOut,
  onNavigate
}) {
  const visible = typeof panelVisible === 'boolean' ? panelVisible : Boolean(panelOpen);
  const expanded = visible && (typeof panelExpanded === 'boolean' ? panelExpanded : Boolean(panelOpen));
  const collapsed = visible && !expanded;

  const handleNav = () => {
    onNavigate?.();
  };

  const resolvedPanel = typeof panel === 'function' ? panel(collapsed) : panel;

  return (
    <div className="relative flex h-full min-h-0 max-h-screen overflow-visible bg-[#1a1f3a]">
      {/* Icon rail */}
      <div className="flex h-full min-h-0 w-[4.5rem] shrink-0 flex-col overflow-visible">
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

        <div className="relative z-20 shrink-0 overflow-visible border-t border-white/10 px-2 py-3">
          <ProfileLogoutMenu
            profile={profile}
            user={user}
            onSignOut={onSignOut}
            variant="dark"
            align="rail"
            className="flex justify-center"
          />
        </div>
      </div>

      {/* Contextual panel: hidden | icon-collapsed | expanded */}
      <div
        className={`relative h-full min-h-0 overflow-visible border-l border-white/10 transition-[width] duration-200 ease-out ${
          !visible ? 'w-0 border-l-0' : expanded ? 'w-64' : 'w-[4.5rem]'
        }`}
      >
        <div className={`h-full overflow-hidden ${expanded ? 'w-64' : 'w-[4.5rem]'}`}>
          {resolvedPanel}
        </div>

        {visible && onPanelExpandedChange && (
          <button
            type="button"
            onClick={() => onPanelExpandedChange(!expanded)}
            className="absolute -right-3.5 top-8 z-30 hidden h-7 w-7 items-center justify-center rounded-full border border-white/20 bg-[#252b4a] text-slate-200 shadow-md transition hover:bg-[#2f3658] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-300 lg:flex"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand menu' : 'Collapse menu'}
          >
            <IconChevronLeft
              className={`h-3.5 w-3.5 transition-transform duration-200 ${collapsed ? 'rotate-180' : ''}`}
            />
          </button>
        )}
      </div>
    </div>
  );
}
