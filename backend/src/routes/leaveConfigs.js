import { Router } from 'express';
import { requireRole } from '../middleware/requireRole.js';
import { listLeaveConfigDefs, listLeaveConfigRules } from '../utils/leaveConfig.js';

const router = Router();

router.use(requireRole(['PAYROLL_LEAD', 'SUPER_ADMIN']));

// GET /api/leave-configs/defs?for_client_id=
router.get('/defs', async (req, res, next) => {
  try {
    const forClientId = req.query.for_client_id ?? req.query.forClientId ?? null;
    const items = await listLeaveConfigDefs({
      forClientId: forClientId ? String(forClientId) : null
    });
    res.json(items);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

// GET /api/leave-configs?state=&config_id=&leave_type=
router.get('/', async (req, res, next) => {
  try {
    const configRaw = req.query.config_id ?? req.query.configId;
    const stateRaw = req.query.state;
    const typeRaw = req.query.leave_type ?? req.query.leaveType;
    const items = await listLeaveConfigRules({
      configId: configRaw !== undefined && configRaw !== null && String(configRaw).trim() !== ''
        ? String(configRaw)
        : undefined,
      state: stateRaw !== undefined && stateRaw !== null && String(stateRaw).trim() !== ''
        ? String(stateRaw)
        : undefined,
      leaveType: typeRaw !== undefined && typeRaw !== null && String(typeRaw).trim() !== ''
        ? String(typeRaw)
        : undefined
    });
    res.json(items);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

export default router;
