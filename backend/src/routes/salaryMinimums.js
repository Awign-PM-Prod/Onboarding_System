import { Router } from 'express';
import { supabaseAdmin } from '../supabase.js';
import { requireRole } from '../middleware/requireRole.js';
import { normalizeIndianState } from '../utils/indianStates.js';

const router = Router();

// Readable by PM (Role Details autofill) and Super Admin.
router.use(requireRole(['PROGRAM_MANAGER', 'SUPER_ADMIN']));

// GET /api/salary-minimums/:state
router.get('/:state', async (req, res, next) => {
  try {
    const state = normalizeIndianState(decodeURIComponent(req.params.state));
    if (!state) {
      return res.status(400).json({ error: 'Invalid Indian state/UT' });
    }

    const { data, error } = await supabaseAdmin
      .from('state_salary_minimums')
      .select('state, min_monthly_ctc, updated_at')
      .eq('state', state)
      .maybeSingle();
    if (error) throw error;

    res.json({
      state,
      min_monthly_ctc: data ? Number(data.min_monthly_ctc) : null,
      updated_at: data?.updated_at ?? null
    });
  } catch (err) {
    next(err);
  }
});

export default router;
