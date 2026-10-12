import { supabaseAdmin } from '../supabase.js';
import { logOrgActivityFromReq } from './orgActivityLog.js';
import { unlockExpiresAtFromNow } from './unlockTtl.js';

/**
 * A request is routed to the Approver PM when the client has approver_pm_id set
 * and the requester is not that Approver PM (self-raised falls back to SA).
 */
export function resolveApproverForRequest(row, clientApproverId) {
  const approverId = clientApproverId ? String(clientApproverId) : null;
  if (!approverId) return null;
  if (String(row?.requested_by ?? '') === approverId) return null;
  return approverId;
}

export async function fetchClientApproverMap(clientIds) {
  const ids = [...new Set((clientIds ?? []).filter(Boolean))];
  const map = new Map();
  if (!ids.length) return map;

  const { data, error } = await supabaseAdmin
    .from('clients')
    .select('id, client_name, approver_pm_id')
    .in('id', ids);
  if (error) throw error;

  for (const c of data ?? []) {
    map.set(c.id, {
      client_name: c.client_name ?? 'Client',
      approver_pm_id: c.approver_pm_id ?? null
    });
  }
  return map;
}

async function loadUsersByIds(userIds) {
  const ids = [...new Set((userIds ?? []).filter(Boolean))];
  if (!ids.length) return new Map();
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id, name, email')
    .in('id', ids);
  if (error) throw error;
  return new Map((data ?? []).map((u) => [u.id, u]));
}

function enrichApproverFields(row, clientInfo, userMap) {
  const approverPmId = resolveApproverForRequest(row, clientInfo?.approver_pm_id);
  const approverUser = approverPmId ? userMap.get(approverPmId) : null;
  const clientApproverId = clientInfo?.approver_pm_id ?? null;
  const clientApproverUser = clientApproverId ? userMap.get(clientApproverId) : null;
  return {
    approver_pm_id: clientApproverId,
    approver_pm_name: clientApproverUser?.name ?? clientApproverUser?.email ?? null,
    review_by_approver_pm: Boolean(approverPmId),
    assigned_approver_pm_id: approverPmId,
    assigned_approver_pm_name: approverUser?.name ?? approverUser?.email ?? null
  };
}

export async function listDojExtendRequests({ statusFilter = 'PENDING', clientIds = null } = {}) {
  if (!['PENDING', 'APPROVED', 'REJECTED', 'ALL'].includes(statusFilter)) {
    const err = new Error('status must be PENDING, APPROVED, REJECTED, or ALL.');
    err.status = 400;
    throw err;
  }

  let query = supabaseAdmin
    .from('doj_extend_requests')
    .select(
      'id, employee_id, client_id, requested_by, reason, status, reviewed_by, reviewed_at, review_note, max_allowed_doj, unlock_expires_at, created_at'
    )
    .order('created_at', { ascending: false })
    .limit(100);
  if (statusFilter !== 'ALL') {
    query = query.eq('status', statusFilter);
  }
  if (Array.isArray(clientIds)) {
    if (!clientIds.length) return [];
    query = query.in('client_id', clientIds);
  }

  const { data, error } = await query;
  if (error) throw error;
  const rows = data ?? [];
  if (!rows.length) return [];

  const employeeIds = [...new Set(rows.map((r) => r.employee_id))];
  const rowClientIds = [...new Set(rows.map((r) => r.client_id))];

  const [{ data: employees }, clientMap, userMapBase] = await Promise.all([
    supabaseAdmin.from('employees').select('id, name, date_of_joining, mobile').in('id', employeeIds),
    fetchClientApproverMap(rowClientIds),
    loadUsersByIds(rows.flatMap((r) => [r.requested_by, r.reviewed_by].filter(Boolean)))
  ]);

  const approverIds = [...clientMap.values()]
    .map((c) => c.approver_pm_id)
    .filter(Boolean);
  const userMap = new Map(userMapBase);
  for (const [id, u] of await loadUsersByIds(approverIds)) {
    userMap.set(id, u);
  }

  const empMap = new Map((employees ?? []).map((e) => [e.id, e]));

  return rows.map((r) => {
    const emp = empMap.get(r.employee_id);
    const client = clientMap.get(r.client_id);
    const pm = userMap.get(r.requested_by);
    const reviewer = r.reviewed_by ? userMap.get(r.reviewed_by) : null;
    return {
      id: r.id,
      employee_id: r.employee_id,
      employee_name: emp?.name ?? 'Employee',
      employee_mobile: emp?.mobile ?? null,
      date_of_joining: emp?.date_of_joining ?? null,
      client_id: r.client_id,
      client_name: client?.client_name ?? 'Client',
      requested_by: r.requested_by,
      requested_by_name: pm?.name ?? pm?.email ?? 'Program Manager',
      reason: r.reason,
      status: r.status,
      reviewed_by: r.reviewed_by,
      reviewed_by_name: reviewer?.name ?? null,
      reviewed_at: r.reviewed_at,
      review_note: r.review_note,
      max_allowed_doj: r.max_allowed_doj,
      unlock_expires_at: r.unlock_expires_at,
      created_at: r.created_at,
      ...enrichApproverFields(r, client, userMap)
    };
  });
}

