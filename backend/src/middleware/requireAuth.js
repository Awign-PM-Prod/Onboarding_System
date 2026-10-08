import { supabaseAdmin } from '../supabase.js';

export const ACCESS_REVOKED_MESSAGE =
  'Your access to the portal has been revoked. Contact Super Admin.';

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Missing bearer token' });
  }
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // Access tokens stay valid until expiry even after an auth ban, so check revocation per request.
  const { data: profile, error: profileErr } = await supabaseAdmin
    .from('users')
    .select('role, name, access_revoked_at')
    .eq('id', data.user.id)
    .maybeSingle();
  if (profileErr) return next(profileErr);
  if (profile?.access_revoked_at) {
    return res.status(401).json({ error: ACCESS_REVOKED_MESSAGE, code: 'ACCESS_REVOKED' });
  }

  req.user = { id: data.user.id, email: data.user.email, authProfile: profile ?? null };
  next();
}
