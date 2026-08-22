import { NavLink, useNavigate } from 'react-router-dom';
import { SidebarCollapseToggle } from './CollapsibleAppSidebar';
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

function IconArrowLeft({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
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

function RailItem({ item, onNavigate, labeled = false }) {
  const { to, label, active, icon, onClick } = item;
  const className = labeled ? panelItemClass(active) : railItemClass(active);
  const body = (
    <>
      <span className={`flex shrink-0 items-center justify-center ${labeled ? 'h-5 w-5' : 'h-6 w-6'}`}>
        {icon}
      </span>
      {labeled && <span className="truncate">{label}</span>}
    </>
  );

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
            <IconArrowLeft className="h-3.5 w-3.5 shrink-0" />
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
              className={`relative flex shrink-0 items-center justify-center ${
                collapsed ? 'h-6 w-6' : 'h-5 w-5'
              }`}
            >
              {item.icon}
              {collapsed && item.badge ? (
                <span className="absolute -right-1.5 -top-1.5 min-w-[1rem] rounded-full bg-amber-400 px-1 text-center text-[10px] font-semibold leading-4 text-slate-900">
                  {item.badge}
                </span>
              ) : null}
            </span>
            {!collapsed && <span className="min-w-0 truncate">{item.label}</span>}
            {!collapsed && item.badge ? (
              <span className="ml-auto rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-slate-900">
                {item.badge}
              </span>
            ) : null}
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
  onNavigate,
  /** Mobile drawer: show labeled nav instead of icon-only rail */
  labeledRail = false
}) {
  const visible = typeof panelVisible === 'boolean' ? panelVisible : Boolean(panelOpen);
  const expanded = visible && (typeof panelExpanded === 'boolean' ? panelExpanded : Boolean(panelOpen));
  const collapsed = visible && !expanded;

  const handleNav = () => {
    onNavigate?.();
  };

  const resolvedPanel = typeof panel === 'function' ? panel(collapsed) : panel;

  return (
    <div
      className={`relative flex h-full min-h-0 max-h-screen overflow-visible bg-[#1a1f3a] ${
        labeledRail ? 'w-72 flex-col' : ''
      }`}
    >
      {/* Icon rail (or labeled rail in mobile drawer) */}
      <div
        className={`flex min-h-0 shrink-0 flex-col overflow-visible ${
          labeledRail ? 'w-full' : 'h-full w-[4.5rem]'
        } ${labeledRail && visible ? 'max-h-[45%]' : labeledRail ? 'h-full' : 'h-full'}`}
      >
        <div
          className={`flex shrink-0 items-center ${
            labeledRail ? 'gap-3 px-4 pb-3 pt-5' : 'justify-center px-2 pb-3 pt-5'
          }`}
        >
          <NavLink
            to={homeTo}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white transition-opacity hover:opacity-80"
            aria-label="Home"
            title="Staffing-Go"
            onClick={handleNav}
          >
            <IconLogo className="h-9 w-9" />
          </NavLink>
          {labeledRail && (
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">Staffing-Go</p>
            </div>
          )}
        </div>

        <nav
          className={`flex min-h-0 flex-1 flex-col items-stretch gap-1.5 overflow-x-hidden overflow-y-auto py-2 ${
            labeledRail ? 'px-3' : 'px-2'
          }`}
          aria-label="Modules"
        >
          {railItems.map((item) => (
            <RailItem key={item.id} item={item} onNavigate={handleNav} labeled={labeledRail} />
          ))}
        </nav>

        {(!labeledRail || !visible) && (
          <div
            className={`relative z-20 shrink-0 overflow-visible border-t border-white/10 py-3 ${
              labeledRail ? 'px-3' : 'px-2'
            }`}
          >
            <ProfileLogoutMenu
              profile={profile}
              user={user}
              onSignOut={onSignOut}
              variant="dark"
              align={labeledRail ? 'left' : 'rail'}
              className={labeledRail ? '' : 'flex justify-center'}
            />
          </div>
        )}
      </div>

      {/* Desktop contextual panel */}
      {!labeledRail && (
        <div
          className={`relative h-full min-h-0 overflow-hidden border-l border-white/10 transition-[width] duration-200 ease-out ${
            !visible ? 'w-0 border-l-0' : expanded ? 'w-64' : 'w-[4.5rem]'
          }`}
        >
          <div className={`h-full overflow-hidden ${expanded ? 'w-64' : 'w-[4.5rem]'}`}>
            {resolvedPanel}
          </div>
        </div>
      )}

      {/* Mobile drawer: client modules stacked under labeled rail */}
      {labeledRail && visible && (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-t border-white/10">
          <div className="min-h-0 flex-1 overflow-y-auto">{typeof panel === 'function' ? panel(false) : panel}</div>
          <div className="relative z-20 shrink-0 border-t border-white/10 px-3 py-3">
            <ProfileLogoutMenu
              profile={profile}
              user={user}
              onSignOut={onSignOut}
              variant="dark"
              align="left"
            />
          </div>
        </div>
      )}

      {/* Outer-edge collapse control — desktop only */}
      {!labeledRail && visible && onPanelExpandedChange && (
        <SidebarCollapseToggle
          collapsed={collapsed}
          onToggle={() => onPanelExpandedChange(!expanded)}
        />
      )}
    </div>
  );
}