export async function listJoiningStatusChangeRequests({
  statusFilter = 'PENDING',
  clientIds = null
} = {}) {
  if (!['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'ALL'].includes(statusFilter)) {
    const err = new Error('status must be PENDING, APPROVED, REJECTED, EXPIRED, or ALL.');
    err.status = 400;
    throw err;
  }

  let query = supabaseAdmin
    .from('joining_status_change_requests')
    .select(
      'id, employee_id, client_id, requested_by, reason, status, reviewed_by, reviewed_at, review_note, unlock_expires_at, created_at'
    )
    .order('created_at', { ascending: false })
    .limit(100);
  if (statusFilter !== 'ALL') {
    query = query.eq('status', statusFilter);
  }
  if (Array.isArray(clientIds)) {
    if (!clientIds.length) return [];
    query = query.in('client_id', clientIds);
  }

  const { data, error } = await query;
  if (error) throw error;
  const rows = data ?? [];
  if (!rows.length) return [];

  const employeeIds = [...new Set(rows.map((r) => r.employee_id))];
  const rowClientIds = [...new Set(rows.map((r) => r.client_id))];

  const [{ data: employees }, clientMap, userMapBase] = await Promise.all([
    supabaseAdmin
      .from('employees')
      .select('id, name, joining_status, date_of_joining, mobile')
      .in('id', employeeIds),
    fetchClientApproverMap(rowClientIds),
    loadUsersByIds(rows.flatMap((r) => [r.requested_by, r.reviewed_by].filter(Boolean)))
  ]);

  const approverIds = [...clientMap.values()]
    .map((c) => c.approver_pm_id)
    .filter(Boolean);
  const userMap = new Map(userMapBase);
  for (const [id, u] of await loadUsersByIds(approverIds)) {
    userMap.set(id, u);
  }

  const empMap = new Map((employees ?? []).map((e) => [e.id, e]));

  return rows.map((r) => {
    const emp = empMap.get(r.employee_id);
    const client = clientMap.get(r.client_id);
    const pm = userMap.get(r.requested_by);
    const reviewer = r.reviewed_by ? userMap.get(r.reviewed_by) : null;
    return {
      id: r.id,
      employee_id: r.employee_id,
      employee_name: emp?.name ?? 'Employee',
      employee_mobile: emp?.mobile ?? null,
      joining_status: emp?.joining_status ?? null,
      date_of_joining: emp?.date_of_joining ?? null,
      client_id: r.client_id,
      client_name: client?.client_name ?? 'Client',
      requested_by: r.requested_by,
      requested_by_name: pm?.name ?? pm?.email ?? 'Program Manager',
      reason: r.reason,
      status: r.status,
      reviewed_by: r.reviewed_by,
      reviewed_by_name: reviewer?.name ?? null,
      reviewed_at: r.reviewed_at,
      review_note: r.review_note,
      unlock_expires_at: r.unlock_expires_at,
      created_at: r.created_at,
      ...enrichApproverFields(r, client, userMap)
    };
  });
}

export async function getRequestRouting(requestRow) {
  if (!requestRow?.client_id) {
    return { reviewByApproverPm: false, approverPmId: null, approverPmName: null };
  }
  const { data: client, error } = await supabaseAdmin
    .from('clients')
    .select('id, approver_pm_id')
    .eq('id', requestRow.client_id)
    .maybeSingle();
  if (error) throw error;

  const assignedId = resolveApproverForRequest(requestRow, client?.approver_pm_id);
  if (!assignedId) {
    return {
      reviewByApproverPm: false,
      approverPmId: client?.approver_pm_id ?? null,
      approverPmName: null
    };
  }

  const { data: user } = await supabaseAdmin
    .from('users')
    .select('id, name, email')
    .eq('id', assignedId)
    .maybeSingle();

  return {
    reviewByApproverPm: true,
    approverPmId: assignedId,
    approverPmName: user?.name ?? user?.email ?? 'Approver PM'
  };
}

/**
 * Perform DOJ extend review. Caller must already authorize the reviewer.
 * Returns { ok: true, request } or { ok: false, status, error }.
 */
export async function reviewDojExtendRequest(req, requestId, body = {}) {
  const decision = String(body?.decision ?? '').trim().toUpperCase();
  const reviewNote = String(body?.note ?? body?.review_note ?? '').trim() || null;
  const maxAllowedDojRaw = String(body?.max_allowed_doj ?? '').trim();

  if (!['APPROVED', 'REJECTED'].includes(decision)) {
    return { ok: false, status: 400, error: 'decision must be APPROVED or REJECTED.' };
  }

  const { data: requestRow, error: reqErr } = await supabaseAdmin
    .from('doj_extend_requests')
    .select('*')
    .eq('id', requestId)
    .maybeSingle();
  if (reqErr) throw reqErr;
  if (!requestRow) return { ok: false, status: 404, error: 'Request not found.' };
  if (requestRow.status !== 'PENDING') {
    return { ok: false, status: 400, error: 'Only PENDING requests can be reviewed.' };
  }

  const { data: emp, error: empErr } = await supabaseAdmin
    .from('employees')
    .select('id, name, date_of_joining')
    .eq('id', requestRow.employee_id)
    .maybeSingle();
  if (empErr) throw empErr;

  let maxAllowedDoj = null;
  let unlockExpiresAt = null;
  if (decision === 'APPROVED') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(maxAllowedDojRaw)) {
      return {
        ok: false,
        status: 400,
        error: 'max_allowed_doj is required (YYYY-MM-DD) when approving.'
      };
    }
    const d = new Date(`${maxAllowedDojRaw}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) {
      return { ok: false, status: 400, error: 'max_allowed_doj is not a valid date.' };
    }
    maxAllowedDoj = maxAllowedDojRaw;
    const currentDoj = String(emp?.date_of_joining ?? '').trim();
    if (!currentDoj) {
      return { ok: false, status: 400, error: 'Employee has no current date of joining.' };
    }
    if (maxAllowedDoj <= currentDoj) {
      return {
        ok: false,
        status: 400,
        error: `max_allowed_doj must be after the current DOJ (${currentDoj}).`
      };
    }
    unlockExpiresAt = unlockExpiresAtFromNow();
  }

  const now = new Date().toISOString();
  const { data: updatedReq, error: upReqErr } = await supabaseAdmin
    .from('doj_extend_requests')
    .update({
      status: decision,
      reviewed_by: req.user.id,
      reviewed_at: now,
      review_note: reviewNote,
      max_allowed_doj: maxAllowedDoj,
      unlock_expires_at: unlockExpiresAt,
      pm_acked_at: null,
      updated_at: now
    })
    .eq('id', requestId)
    .eq('status', 'PENDING')
    .select('*')
    .maybeSingle();
  if (upReqErr) throw upReqErr;
  if (!updatedReq) {
    return { ok: false, status: 409, error: 'Request was already reviewed.' };
  }

  if (decision === 'APPROVED') {
    const { error: unlockErr } = await supabaseAdmin
      .from('employees')
      .update({
        doj_extend_unlock: true,
        doj_extend_max_date: maxAllowedDoj,
        doj_extend_unlock_expires_at: unlockExpiresAt
      })
      .eq('id', requestRow.employee_id);
    if (unlockErr) throw unlockErr;
  }

  await logOrgActivityFromReq(req, {
    action: decision === 'APPROVED' ? 'DOJ_EXTEND_APPROVED' : 'DOJ_EXTEND_REJECTED',
    entityType: 'employee',
    entityId: requestRow.employee_id,
    clientId: requestRow.client_id,
    summary:
      decision === 'APPROVED'
        ? `Approved Extend DOJ for ${emp?.name || requestRow.employee_id} (max ${maxAllowedDoj})`
        : `Rejected Extend DOJ for ${emp?.name || requestRow.employee_id}`,
    metadata: {
      request_id: requestId,
      decision,
      review_note: reviewNote,
      date_of_joining: emp?.date_of_joining ?? null,
      max_allowed_doj: maxAllowedDoj,
      unlock_expires_at: unlockExpiresAt
    }
  });

  return { ok: true, request: updatedReq };
}

/**
 * Perform joining status change review. Caller must already authorize the reviewer.
 */
export async function reviewJoiningStatusChangeRequest(req, requestId, body = {}) {
  const decision = String(body?.decision ?? '').trim().toUpperCase();
  const reviewNote = String(body?.note ?? body?.review_note ?? '').trim() || null;

  if (!['APPROVED', 'REJECTED'].includes(decision)) {
    return { ok: false, status: 400, error: 'decision must be APPROVED or REJECTED.' };
  }

  const { data: requestRow, error: reqErr } = await supabaseAdmin
    .from('joining_status_change_requests')
    .select('*')
    .eq('id', requestId)
    .maybeSingle();
  if (reqErr) throw reqErr;
  if (!requestRow) return { ok: false, status: 404, error: 'Request not found.' };
  if (requestRow.status !== 'PENDING') {
    return { ok: false, status: 400, error: 'Only PENDING requests can be reviewed.' };
  }

  const unlockExpiresAt = decision === 'APPROVED' ? unlockExpiresAtFromNow() : null;
  const now = new Date().toISOString();
  const { data: updatedReq, error: upReqErr } = await supabaseAdmin
    .from('joining_status_change_requests')
    .update({
      status: decision,
      reviewed_by: req.user.id,
      reviewed_at: now,
      review_note: reviewNote,
      unlock_expires_at: unlockExpiresAt,
      pm_acked_at: null,
      updated_at: now
    })
    .eq('id', requestId)
    .eq('status', 'PENDING')
    .select('*')
    .maybeSingle();
  if (upReqErr) throw upReqErr;
  if (!updatedReq) {
    return { ok: false, status: 409, error: 'Request was already reviewed.' };
  }

  if (decision === 'APPROVED') {
    const { error: unlockErr } = await supabaseAdmin
      .from('employees')
      .update({
        joining_status_unlock: true,
        joining_status_unlock_expires_at: unlockExpiresAt
      })
      .eq('id', requestRow.employee_id);
    if (unlockErr) throw unlockErr;
  }

  const { data: emp } = await supabaseAdmin
    .from('employees')
    .select('name, joining_status')
    .eq('id', requestRow.employee_id)
    .maybeSingle();

  await logOrgActivityFromReq(req, {
    action:
      decision === 'APPROVED'
        ? 'JOINING_STATUS_CHANGE_APPROVED'
        : 'JOINING_STATUS_CHANGE_REJECTED',
    entityType: 'employee',
    entityId: requestRow.employee_id,
    clientId: requestRow.client_id,
    summary:
      decision === 'APPROVED'
        ? `Approved joining status change unlock for ${emp?.name || requestRow.employee_id}`
        : `Rejected joining status change unlock for ${emp?.name || requestRow.employee_id}`,
    metadata: {
      request_id: requestId,
      decision,
      review_note: reviewNote,
      joining_status: emp?.joining_status ?? null,
      unlock_expires_at: unlockExpiresAt
    }
  });

  return { ok: true, request: updatedReq };
}
