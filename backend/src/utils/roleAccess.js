import { supabaseAdmin } from '../supabase.js';
import { listClientIdsForProgramManager } from './clientProgramManagers.js';

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

/** Payroll Lead or Super Admin (org-wide). */
export function canAccessClientAsLead(user, client) {
  if (!user || !client) return false;
  return isSuperAdminRole(user.role) || user.role === 'PAYROLL_LEAD';
}

/** Client IDs the caller may manage as PM, PL (all), or Super Admin (all). */
export async function listAccessibleClientIds(userId) {
  const user = await loadUserRole(userId);
  if (!user) return { user: null, clientIds: [] };

  if (isSuperAdminRole(user.role) || user.role === 'PAYROLL_LEAD') {
    const { data, error } = await supabaseAdmin.from('clients').select('id');
    if (error) throw error;
    return { user, clientIds: (data ?? []).map((c) => c.id) };
  }

  const clientIds = await listClientIdsForProgramManager(userId);
  return { user, clientIds };
}
