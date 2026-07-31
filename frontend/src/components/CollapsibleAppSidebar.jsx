import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';

const ROLE_LABEL = {
  PAYROLL_LEAD: 'Payroll Lead',
  PROGRAM_MANAGER: 'Program Manager',
  PAYROLL_HEAD: 'Payroll Head'
};

const STORAGE_KEY = 'obs.sidebar.collapsed';

export function initialsFromName(name) {
  if (!name || typeof name !== 'string') return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function IconDashboard({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 8.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"
      />
    </svg>
  );
}

export function IconClients({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
      />
    </svg>
  );
}

export function IconOnboarding({ className, filled = false }) {
  if (filled) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M12 12a4 4 0 100-8 4 4 0 000 8zm-7 9a7 7 0 1114 0H5z" />
      </svg>
    );
  }
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
      />
    </svg>
  );
}

export function IconSettings({ className }) {
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

export function IconLogout({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8.25 9V5.25A2.25 2.25 0 0110.5 3h9a2.25 2.25 0 012.25 2.25v13.5A2.25 2.25 0 0119.5 21h-9a2.25 2.25 0 01-2.25-2.25V15m-3 0l3-3m0 0l3 3m-3-3H3.75"
      />
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

function itemClass(collapsed, active) {
  if (collapsed) {
    return `flex w-full items-center justify-center rounded-xl px-1 py-2.5 transition-colors ${
      active
        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/25'
        : 'text-slate-300 hover:bg-white/10 hover:text-white'
    }`;
  }
  return `flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
    active
      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/25'
      : 'text-slate-300 hover:bg-white/10 hover:text-white'
  }`;
}

function NavItem({ item, collapsed, onNavigate }) {
  const { to, label, active, icon, onClick } = item;
  const className = itemClass(collapsed, active);
  const body = (
    <>
      <span className={`flex shrink-0 items-center justify-center ${collapsed ? 'h-6 w-6' : 'h-5 w-5'}`}>
        {icon}
      </span>
      {!collapsed && <span className="truncate">{label}</span>}
    </>
  );

  if (to) {
    return (
      <NavLink to={to} className={className} aria-label={label} title={label} onClick={onNavigate}>
        {body}
      </NavLink>
    );
  }

  return (
    <button
      type="button"
      className={className}
      aria-label={label}
      title={label}
      onClick={onClick ?? onNavigate}
    >
      {body}
    </button>
  );
}

export function SidebarBackLink({ to, label = 'Back', onClick, collapsed }) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      aria-label={label}
      title={label}
      className={itemClass(collapsed, false)}
    >
      <span className={`flex shrink-0 items-center justify-center ${collapsed ? 'h-6 w-6' : 'h-5 w-5'}`}>
        <IconChevronLeft className="h-5 w-5" />
      </span>
      {!collapsed && <span className="truncate">{label}</span>}
    </NavLink>
  );
}

/** Edge-mounted circular collapse control shared across layouts. */
export function SidebarCollapseToggle({ collapsed, onToggle, className = '' }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`pointer-events-auto absolute right-0 top-8 z-50 hidden h-8 w-8 translate-x-1/2 items-center justify-center rounded-full border border-white/30 bg-[#1a1f3a] text-white shadow-[0_2px_8px_rgba(0,0,0,0.35)] transition hover:bg-[#252b4a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-300 lg:flex ${className}`.trim()}
      aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      title={collapsed ? 'Expand menu' : 'Collapse menu'}
    >
      <IconChevronLeft
        className={`h-4 w-4 transition-transform duration-200 ${collapsed ? 'rotate-180' : ''}`}
      />
    </button>
  );
}

export function readSidebarCollapsed() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeSidebarCollapsed(collapsed) {
  try {
    localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0');
  } catch {
    /* ignore */
  }
}

/**
 * Collapsible dark sidebar for Program Manager / Payroll Lead.
 * `topSlot` may be a node or `(collapsed) => node`.
 * Pass `collapsed` + `onCollapsedChange` from the layout so desktop/mobile share state.
 */
