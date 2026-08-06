import { supabaseAdmin } from '../supabase.js';

/** @param {string | string[]} role */
export function requireRole(role) {
  const allowed = Array.isArray(role) ? role : [role];
  return async (req, res, next) => {
    try {
      const { data, error } = await supabaseAdmin
        .from('users')
        .select('role, name')
        .eq('id', req.user.id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return res.status(403).json({ error: 'User profile not found' });
      if (!allowed.includes(data.role)) {
        const label = allowed.length === 1 ? allowed[0] : allowed.join(' or ');
        return res.status(403).json({ error: `Forbidden: requires role ${label}` });
      }
      req.user.role = data.role;
      req.user.name = data.name ?? null;
      next();
    } catch (err) {
      next(err);
    }
  };
}
