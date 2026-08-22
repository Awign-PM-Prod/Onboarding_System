import { Router } from 'express';
import { requireRole } from '../middleware/requireRole.js';
import { listHolidayCalendarDefs, listHolidayCalendars } from '../utils/holidayCalendar.js';

const router = Router();

router.use(requireRole(['PAYROLL_LEAD', 'SUPER_ADMIN']));

// GET /api/holiday-calendars/defs?for_client_id=
router.get('/defs', async (req, res, next) => {
  try {
    const forClientId = req.query.for_client_id ?? req.query.forClientId ?? null;
    const items = await listHolidayCalendarDefs({
      forClientId: forClientId ? String(forClientId) : null
    });
    res.json(items);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

// GET /api/holiday-calendars?year=&state=&calendar_id=
router.get('/', async (req, res, next) => {
  try {
    const yearRaw = req.query.year;
    const calendarRaw = req.query.calendar_id ?? req.query.calendarId;
    const stateRaw = req.query.state;
    const items = await listHolidayCalendars({
      calendarId: calendarRaw !== undefined && calendarRaw !== null && String(calendarRaw).trim() !== ''
        ? String(calendarRaw)
        : undefined,
      year: yearRaw !== undefined && yearRaw !== null && String(yearRaw).trim() !== ''
        ? String(yearRaw)
        : undefined,
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
