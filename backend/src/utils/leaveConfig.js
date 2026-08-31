import { supabaseAdmin } from '../supabase.js';
import { normalizeIndianState } from './indianStates.js';
import {
  normalizeAccrualRules,
  normalizeLeaveConfigId,
  normalizeLeaveType,
  parseApplicableFlag
} from './leaveConfigCore.js';

export {
  CODE_TO_LEAVE_TYPE,
  LEAVE_CODE_TO_ALLOWANCE_FIELD,
  LEAVE_TYPES,
  LEAVE_TYPE_LABELS,
  LEAVE_TYPE_TO_CODE,
  computeAccruedDays,
  daysWorkedFromLegendTotals,
  formatAccrualString,
  leaveRuleForEmployee,
  normalizeAccrualRules,
  normalizeLeaveConfigId,
  normalizeLeaveSource,
  normalizeLeaveType,
  parseAccrualString,
  parseApplicableFlag,
  resolveAnnualEntitlement
} from './leaveConfigCore.js';

const DEF_SELECT = 'id, name, is_default, client_id, created_at, updated_at';
const RULE_SELECT =
  'id, config_id, state, leave_type, not_applicable, accrual_rules, fixed_days, accumulation_limit';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONFIG_NAME_MAX = 100;
const DEFS_MIGRATION = '20260831120000_leave_config.sql';

function badRequest(message, details) {
  const err = new Error(message);
  err.status = 400;
  if (details) err.details = details;
  return err;
}

function leaveConfigDbError(error) {
  const msg = String(error?.message || '');
  if (
    msg.includes('leave_config_defs')
    || msg.includes('leave_config_id')
    || msg.includes('leave_config_rules')
  ) {
    return new Error(`Leave configuration tables are missing. Run migration ${DEFS_MIGRATION} in Supabase.`);
  }
  if (msg.includes('leave_source')) {
    return new Error(
      `Leave source column is missing. Run migration ${DEFS_MIGRATION} in Supabase.`
    );
  }
  return error;
}

function parseOptionalNumber(raw) {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
}

export function mapLeaveConfigDef(row) {
  if (!row) return null;
  const client = row.client && typeof row.client === 'object' && !Array.isArray(row.client)
    ? row.client
    : null;
  return {
    id: row.id,
    name: String(row.name ?? '').trim(),
    is_default: row.is_default === true,
    client_id: row.client_id ?? null,
    client_name: client?.client_name ?? row.client_name ?? null,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null
  };
}

export function mapLeaveConfigRule(row) {
  if (!row) return null;
  return {
    id: row.id ?? null,
    config_id: row.config_id ?? null,
    state: row.state ?? '',
    leave_type: normalizeLeaveType(row.leave_type) || row.leave_type,
    not_applicable: row.not_applicable === true,
    accrual_rules: normalizeAccrualRules(row.accrual_rules) || [],
    fixed_days: row.fixed_days == null || row.fixed_days === '' ? null : Number(row.fixed_days),
    accumulation_limit:
      row.accumulation_limit == null || row.accumulation_limit === ''
        ? null
        : Number(row.accumulation_limit)
  };
}

export async function getDefaultLeaveConfigDef() {
  const { data, error } = await supabaseAdmin
    .from('leave_config_defs')
    .select(DEF_SELECT)
    .eq('is_default', true)
    .maybeSingle();
  if (error) throw leaveConfigDbError(error);
  if (!data) {
    throw new Error(`Default leave configuration is missing. Run migration ${DEFS_MIGRATION} in Supabase.`);
  }
  return mapLeaveConfigDef(data);
}

export async function getLeaveConfigDef(id) {
  const raw = String(id ?? '').trim();
  if (!raw || raw.toLowerCase() === 'default') return getDefaultLeaveConfigDef();
  if (!UUID_RE.test(raw)) throw badRequest('Invalid leave config id');
  const { data, error } = await supabaseAdmin
    .from('leave_config_defs')
    .select(`${DEF_SELECT}, client:client_id(id, client_name)`)
    .eq('id', raw)
    .maybeSingle();
  if (error) throw leaveConfigDbError(error);
  if (!data) {
    const err = new Error('Leave configuration not found');
    err.status = 404;
    throw err;
  }
  return mapLeaveConfigDef(data);
}

