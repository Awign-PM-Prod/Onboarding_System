import './loadEnv.js';
import express from 'express';
import cors from 'cors';

import { requireAuth } from './middleware/requireAuth.js';
import authRouter from './routes/auth.js';
import programManagersRouter from './routes/programManagers.js';
import clientsRouter from './routes/clients.js';
import meRouter from './routes/me.js';
import pmClientsRouter from './routes/pmClients.js';
import pmAlertsRouter from './routes/pmAlerts.js';
import employeesRouter from './routes/employees.js';
import publicOnboardingRouter from './routes/publicOnboarding.js';
import publicStaffAuthRouter from './routes/publicStaffAuth.js';
import payrollHeadRouter from './routes/payrollHead.js';
import superAdminRouter from './routes/superAdmin.js';
import salaryMinimumsRouter from './routes/salaryMinimums.js';
import regionZonesRouter from './routes/regionZones.js';
import holidayCalendarsRouter from './routes/holidayCalendars.js';
import leaveConfigsRouter from './routes/leaveConfigs.js';
import attendanceRouter from './routes/attendance.js';
import { startSupabaseKeepAlive } from './jobs/supabaseKeepAlive.js';

const app = express();

function parseCorsOrigin(value) {
  const origins = String(value || 'http://localhost:8088')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return origins.length === 1 ? origins[0] : origins;
}

app.use(cors({ origin: parseCorsOrigin(process.env.CORS_ORIGIN) }));
app.use(express.json());

app.get('/', (_req, res) =>
  res.json({
    ok: true,
    service: 'onboarding-system-api',
    health: '/health',
  }),
);

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/api/auth', authRouter);
app.use('/api/me', requireAuth, meRouter);
app.use('/api/program-managers', requireAuth, programManagersRouter);
app.use('/api/clients/:clientId/attendance', requireAuth, attendanceRouter);
app.use('/api/clients', requireAuth, clientsRouter);
app.use('/api/pm/clients', requireAuth, pmClientsRouter);
app.use('/api/pm/alerts', requireAuth, pmAlertsRouter);
app.use('/api/employees', requireAuth, employeesRouter);
app.use('/api/public/onboarding', publicOnboardingRouter);
app.use('/api/public/staff-auth', publicStaffAuthRouter);
app.use('/api/admin', requireAuth, payrollHeadRouter);
app.use('/api/super-admin', requireAuth, superAdminRouter);
app.use('/api/salary-minimums', requireAuth, salaryMinimumsRouter);
app.use('/api/region-zones', requireAuth, regionZonesRouter);
app.use('/api/holiday-calendars', requireAuth, holidayCalendarsRouter);
app.use('/api/leave-configs', requireAuth, leaveConfigsRouter);

app.use((err, _req, res, _next) => {
  console.error('[api error]', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

const port = Number(process.env.PORT) || 8089;
app.listen(port, '0.0.0.0', () => {
  console.log(`API listening on http://0.0.0.0:${port} (GET / + /health)`);
  startSupabaseKeepAlive();
});