export default function CollapsibleAppSidebar({
  homeTo = '/',
  items = [],
  topSlot = null,
  profile,
  user,
  onSignOut,
  onNavigate,
  showCollapseToggle = false,
  collapsed: collapsedProp,
  onCollapsedChange
}) {
  const [internalCollapsed, setInternalCollapsed] = useState(readSidebarCollapsed);
  const collapsed = typeof collapsedProp === 'boolean' ? collapsedProp : internalCollapsed;

  const setCollapsed = (next) => {
    const value = typeof next === 'function' ? next(collapsed) : next;
    if (onCollapsedChange) onCollapsedChange(value);
    else setInternalCollapsed(value);
    writeSidebarCollapsed(value);
  };

  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef(null);

  const initials = useMemo(
    () => initialsFromName(profile?.name ?? user?.email ?? ''),
    [profile?.name, user?.email]
  );

  const roleLabel = ROLE_LABEL[profile?.role] ?? profile?.role ?? '';
  const resolvedTopSlot = typeof topSlot === 'function' ? topSlot(collapsed) : topSlot;

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

  useEffect(() => {
    if (!collapsed) setSettingsOpen(false);
  }, [collapsed]);

  const handleNav = () => {
    setSettingsOpen(false);
    onNavigate?.();
  };

  return (
    <div
      className={`relative flex h-full min-h-0 flex-col bg-[#1a1f3a] transition-[width] duration-200 ease-out ${
        collapsed ? 'w-[4.5rem]' : 'w-64'
      }`}
    >
      {showCollapseToggle && (
        <SidebarCollapseToggle
          collapsed={collapsed}
          onToggle={() => setCollapsed((v) => !v)}
        />
      )}

      <div
        className={`flex shrink-0 items-center ${
          collapsed ? 'justify-center px-2 pb-3 pt-5' : 'gap-3 px-4 pb-4 pt-5'
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
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">Staffing-Go</p>
            <p className="truncate text-[11px] text-slate-400">Workforce Suite</p>
          </div>
        )}
      </div>

      <nav
        className={`flex min-h-0 flex-1 flex-col gap-1.5 overflow-x-hidden overflow-y-auto py-2 ${
          collapsed ? 'items-stretch px-2' : 'px-3'
        }`}
        aria-label="Modules"
      >
        {resolvedTopSlot}
        {items.map((item) => (
          <NavItem key={item.id} item={item} collapsed={collapsed} onNavigate={handleNav} />
        ))}
      </nav>

      <div
        ref={settingsRef}
        className={`relative z-20 shrink-0 border-t border-white/10 ${collapsed ? 'px-2 py-3' : 'px-3 py-4'}`}
      >
        {settingsOpen && !collapsed && (
          <div className="absolute bottom-full left-3 right-3 mb-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-xs text-slate-300 shadow-xl">
            <p className="truncate font-medium text-white">{profile?.name}</p>
            <p className="mt-0.5 truncate text-slate-400">{user?.email}</p>
            <p className="mt-1 text-slate-500">{roleLabel}</p>
            <button
              type="button"
              onClick={onSignOut}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-600 px-2 py-2 text-xs font-medium text-slate-200 hover:border-red-500/50 hover:bg-red-950/40 hover:text-red-100"
            >
              <IconLogout className="h-4 w-4" />
              Log out
            </button>
          </div>
        )}

        {collapsed ? (
          <div className="flex flex-col items-stretch gap-2">
            {settingsOpen && (
              <div className="overflow-hidden rounded-lg border border-slate-700/80 bg-[#1e2438] shadow-lg">
                <div className="px-2 py-2">
                  <p className="truncate text-center text-[11px] font-semibold text-white" title={profile?.name ?? 'Profile'}>
                    {profile?.name ?? 'Profile'}
                  </p>
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
              className={itemClass(true, settingsOpen)}
              aria-label="Settings"
              aria-expanded={settingsOpen}
              title="Settings"
            >
              <IconSettings className="h-5 w-5" />
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-3 rounded-xl px-1 py-1">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-500 text-xs font-semibold text-white">
                {initials}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">{profile?.name ?? 'Profile'}</p>
                <p className="truncate text-xs text-slate-400">{roleLabel}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSettingsOpen((v) => !v)}
              className={itemClass(false, settingsOpen)}
            >
              <IconSettings className="h-5 w-5" />
              Settings
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export { ROLE_LABEL };
