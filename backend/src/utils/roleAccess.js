import { supabaseAdmin } from '../supabase.js';

export async function loadUserRole(userId) {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id, name, email, role')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export function isSuperAdminRole(role) {
  return role === 'SUPER_ADMIN';
}

/** Payroll Lead owner of the client, or Super Admin (org-wide). */
export function canAccessClientAsLead(user, client) {
  if (!user || !client) return false;
  if (isSuperAdminRole(user.role)) return true;
  return user.role === 'PAYROLL_LEAD' && client.created_by === user.id;
}

/** Client IDs the caller may manage as PM, PL owner, or Super Admin (all). */
export async function listAccessibleClientIds(userId) {
  const user = await loadUserRole(userId);
  if (!user) return { user: null, clientIds: [] };

  if (isSuperAdminRole(user.role)) {
    const { data, error } = await supabaseAdmin.from('clients').select('id');
    if (error) throw error;
    return { user, clientIds: (data ?? []).map((c) => c.id) };
  }

  const { data, error } = await supabaseAdmin
    .from('clients')
    .select('id')
    .or(`program_manager_id.eq.${userId},created_by.eq.${userId}`);
  if (error) throw error;
  return { user, clientIds: (data ?? []).map((c) => c.id) };
}