export async function resolveLeaveConfigId(rawId) {
  const def = rawId ? await getLeaveConfigDef(rawId) : await getDefaultLeaveConfigDef();
  return def.id;
}

function sortDefs(defs) {
  return [...defs].sort((a, b) => {
    if (a.is_default && !b.is_default) return -1;
    if (!a.is_default && b.is_default) return 1;
    return a.name.localeCompare(b.name);
  });
}

export async function listLeaveConfigDefs({ forClientId = null, includeAll = false } = {}) {
  const { data, error } = await supabaseAdmin
    .from('leave_config_defs')
    .select(`${DEF_SELECT}, client:client_id(id, client_name)`)
    .order('is_default', { ascending: false })
    .order('name', { ascending: true })
    .limit(2000);
  if (error) throw leaveConfigDbError(error);
  const mapped = (data ?? []).map(mapLeaveConfigDef);
  if (includeAll) return sortDefs(mapped);

  const clientId = String(forClientId ?? '').trim() || null;
  return sortDefs(mapped.filter((d) => (
    d.is_default
    || !d.client_id
    || (clientId && d.client_id === clientId)
  )));
}

export async function uniqueClientLeaveConfigName(clientName, clientId) {
  const base = `${String(clientName ?? '').trim() || 'Client'} leave config`.slice(0, 100);
  const suffix = ` (${String(clientId ?? '').replace(/-/g, '').slice(0, 8)})`;
  const { data, error } = await supabaseAdmin
    .from('leave_config_defs')
    .select('name')
    .limit(2000);
  if (error) throw leaveConfigDbError(error);
  const taken = new Set((data ?? []).map((d) => String(d.name ?? '').trim().toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  const withId = `${base.slice(0, Math.max(1, 100 - suffix.length))}${suffix}`.slice(0, 100);
  if (!taken.has(withId.toLowerCase())) return withId;
  return `${base.slice(0, 80)} ${Date.now()}`.slice(0, 100);
}

export function normalizeLeaveConfigItems(rawItems) {
  const errors = [];
  const items = [];
  const seen = new Set();

  if (!Array.isArray(rawItems)) {
    return { items, errors: ['items array is required'] };
  }

  for (let i = 0; i < rawItems.length; i += 1) {
    const raw = rawItems[i];
    const state = normalizeIndianState(raw?.state);
    if (!state) {
      errors.push(`Item ${i + 1}: invalid state "${raw?.state ?? ''}"`);
      continue;
    }
    const leave_type = normalizeLeaveType(raw?.leave_type ?? raw?.leaveType);
    if (!leave_type) {
      errors.push(`Item ${i + 1}: invalid leave type "${raw?.leave_type ?? ''}"`);
      continue;
    }

    const applicableRaw = raw?.applicable ?? raw?.not_applicable;
    let not_applicable = false;
    if (raw?.not_applicable === true || raw?.not_applicable === false) {
      not_applicable = raw.not_applicable === true;
    } else {
      const flag = parseApplicableFlag(applicableRaw);
      if (flag === null) {
        errors.push(`Item ${i + 1}: applicable must be Yes or No`);
        continue;
      }
      not_applicable = flag === false;
    }

    const accrual = normalizeAccrualRules(raw?.accrual_rules ?? raw?.accrual);
    if (accrual == null) {
      errors.push(`Item ${i + 1}: invalid accrual "${raw?.accrual ?? raw?.accrual_rules ?? ''}"`);
      continue;
    }

    const fixedParsed = parseOptionalNumber(raw?.fixed_days ?? raw?.fixedDays);
    if (fixedParsed === undefined) {
      errors.push(`Item ${i + 1}: invalid fixed_days`);
      continue;
    }
    const accumParsed = parseOptionalNumber(raw?.accumulation_limit ?? raw?.accumulationLimit);
    if (accumParsed === undefined) {
      errors.push(`Item ${i + 1}: invalid accumulation_limit`);
      continue;
    }

    const key = `${state}|${leave_type}`;
    if (seen.has(key)) {
      errors.push(`Item ${i + 1}: duplicate ${state} ${leave_type}`);
      continue;
    }
    seen.add(key);

    items.push({
      state,
      leave_type,
      not_applicable,
      accrual_rules: not_applicable ? [] : accrual,
      fixed_days: not_applicable ? null : fixedParsed,
      accumulation_limit: not_applicable ? null : accumParsed,
      updated_at: new Date().toISOString()
    });
  }

  return { items, errors };
}

export async function createLeaveConfigDef({ name, states = [], items } = {}) {
  const trimmed = String(name ?? '').trim().slice(0, CONFIG_NAME_MAX);
  if (!trimmed) throw badRequest('Template name is required');

  const normalizedStates = [];
  const seenStates = new Set();
  for (const raw of Array.isArray(states) ? states : []) {
    const state = normalizeIndianState(raw);
    if (!state) throw badRequest(`Invalid Indian state/UT "${raw ?? ''}"`);
    if (seenStates.has(state)) continue;
    seenStates.add(state);
    normalizedStates.push(state);
  }

  const csvItems = Array.isArray(items) ? items : [];

  const { data, error } = await supabaseAdmin
    .from('leave_config_defs')
    .insert({
      name: trimmed,
      is_default: false,
      client_id: null,
      updated_at: new Date().toISOString()
    })
    .select(DEF_SELECT)
    .single();
  if (error) {
    const msg = String(error.message || '');
    if (msg.includes('leave_config_defs_name') || msg.toLowerCase().includes('duplicate')) {
      throw badRequest(`A leave configuration named "${trimmed}" already exists`);
    }
    throw leaveConfigDbError(error);
  }

  const created = mapLeaveConfigDef(data);

  if (csvItems.length) {
    try {
      await replaceLeaveConfigRules(csvItems, { configId: created.id });
    } catch (err) {
      await supabaseAdmin.from('leave_config_defs').delete().eq('id', created.id);
      throw err;
    }
    return created;
  }

  if (normalizedStates.length) {
    const defaultDef = await getDefaultLeaveConfigDef();
    const { data: seedRows, error: seedErr } = await supabaseAdmin
      .from('leave_config_rules')
      .select(RULE_SELECT)
      .eq('config_id', defaultDef.id)
      .in('state', normalizedStates)
      .limit(20000);
    if (seedErr) throw leaveConfigDbError(seedErr);

    const rows = (seedRows ?? []).map((row) => ({
      config_id: created.id,
      state: row.state,
      leave_type: row.leave_type,
      not_applicable: row.not_applicable === true,
      accrual_rules: row.accrual_rules ?? [],
      fixed_days: row.fixed_days,
      accumulation_limit: row.accumulation_limit,
      updated_at: new Date().toISOString()
    }));
    if (rows.length) {
      const { error: insErr } = await supabaseAdmin.from('leave_config_rules').insert(rows);
      if (insErr) throw leaveConfigDbError(insErr);
    }
  }

  return created;
}

export async function assignLeaveConfigToClient(clientId, configId) {
  const id = String(clientId ?? '').trim();
  if (!id) throw badRequest('client_id is required');

  const { data: owned, error: ownedErr } = await supabaseAdmin
    .from('leave_config_defs')
    .select('id')
    .eq('client_id', id);
  if (ownedErr) throw leaveConfigDbError(ownedErr);

  const nextId = normalizeLeaveConfigId(configId);
  if (!nextId) {
    const ownedIds = (owned ?? []).map((r) => r.id).filter(Boolean);
    if (ownedIds.length) {
      const { error: clearErr } = await supabaseAdmin
        .from('leave_config_defs')
        .update({ client_id: null, updated_at: new Date().toISOString() })
        .in('id', ownedIds);
      if (clearErr) throw leaveConfigDbError(clearErr);
    }
    return null;
  }

  const def = await getLeaveConfigDef(nextId);
  if (def.is_default) {
    return assignLeaveConfigToClient(id, null);
  }
  if (def.client_id && def.client_id !== id) {
    throw badRequest(`Leave configuration "${def.name}" is already assigned to another client`);
  }

  const staleIds = (owned ?? []).map((r) => r.id).filter((oid) => oid !== def.id);
  if (staleIds.length) {
    const { error: clearErr } = await supabaseAdmin
      .from('leave_config_defs')
      .update({ client_id: null, updated_at: new Date().toISOString() })
      .in('id', staleIds);
    if (clearErr) throw leaveConfigDbError(clearErr);
  }

  if (def.client_id !== id) {
    const { error: asgErr } = await supabaseAdmin
      .from('leave_config_defs')
      .update({ client_id: id, updated_at: new Date().toISOString() })
      .eq('id', def.id);
    if (asgErr) throw leaveConfigDbError(asgErr);
  }

  return def.id;
}

export async function listLeaveConfigRules({ state, configId, leaveType } = {}) {
  const resolvedId = await resolveLeaveConfigId(configId);
  let query = supabaseAdmin
    .from('leave_config_rules')
    .select(RULE_SELECT)
    .eq('config_id', resolvedId)
    .order('state', { ascending: true })
    .order('leave_type', { ascending: true })
    .limit(20000);

  if (state) {
    const normalized = normalizeIndianState(state);
    if (!normalized) throw badRequest('Invalid Indian state/UT');
    query = query.eq('state', normalized);
  }

  if (leaveType) {
    const type = normalizeLeaveType(leaveType);
    if (!type) throw badRequest('Invalid leave type');
    query = query.eq('leave_type', type);
  }

  const { data, error } = await query;
  if (error) throw leaveConfigDbError(error);
  return (data ?? []).map(mapLeaveConfigRule);
}

function stateTypeKeys(items) {
  const pairs = [];
  const seen = new Set();
  for (const item of items ?? []) {
    if (!item.state || !item.leave_type) continue;
    const key = `${item.state}|${item.leave_type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push({ state: item.state, leave_type: item.leave_type });
  }
  return pairs;
}

export async function replaceLeaveConfigRules(rawItems, { configId } = {}) {
  const def = await getLeaveConfigDef(configId);
  const { items, errors } = normalizeLeaveConfigItems(rawItems);
  if (errors.length) {
    throw badRequest(errors.join('; '), errors);
  }
  if (!items.length) {
    throw badRequest('items array is required');
  }

  const pairs = stateTypeKeys(items);
  for (const { state, leave_type } of pairs) {
    const { error: delErr } = await supabaseAdmin
      .from('leave_config_rules')
      .delete()
      .eq('config_id', def.id)
      .eq('state', state)
      .eq('leave_type', leave_type);
    if (delErr) throw leaveConfigDbError(delErr);
  }

  const rows = items.map((item) => ({ ...item, config_id: def.id }));
  const { data, error } = await supabaseAdmin
    .from('leave_config_rules')
    .insert(rows)
    .select(RULE_SELECT);
  if (error) throw leaveConfigDbError(error);

  return {
    items: (data ?? []).map(mapLeaveConfigRule),
    replaced: pairs,
    config_id: def.id,
    is_default: def.is_default === true
  };
}

export async function replaceAllLeaveConfigRules(rawItems, { configId } = {}) {
  const def = await getLeaveConfigDef(configId);
  if (def.is_default) {
    throw badRequest('Default leave configuration cannot be replaced from a client form');
  }
  const { items, errors } = Array.isArray(rawItems) && rawItems.length
    ? normalizeLeaveConfigItems(rawItems)
    : { items: [], errors: [] };
  if (errors.length) {
    throw badRequest(errors.join('; '), errors);
  }

  const { error: delErr } = await supabaseAdmin
    .from('leave_config_rules')
    .delete()
    .eq('config_id', def.id);
  if (delErr) throw leaveConfigDbError(delErr);

  if (!items.length) {
    return { items: [], config_id: def.id };
  }

  const rows = items.map((item) => ({ ...item, config_id: def.id }));
  const { data, error } = await supabaseAdmin
    .from('leave_config_rules')
    .insert(rows)
    .select(RULE_SELECT);
  if (error) throw leaveConfigDbError(error);
  return {
    items: (data ?? []).map(mapLeaveConfigRule),
    config_id: def.id
  };
}

export async function findDefaultLeaveConfigClientIds() {
  const defaultDef = await getDefaultLeaveConfigDef();
  const { data: policies, error: pErr } = await supabaseAdmin
    .from('client_attendance_policies')
    .select('client_id')
    .or(`leave_config_id.is.null,leave_config_id.eq.${defaultDef.id}`);
  if (pErr) throw leaveConfigDbError(pErr);
  return [...new Set((policies ?? []).map((p) => p.client_id).filter(Boolean))];
}

export async function findClientIdsForLeaveConfigRecalc(configId) {
  const def = await getLeaveConfigDef(configId);
  if (def.is_default) return findDefaultLeaveConfigClientIds();
  return def.client_id ? [def.client_id] : [];
}
