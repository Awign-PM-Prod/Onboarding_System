import { Router } from 'express';
import { requireRole } from '../middleware/requireRole.js';
import { listHolidayCalendars } from '../utils/holidayCalendar.js';

const router = Router();

router.use(requireRole(['PAYROLL_LEAD', 'SUPER_ADMIN']));

// GET /api/holiday-calendars?year=&state=
router.get('/', async (req, res, next) => {
  try {
    const yearRaw = req.query.year;
    if (yearRaw === undefined || yearRaw === null || String(yearRaw).trim() === '') {
      return res.status(400).json({ error: 'year is required' });
    }
    const stateRaw = req.query.state;
    const items = await listHolidayCalendars({
      year: String(yearRaw),
      state: stateRaw !== undefined && stateRaw !== null && String(stateRaw).trim() !== ''
        ? String(stateRaw)
        : undefined
    });
    res.json(items);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

export default router;
