/** @returns {'android' | 'ios' | 'other'} */
export function detectMobileOs() {
  if (typeof navigator === 'undefined') return 'other';

  const ua = navigator.userAgent || '';
  if (/android/i.test(ua)) return 'android';
  if (/iPad|iPhone|iPod/i.test(ua)) return 'ios';
  if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) return 'ios';

  return 'other';
}
