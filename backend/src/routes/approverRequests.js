import { Router } from 'express';
import { supabaseAdmin } from '../supabase.js';
import { requireRole } from '../middleware/requireRole.js';
import {
  getRequestRouting,
  listDojExtendRequests,
  listJoiningStatusChangeRequests,
  reviewDojExtendRequest,
  reviewJoiningStatusChangeRequest
} from '../utils/changeRequestReview.js';

const router = Router();

router.use(requireRole(['PROGRAM_MANAGER']));

async function listClientIdsWhereUserIsApprover(userId) {
  const { data, error } = await supabaseAdmin
    .from('clients')
    .select('id')
    .eq('approver_pm_id', userId);
  if (error) throw error;
  return (data ?? []).map((c) => c.id);
}

function filterRoutedToCaller(rows, userId) {
  return (rows ?? []).filter(
    (r) => r.review_by_approver_pm && String(r.assigned_approver_pm_id) === String(userId)
  );
}

// GET /api/approver-requests/doj-extend-requests?status=PENDING
router.get('/doj-extend-requests', async (req, res, next) => {
  try {
    const statusFilter = String(req.query.status ?? 'PENDING').trim().toUpperCase() || 'PENDING';
    const clientIds = await listClientIdsWhereUserIsApprover(req.user.id);
    const rows = await listDojExtendRequests({ statusFilter, clientIds });
    return res.json({ requests: filterRoutedToCaller(rows, req.user.id) });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

// POST /api/approver-requests/doj-extend-requests/:id/review
router.post('/doj-extend-requests/:id/review', async (req, res, next) => {
  try {
    const requestId = String(req.params.id ?? '').trim();
    const { data: requestRow, error: reqErr } = await supabaseAdmin
      .from('doj_extend_requests')
      .select('*')
      .eq('id', requestId)
      .maybeSingle();
    if (reqErr) throw reqErr;
    if (!requestRow) return res.status(404).json({ error: 'Request not found.' });

    const routing = await getRequestRouting(requestRow);
    if (!routing.reviewByApproverPm || String(routing.approverPmId) !== String(req.user.id)) {
      return res.status(403).json({
        error: 'Not authorized to review this request. It is not assigned to you as Approver PM.'
      });
    }

    const result = await reviewDojExtendRequest(req, requestId, req.body || {});
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    return res.json({ request: result.request });
  } catch (err) {
    next(err);
  }
});

// GET /api/approver-requests/joining-status-change-requests?status=PENDING
router.get('/joining-status-change-requests', async (req, res, next) => {
  try {
    const statusFilter = String(req.query.status ?? 'PENDING').trim().toUpperCase() || 'PENDING';
    const clientIds = await listClientIdsWhereUserIsApprover(req.user.id);
    const rows = await listJoiningStatusChangeRequests({ statusFilter, clientIds });
    return res.json({ requests: filterRoutedToCaller(rows, req.user.id) });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

// POST /api/approver-requests/joining-status-change-requests/:id/review
router.post('/joining-status-change-requests/:id/review', async (req, res, next) => {
  try {
    const requestId = String(req.params.id ?? '').trim();
    const { data: requestRow, error: reqErr } = await supabaseAdmin
      .from('joining_status_change_requests')
      .select('*')
      .eq('id', requestId)
      .maybeSingle();
    if (reqErr) throw reqErr;
    if (!requestRow) return res.status(404).json({ error: 'Request not found.' });

    const routing = await getRequestRouting(requestRow);
    if (!routing.reviewByApproverPm || String(routing.approverPmId) !== String(req.user.id)) {
      return res.status(403).json({
        error: 'Not authorized to review this request. It is not assigned to you as Approver PM.'
      });
    }

    const result = await reviewJoiningStatusChangeRequest(req, requestId, req.body || {});
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    return res.json({ request: result.request });
  } catch (err) {
    next(err);
  }
});

export default router;
