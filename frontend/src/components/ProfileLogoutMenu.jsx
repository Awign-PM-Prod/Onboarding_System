import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const ROLE_LABEL = {
  PAYROLL_LEAD: 'Payroll Lead',
  PROGRAM_MANAGER: 'Program Manager',
  PAYROLL_HEAD: 'Payroll Head',
  SUPER_ADMIN: 'Super Admin'
};

function initialsFromName(name) {
  if (!name || typeof name !== 'string') return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function IconLogout({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75"
      />
    </svg>
  );
}

/**
 * Profile avatar that opens a logout popup.
 * @param {'dark' | 'light'} variant - dark for sidebar rail, light for top navbar
 * @param {'left' | 'right' | 'center' | 'rail'} align
 *   - light navbar: left | right | center (dropdown below)
 *   - dark sidebar: use "rail" to open beside the avatar (portal + fixed, no clipping)
 */
export default function ProfileLogoutMenu({
  profile,
  user,
  onSignOut,
  variant = 'light',
  align = 'right',
  className = '',
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState(null);
  const rootRef = useRef(null);
  const menuRef = useRef(null);

  const initials = useMemo(
    () => initialsFromName(profile?.name ?? user?.email ?? ''),
    [profile?.name, user?.email]
  );
  const roleLabel = ROLE_LABEL[profile?.role] ?? profile?.role ?? '';
  const displayName = profile?.name ?? 'Profile';
  const isDark = variant === 'dark';
  const isRail = align === 'rail' || (isDark && align === 'center');

  const updateCoords = () => {
    const btn = rootRef.current?.querySelector('button[aria-label="Profile menu"]');
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const menuWidth = 224;
    const gap = 8;

    if (isRail) {
      let left = rect.right + gap;
      if (left + menuWidth > window.innerWidth - 8) {
        left = Math.max(8, rect.left - menuWidth - gap);
      }
      setCoords({
        top: undefined,
        bottom: window.innerHeight - rect.bottom,
        left,
      });
      return;
    }

    let left =
      align === 'left'
        ? rect.left
        : align === 'center'
          ? rect.left + rect.width / 2 - menuWidth / 2
          : rect.right - menuWidth;
    left = Math.min(Math.max(8, left), window.innerWidth - menuWidth - 8);

    // Prefer opening below; flip above when near the bottom of the viewport.
    const estimatedMenuHeight = 148;
    const spaceBelow = window.innerHeight - rect.bottom - gap;
    if (spaceBelow < estimatedMenuHeight) {
      setCoords({
        top: undefined,
        bottom: window.innerHeight - rect.top + gap,
        left,
      });
    } else {
      setCoords({
        top: rect.bottom + gap,
        bottom: undefined,
        left,
      });
    }
  };

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return undefined;
    }
    updateCoords();
    const onReposition = () => updateCoords();
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reposition from open + layout
  }, [open, align, isRail]);

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event) => {
      const inTrigger = rootRef.current?.contains(event.target);
      const inMenu = menuRef.current?.contains(event.target);
      if (!inTrigger && !inMenu) setOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const handleLogout = async () => {
    setOpen(false);
    await onSignOut?.();
  };

  const menu = open && coords && typeof document !== 'undefined'
    ? createPortal(
        <div
          ref={menuRef}
          role="menu"
          style={{
            position: 'fixed',
            top: coords.top,
            bottom: coords.bottom,
            left: coords.left,
            width: 224,
            zIndex: 200,
          }}
          className={`overflow-hidden rounded-xl border shadow-xl ${
            isDark ? 'border-slate-700/80 bg-[#1e2438]' : 'border-slate-200 bg-white'
          }`}
        >
          <div className={`px-3 py-3 ${isDark ? '' : 'bg-slate-50/80'}`}>
            <p
              className={`truncate text-sm font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}
              title={displayName}
            >
              {displayName}
            </p>
            {user?.email && (
              <p className={`mt-0.5 truncate text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                {user.email}
              </p>
            )}
            {roleLabel && (
              <p className={`mt-1 truncate text-[11px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                {roleLabel}
              </p>
            )}
          </div>
          <div className={isDark ? 'border-t border-white/10' : 'border-t border-slate-100'} aria-hidden />
          <button
            type="button"
            role="menuitem"
            onClick={handleLogout}
            className={
              isDark
                ? 'flex w-full items-center gap-2 px-3 py-2.5 text-sm font-medium text-rose-400 transition hover:bg-white/5'
                : 'flex w-full items-center gap-2 px-3 py-2.5 text-sm font-medium text-rose-600 transition hover:bg-rose-50'
            }
          >
            <IconLogout className="h-4 w-4 shrink-0" />
            Logout
          </button>
        </div>,
        document.body
      )
    : null;

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={
          isDark
            ? 'mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-indigo-500 text-xs font-semibold text-white ring-2 ring-indigo-400/30 transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-300'
            : 'flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-xs font-semibold text-white shadow-sm ring-2 ring-indigo-100 transition hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400'
        }
        aria-label="Profile menu"
        aria-expanded={open}
        aria-haspopup="menu"
        title={displayName}
      >
        {initials}
      </button>
      {menu}
    </div>
  );
}
