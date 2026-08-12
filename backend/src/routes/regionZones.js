import { Router } from 'express';
import { supabaseAdmin } from '../supabase.js';
import { requireRole } from '../middleware/requireRole.js';
import { normalizeIndianState } from '../utils/indianStates.js';
import { logOrgActivityFromReq } from '../utils/orgActivityLog.js';
import { isSuperAdminRole } from '../utils/roleAccess.js';
import { normalizeRegionName, normalizeWageZone } from '../utils/wageConfig.js';

const router = Router();

function canManageRegionZones(role) {
  return role === 'PAYROLL_LEAD' || isSuperAdminRole(role);
}

// Readable by PM / PL (Role Details) and Super Admin.
router.use(requireRole(['PROGRAM_MANAGER', 'PAYROLL_LEAD', 'SUPER_ADMIN']));

// GET /api/region-zones?state=Maharashtra
// GET /api/region-zones — list all (PL + Super Admin only)
router.get('/', async (req, res, next) => {
  try {
    const stateRaw = req.query.state;
    const hasState = stateRaw !== undefined && stateRaw !== null && String(stateRaw).trim() !== '';

    if (!hasState) {
      if (!canManageRegionZones(req.user.role)) {
        return res.status(403).json({ error: 'Forbidden: requires role PAYROLL_LEAD or SUPER_ADMIN' });
      }
      const { data, error } = await supabaseAdmin
        .from('state_region_zones')
        .select('id, state, region, zone, updated_by, updated_at')
        .order('state', { ascending: true })
        .order('region', { ascending: true });
      if (error) throw error;
      return res.json(data ?? []);
    }

    const state = normalizeIndianState(String(stateRaw));
    if (!state) {
      return res.status(400).json({ error: 'Invalid Indian state/UT' });
    }

    const { data, error } = await supabaseAdmin
      .from('state_region_zones')
      .select('id, state, region, zone')
      .eq('state', state)
      .order('region', { ascending: true });
    if (error) throw error;

    res.json(data ?? []);
  } catch (err) {
    next(err);
  }
});

// PUT /api/region-zones — replace all regions for one state (PL + Super Admin)
// body: { state, items: [{ region, zone }] }
router.put('/', async (req, res, next) => {
  try {
    if (!canManageRegionZones(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden: requires role PAYROLL_LEAD or SUPER_ADMIN' });
    }

    const state = normalizeIndianState(req.body?.state);
    if (!state) {
      return res.status(400).json({ error: 'Valid state is required' });
    }

    const items = Array.isArray(req.body?.items) ? req.body.items : null;
    if (!items) {
      return res.status(400).json({ error: 'items array is required' });
    }

    const upserts = [];
    const errors = [];
    const seenRegions = new Set();

    for (const item of items) {
      const region = normalizeRegionName(item?.region);
      if (!region) {
        errors.push('region is required and must be non-empty');
        continue;
      }
      const regionKey = region.toLowerCase();
      if (seenRegions.has(regionKey)) {
        errors.push(`Duplicate region "${region}" for ${state}`);
        continue;
      }
      seenRegions.add(regionKey);

      const zone = normalizeWageZone(item?.zone);
      if (!zone) {
        errors.push(`Invalid zone for region "${region}" (expected zone1, zone2, or zone3)`);
        continue;
      }

      upserts.push({
        state,
        region,
        zone,
        updated_by: req.user.id,
        updated_at: new Date().toISOString()
      });
    }

    if (errors.length) {
      return res.status(400).json({ error: errors.join('; ') });
    }

    const { error: delError } = await supabaseAdmin
      .from('state_region_zones')
      .delete()
      .eq('state', state);
    if (delError) throw delError;

    let data = [];
    if (upserts.length) {
      const { data: inserted, error: insError } = await supabaseAdmin
        .from('state_region_zones')
        .insert(upserts)
        .select('id, state, region, zone, updated_by, updated_at');
      if (insError) throw insError;
      data = inserted ?? [];
    }

    await logOrgActivityFromReq(req, {
      action: 'REGION_ZONES_UPDATED',
      entityType: 'state_region_zones',
      summary: `Updated region→zone mapping for ${state} (${upserts.length} region(s))`,
      metadata: {
        state,
        items: upserts.map((u) => ({ region: u.region, zone: u.zone }))
      }
    });

    res.json(data);
  } catch (err) {
    next(err);
  }
});

export default router;
