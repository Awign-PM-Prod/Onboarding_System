import { Router } from 'express';
import { supabaseAdmin } from '../supabase.js';
import { requireRole } from '../middleware/requireRole.js';
import { createStaffInviteUser } from '../utils/createStaffInviteUser.js';
import { filterUsersWithCompletedSetup } from '../utils/staffInvite.js';

const router = Router();

router.get('/', async (_req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('id, name, email')
      .eq('role', 'PROGRAM_MANAGER')
      .order('name', { ascending: true });
    if (error) throw error;
    // Hide invited PMs until they finish set-password / name setup.
    res.json(await filterUsersWithCompletedSetup(data ?? []));
  } catch (err) {
    next(err);
  }
});

router.post('/', requireRole(['PAYROLL_LEAD', 'SUPER_ADMIN']), async (req, res, next) => {
  try {
    const result = await createStaffInviteUser({
      email: req.body?.email,
      role: 'PROGRAM_MANAGER',
      invitedBy: req.user?.id ?? null,
      roleLabel: 'Program Manager',
      logLabel: 'pm-invite-email',
      warnLabel: 'program-managers'
    });
    res.status(201).json(result);
  } catch (err) {
    if (err?.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
});

export default router;
