import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Z_MODAL } from '../lib/zIndex';

/**
 * Full-viewport modal shell rendered via portal on document.body so overlays
 * always sit above sticky headers and scroll containers.
 */
export default function ModalOverlay({
  children,
  onClose,
  align = 'center',
  backdropClassName = 'bg-slate-900/40',
  className = '',
  zIndex = Z_MODAL,
}) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    if (!onClose) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const alignClass =
    align === 'bottom'
      ? 'place-items-end sm:place-items-center'
      : align === 'right'
        ? 'place-items-center justify-items-end'
        : 'place-items-center';

  return createPortal(
    <div
      className={`fixed inset-0 grid overflow-y-auto p-4 ${alignClass} ${className}`}
      style={{ zIndex }}
      role="dialog"
      aria-modal="true"
    >
      {onClose && (
        <button
          type="button"
          className={`absolute inset-0 ${backdropClassName}`}
          aria-label="Close dialog"
          onClick={onClose}
        />
      )}
      {!onClose && <div className={`absolute inset-0 ${backdropClassName}`} aria-hidden />}
      <div className="relative z-10 m-auto max-h-[calc(100vh-2rem)] overflow-y-auto">
        {children}
      </div>
    </div>,
    document.body
  );
}
