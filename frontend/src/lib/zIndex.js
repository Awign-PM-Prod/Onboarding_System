/** Centralized z-index scale to avoid overlay / sticky-header conflicts. */

export const Z_STICKY_HEADER = 60;
export const Z_SIDEBAR = 50;
export const Z_MODAL = 200;
export const Z_TOAST = 210;

export function isModalAboveStickyHeader(modalZIndex = Z_MODAL) {
  return modalZIndex > Z_STICKY_HEADER;
}
