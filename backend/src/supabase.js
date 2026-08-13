import './loadEnv.js';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
}

const authClientOptions = {
  auth: { persistSession: false, autoRefreshToken: false },
};

/** Shared admin client — never call signIn/refreshSession on this instance. */
export const supabaseAdmin = createClient(url, serviceKey, authClientOptions);

/**
 * Ephemeral client for password login / refresh. signInWithPassword and
 * refreshSession attach a user session to the client; doing that on
 * supabaseAdmin makes later DB calls run as that user (RLS → empty rows).
 */
export function createAuthClient() {
  return createClient(url, serviceKey, authClientOptions);
}
