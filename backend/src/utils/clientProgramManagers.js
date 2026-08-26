import { supabaseAdmin } from '../supabase.js';
import { getPendingInviteUserIdSet } from './staffInvite.js';

/** Normalize body.program_manager_ids and/or body.program_manager_id into a unique id list. */
export function parseProgramManagerIds(body = {}) {
  const ids = [];
  const seen = new Set();

  const push = (value) => {
    const id = String(value ?? '').trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    ids.push(id);
  };

  if (Array.isArray(body.program_manager_ids)) {
    for (const value of body.program_manager_ids) push(value);
  }

  // Backward compatible single-id field
  if (body.program_manager_id != null && String(body.program_manager_id).trim() !== '') {
    push(body.program_manager_id);
  }

  return ids;
}

export async function assertValidProgramManagers(ids) {
  if (!ids.length) {
    return { ok: false, error: 'At least one program manager is required', users: [] };
  }

  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id, role, name, email')
    .in('id', ids)
    .eq('role', 'PROGRAM_MANAGER');
  if (error) throw error;

  const found = new Map((data ?? []).map((u) => [u.id, u]));
  const missing = ids.filter((id) => !found.has(id));
  if (missing.length) {
    return { ok: false, error: 'Invalid program_manager_id(s)', users: [] };
  }

  const pending = await getPendingInviteUserIdSet(ids);
  if (ids.some((id) => pending.has(id))) {
    return {
      ok: false,
      error: 'Program manager has not completed account setup yet',
      users: []
    };
  }

  // Preserve caller order
  return { ok: true, users: ids.map((id) => found.get(id)) };
}

export async function syncClientProgramManagers(clientId, programManagerIds) {
  const uniqueIds = [...new Set((programManagerIds ?? []).map((id) => String(id).trim()).filter(Boolean))];

  const { data: existing, error: listErr } = await supabaseAdmin
    .from('client_program_managers')
    .select('program_manager_id')
    .eq('client_id', clientId);
  if (listErr) throw listErr;

  const before = new Set((existing ?? []).map((r) => r.program_manager_id));
  const after = new Set(uniqueIds);

  const toRemove = [...before].filter((id) => !after.has(id));
  const toAdd = [...after].filter((id) => !before.has(id));

  if (toRemove.length) {
    const { error: delErr } = await supabaseAdmin
      .from('client_program_managers')
      .delete()
      .eq('client_id', clientId)
      .in('program_manager_id', toRemove);
    if (delErr) throw delErr;
  }

  if (toAdd.length) {
    const rows = toAdd.map((program_manager_id) => ({
      client_id: clientId,
      program_manager_id
    }));
    const { error: insErr } = await supabaseAdmin.from('client_program_managers').insert(rows);
    if (insErr) throw insErr;
  }

  // Keep legacy clients.program_manager_id as the primary (first) PM.
  const primaryId = uniqueIds[0] ?? null;
  if (primaryId) {
    const { error: updErr } = await supabaseAdmin
      .from('clients')
      .update({ program_manager_id: primaryId })
      .eq('id', clientId);
    if (updErr) throw updErr;
  }

  return {
    program_manager_ids: uniqueIds,
    primary_program_manager_id: primaryId,
    added: toAdd,
    removed: toRemove
  };
}

export async function listProgramManagerIdsForClient(clientId) {
  const { data, error } = await supabaseAdmin
    .from('client_program_managers')
    .select('program_manager_id')
    .eq('client_id', clientId);
  if (error) throw error;
  const ids = (data ?? []).map((r) => r.program_manager_id);
  if (ids.length) return ids;

  // Fallback for rows not yet backfilled
  const { data: client, error: cErr } = await supabaseAdmin
    .from('clients')
    .select('program_manager_id')
    .eq('id', clientId)
    .maybeSingle();
  if (cErr) throw cErr;
  return client?.program_manager_id ? [client.program_manager_id] : [];
}

export async function isProgramManagerForClient(userId, clientId) {
  const { data, error } = await supabaseAdmin
    .from('client_program_managers')
    .select('client_id')
    .eq('client_id', clientId)
    .eq('program_manager_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (data) return true;

  const { data: client, error: cErr } = await supabaseAdmin
    .from('clients')
    .select('program_manager_id')
    .eq('id', clientId)
    .maybeSingle();
  if (cErr) throw cErr;
  return client?.program_manager_id === userId;
}

export async function listClientIdsForProgramManager(userId) {
  const { data, error } = await supabaseAdmin
    .from('client_program_managers')
    .select('client_id')
    .eq('program_manager_id', userId);
  if (error) throw error;
  const fromJunction = (data ?? []).map((r) => r.client_id);

  const { data: legacy, error: lErr } = await supabaseAdmin
    .from('clients')
    .select('id')
    .eq('program_manager_id', userId);
  if (lErr) throw lErr;

  return [...new Set([...fromJunction, ...(legacy ?? []).map((c) => c.id)])];
}

export async function fetchProgramManagersByClientIds(clientIds) {
  const ids = [...new Set((clientIds ?? []).filter(Boolean))];
  const byClient = new Map(ids.map((id) => [id, []]));
  if (!ids.length) return byClient;

  const { data, error } = await supabaseAdmin
    .from('client_program_managers')
    .select('client_id, program_manager_id, program_manager:program_manager_id(id, name, email)')
    .in('client_id', ids);
  if (error) throw error;

  for (const row of data ?? []) {
    const list = byClient.get(row.client_id) ?? [];
    const pm = row.program_manager
      ? {
          id: row.program_manager.id,
          name: row.program_manager.name ?? null,
          email: row.program_manager.email ?? null
        }
      : { id: row.program_manager_id, name: null, email: null };
    list.push(pm);
    byClient.set(row.client_id, list);
  }

  return byClient;
}

export function attachProgramManagersToClient(client, managers = []) {
  const list = managers.length
    ? managers
    : client?.program_manager
      ? [{
          id: client.program_manager.id,
          name: client.program_manager.name ?? null,
          email: client.program_manager.email ?? null
        }]
      : client?.program_manager_id
        ? [{
            id: client.program_manager_id,
            name: client.program_manager_name ?? null,
            email: null
          }]
        : [];

  const names = list.map((m) => m.name).filter(Boolean);
  return {
    ...client,
    program_managers: list,
    program_manager_ids: list.map((m) => m.id),
    program_manager_name: names.length ? names.join(', ') : (client.program_manager_name ?? null),
    program_manager_names: names
  };
}
