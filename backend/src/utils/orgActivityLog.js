import { supabaseAdmin } from '../supabase.js';

/**
 * Fire-and-forget org-wide activity log. Never throws to callers.
 * @param {{
 *   actorUserId?: string | null,
 *   actorRole?: string | null,
 *   actorName?: string | null,
 *   action: string,
 *   entityType?: string | null,
 *   entityId?: string | null,
 *   clientId?: string | null,
 *   summary: string,
 *   metadata?: Record<string, unknown>
 * }} entry
 */
export function logOrgActivity(entry) {
  const row = {
    actor_user_id: entry.actorUserId ?? null,
    actor_role: entry.actorRole ?? null,
    actor_name: entry.actorName ?? null,
    action: String(entry.action || '').trim() || 'UNKNOWN',
    entity_type: entry.entityType ?? null,
    entity_id: entry.entityId != null ? String(entry.entityId) : null,
    client_id: entry.clientId ?? null,
    summary: String(entry.summary || '').trim() || entry.action,
    metadata: entry.metadata && typeof entry.metadata === 'object' ? entry.metadata : {}
  };

  Promise.resolve(
    supabaseAdmin.from('org_activity_logs').insert(row)
  ).then(({ error }) => {
    if (error) console.error('[org_activity_logs]', error.message || error);
  }).catch((err) => {
    console.error('[org_activity_logs]', err?.message || err);
  });
}

/**
 * Resolve actor name/role from users table for logging.
 * @param {string} userId
 * @returns {Promise<{ name: string | null, role: string | null }>}
 */
export async function resolveActorProfile(userId) {
  if (!userId) return { name: null, role: null };
  try {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('name, role')
      .eq('id', userId)
      .maybeSingle();
    if (error) throw error;
    return { name: data?.name ?? null, role: data?.role ?? null };
  } catch {
    return { name: null, role: null };
  }
}

/**
 * Convenience: log with actor resolved from req.user (id + optional role/name).
 */
export async function logOrgActivityFromReq(req, entry) {
  const userId = req?.user?.id ?? null;
  let actorRole = req?.user?.role ?? null;
  let actorName = req?.user?.name ?? null;
  if (userId && (!actorRole || !actorName)) {
    const profile = await resolveActorProfile(userId);
    actorRole = actorRole || profile.role;
    actorName = actorName || profile.name;
  }
  logOrgActivity({
    ...entry,
    actorUserId: userId,
    actorRole,
    actorName
  });
}
