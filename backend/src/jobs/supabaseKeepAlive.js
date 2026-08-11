import { supabaseAdmin } from '../supabase.js';

const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const BOOT_DELAY_MS = 5_000;

function isEnabled() {
  const raw = process.env.SUPABASE_KEEPALIVE_ENABLED;
  if (raw == null || String(raw).trim() === '') return true;
  return !['0', 'false', 'no', 'off'].includes(String(raw).trim().toLowerCase());
}

function intervalMs() {
  const parsed = Number(process.env.SUPABASE_KEEPALIVE_MS);
  if (Number.isFinite(parsed) && parsed >= 60_000) return parsed;
  return DEFAULT_INTERVAL_MS;
}

async function ping() {
  try {
    const { error } = await supabaseAdmin.from('clients').select('id').limit(1);
    if (error) {
      console.error('[supabase-keepalive] ping failed:', error.message || error);
      return;
    }
    console.log('[supabase-keepalive] ok');
  } catch (err) {
    console.error('[supabase-keepalive] ping failed:', err?.message || err);
  }
}

/**
 * External daily ping so Free-tier Supabase projects do not pause from inactivity.
 * Safe to call once at API boot; never throws.
 */
export function startSupabaseKeepAlive() {
  if (!isEnabled()) {
    console.log('[supabase-keepalive] disabled');
    return;
  }

  const ms = intervalMs();
  console.log(`[supabase-keepalive] starting (interval ${ms}ms)`);

  setTimeout(() => {
    void ping();
    setInterval(() => {
      void ping();
    }, ms);
  }, BOOT_DELAY_MS);
}
