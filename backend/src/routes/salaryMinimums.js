import { Router } from 'express';
import { supabaseAdmin } from '../supabase.js';
import { requireRole } from '../middleware/requireRole.js';
import { normalizeIndianState } from '../utils/indianStates.js';
import { normalizeSkillLevel, normalizeWageZone } from '../utils/wageConfig.js';

const router = Router();

// Readable by PM / PL (Role Details autofill) and Super Admin.
router.use(requireRole(['PROGRAM_MANAGER', 'PAYROLL_LEAD', 'SUPER_ADMIN']));

// GET /api/salary-minimums/:state?zone=&skill_level=
router.get('/:state', async (req, res, next) => {
  try {
    const state = normalizeIndianState(decodeURIComponent(req.params.state));
    if (!state) {
      return res.status(400).json({ error: 'Invalid Indian state/UT' });
    }

    const zoneRaw = req.query.zone;
    const zone = zoneRaw === undefined || zoneRaw === null || zoneRaw === ''
      ? 'zone1'
      : normalizeWageZone(zoneRaw);
    if (!zone) {
      return res.status(400).json({ error: 'Invalid zone (expected zone1, zone2, or zone3)' });
    }

    const skillRaw = req.query.skill_level;
    const skill_level = skillRaw === undefined || skillRaw === null || skillRaw === ''
      ? 'UNSKILLED'
      : normalizeSkillLevel(skillRaw);
    if (!skill_level) {
      return res.status(400).json({
        error: 'Invalid skill_level (expected SKILLED, SEMI_SKILLED, or UNSKILLED)'
      });
    }

    const { data, error } = await supabaseAdmin
      .from('state_wage_minimums')
      .select('state, zone, skill_level, min_monthly_ctc, updated_at')
      .eq('state', state)
      .eq('zone', zone)
      .eq('skill_level', skill_level)
      .maybeSingle();
    if (error) throw error;

    res.json({
      state,
      zone,
      skill_level,
      min_monthly_ctc: data ? Number(data.min_monthly_ctc) : null,
      updated_at: data?.updated_at ?? null
    });
  } catch (err) {
    next(err);
  }
});

export default router;
