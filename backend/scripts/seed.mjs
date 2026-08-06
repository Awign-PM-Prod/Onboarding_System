import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';

const here = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(here, '../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in backend/.env');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const PM_RAHUL  = '11111111-1111-1111-1111-111111111111';
const PM_PRIYA  = '22222222-2222-2222-2222-222222222222';
const PM_AMIT   = '33333333-3333-3333-3333-333333333333';
const PAYROLL_LEAD_ID = '44444444-4444-4444-4444-444444444444';
const PAYROLL_HEAD_ID = '55555555-5555-5555-5555-555555555555';
const SUPER_ADMIN_ID = '66666666-6666-6666-6666-666666666666';
const PAYROLL_LEAD_EMAIL = 'payrolllead@test.com';
const PAYROLL_HEAD_EMAIL = 'payrollhead@test.com';
const SUPER_ADMIN_EMAIL = 'superadmin@test.com';
const DEMO_PASSWORD = '123456';

const programManagers = [
  { id: PM_RAHUL, name: 'Rahul Sharma', email: 'rahul.pm@test.com',  role: 'PROGRAM_MANAGER' },
  { id: PM_PRIYA, name: 'Priya Mehta',  email: 'priya.pm@test.com',  role: 'PROGRAM_MANAGER' },
  { id: PM_AMIT,  name: 'Amit Verma',   email: 'amit.pm@test.com',   role: 'PROGRAM_MANAGER' }
];

const demoClients = [
  {
    client_name: 'Acme Logistics',
    contract_code: 'ACM-001',
    contract_start_date: '2026-05-01',
    contract_end_date: '2027-04-30',
    program_manager_id: PM_RAHUL,
    insurance_applicable: true,
    insurance_name: 'ICICI Lombard',
    insurance_amount: 500,
    designations: ['Field Executive', 'Team Lead', 'Supervisor']
  },
  {
    client_name: 'BluePeak Retail',
    contract_code: 'BPR-014',
    contract_start_date: '2026-06-15',
    contract_end_date: '2027-06-14',
    program_manager_id: PM_PRIYA,
    insurance_applicable: false,
    insurance_name: null,
    insurance_amount: null,
    designations: ['Data Entry Operator', 'Quality Analyst']
  },
  {
    client_name: 'Demo-Project',
    contract_code: 'ATT-TEST',
    contract_start_date: '2026-01-01',
    contract_end_date: '2027-12-31',
    program_manager_id: PM_RAHUL,
    insurance_applicable: false,
    insurance_name: null,
    insurance_amount: null,
    designations: ['Engineer', 'Operator', 'Inspector', 'Supervisor']
  }
];

// 5 employees for Acme Logistics (PM = Rahul): 3 pending, 2 in progress.
const demoEmployees = [
  { name: 'Anita Rao',       mobile: '9900011122', email: 'anita.rao@acme.test',    emp_code: 'T016394', designation: 'Field Executive', date_of_joining: '2026-05-05', ctc_type: 'MONTHLY', ctc_value: 35000, onboarding_initiated: false, onboarding_status: 'PENDING' },
  { name: 'Vikram Desai',    mobile: '9900011123', email: 'vikram.desai@acme.test', emp_code: 'T016395', designation: 'Field Executive', date_of_joining: '2026-05-06', ctc_type: 'MONTHLY', ctc_value: 33000, onboarding_initiated: false, onboarding_status: 'PENDING' },
  { name: 'Neha Kulkarni',   mobile: '9900011124', email: 'neha.k@acme.test',       emp_code: 'T016396', designation: 'Supervisor',      date_of_joining: '2026-05-08', ctc_type: 'ANNUAL',  ctc_value: 720000, onboarding_initiated: false, onboarding_status: 'PENDING' },
  { name: 'Ravi Iyer',       mobile: '9900011125', email: 'ravi.iyer@acme.test',    emp_code: 'T016397', designation: 'Team Lead',       date_of_joining: '2026-04-20', ctc_type: 'ANNUAL',  ctc_value: 900000, onboarding_initiated: true,  onboarding_status: 'FORM_SENT' },
  { name: 'Sana Kapoor',     mobile: '9900011126', email: 'sana.kapoor@acme.test',  emp_code: 'T016398', designation: 'Team Lead',       date_of_joining: '2026-04-22', ctc_type: 'ANNUAL',  ctc_value: 850000, onboarding_initiated: true,  onboarding_status: 'FORM_SENT' }
];

const attendanceTestEmployees = [
  { name: 'Arjun Engineer',  mobile: '9900022201', email: 'arjun.engineer@att.test',  emp_code: 'ATT001', designation: 'Engineer',   date_of_joining: '2026-01-15', ctc_type: 'MONTHLY', ctc_value: 45000, onboarding_initiated: true, onboarding_status: 'JOINED' },
  { name: 'Meera Operator',  mobile: '9900022202', email: 'meera.operator@att.test',  emp_code: 'ATT002', designation: 'Operator',   date_of_joining: '2026-01-15', ctc_type: 'MONTHLY', ctc_value: 32000, onboarding_initiated: true, onboarding_status: 'JOINED' },
  { name: 'Kiran Inspector', mobile: '9900022203', email: 'kiran.inspector@att.test', emp_code: 'ATT003', designation: 'Inspector',  date_of_joining: '2026-01-15', ctc_type: 'MONTHLY', ctc_value: 38000, onboarding_initiated: true, onboarding_status: 'JOINED' },
  { name: 'Divya Supervisor', mobile: '9900022204', email: 'divya.supervisor@att.test', emp_code: 'ATT004', designation: 'Supervisor', date_of_joining: '2026-01-15', ctc_type: 'MONTHLY', ctc_value: 52000, onboarding_initiated: true, onboarding_status: 'JOINED' }
];

async function upsertUser(u) {
  const { error } = await admin.from('users').upsert(u, { onConflict: 'id' });
  if (error) throw new Error(`upsert user ${u.email}: ${error.message}`);
  console.log(`  user ready: ${u.email} (${u.role})`);
}

async function ensureAuthUser({ id, email, password, name }) {
  const { data: existing, error: getErr } = await admin.auth.admin.getUserById(id);
  if (getErr && getErr.status !== 404) throw getErr;
  if (existing?.user) {
    console.log(`  auth user already exists: ${email}`);
    return;
  }
  const { error } = await admin.auth.admin.createUser({
    id,
    email,
    password,
    email_confirm: true,
    user_metadata: { name }
  });
  if (error) throw new Error(`create auth user ${email}: ${error.message}`);
  console.log(`  auth user created: ${email}`);
}

async function ensureClientPolicy(clientId, designations) {
  const { data: existing, error: findErr } = await admin
    .from('client_attendance_policies')
    .select('client_id')
    .eq('client_id', clientId)
    .maybeSingle();
  if (findErr) throw findErr;

  if (!existing) {
    const { error: pErr } = await admin.from('client_attendance_policies').insert({
      client_id: clientId,
      payroll_cycle_start_day: 25,
      payroll_cycle_end_day: 24,
      week_off_config: { presets: ['all_sundays'], weekdays: [] },
      comp_off_applicable: true,
      comp_off_types: ['CO', 'PAID_CO'],
      comp_off_rule: 1,
      paid_comp_off_rule: 1,
      nh_comp_off_applicable: true,
      nh_off_rule: 2,
      nh_pay_rule: 1,
      fh_comp_off_applicable: true,
      fh_off_rule: 1.5,
      fh_pay_rule: 2
    });
    if (pErr) throw new Error(`insert policy for ${clientId}: ${pErr.message}`);
  }

  const { count, error: cErr } = await admin
    .from('client_leave_allowances')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId);
  if (cErr) throw cErr;
  if ((count ?? 0) === 0 && designations?.length) {
    const rows = designations.map((designation) => ({
      client_id: clientId,
      designation,
      sick_days: 6,
      paid_days: 12,
      maternity_days: 180,
      paternity_days: 15,
      earned_days: 18
    }));
    const { error: aErr } = await admin.from('client_leave_allowances').insert(rows);
    if (aErr) throw new Error(`insert leave allowances: ${aErr.message}`);
  }

  const { count: hCount, error: hErr } = await admin
    .from('client_holidays')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId);
  if (hErr) throw hErr;
  if ((hCount ?? 0) === 0) {
    const { error: hiErr } = await admin.from('client_holidays').insert([
      { client_id: clientId, holiday_date: '2026-04-03', holiday_type: 'NH' },
      { client_id: clientId, holiday_date: '2026-04-14', holiday_type: 'NH' }
    ]);
    if (hiErr) throw new Error(`insert holidays: ${hiErr.message}`);
  }
}

async function ensureClient(c) {
  const { data: existing, error: findErr } = await admin
    .from('clients')
    .select('id')
    .eq('contract_code', c.contract_code)
    .maybeSingle();
  if (findErr) throw findErr;

  if (existing) {
    console.log(`  client exists: ${c.contract_code}`);
    await ensureClientPolicy(existing.id, c.designations);
    return existing.id;
  }

  const { data: inserted, error: insertErr } = await admin
    .from('clients')
    .insert({
      client_name: c.client_name,
      contract_code: c.contract_code,
      contract_start_date: c.contract_start_date,
      contract_end_date: c.contract_end_date,
      program_manager_id: c.program_manager_id,
      insurance_applicable: c.insurance_applicable,
      insurance_name: c.insurance_name,
      insurance_amount: c.insurance_amount ?? null,
      created_by: PAYROLL_LEAD_ID
    })
    .select('id')
    .single();
  if (insertErr) throw new Error(`insert client ${c.contract_code}: ${insertErr.message}`);

  if (c.designations?.length) {
    const rows = c.designations.map(name => ({ client_id: inserted.id, name }));
    const { error: dErr } = await admin.from('designations').insert(rows);
    if (dErr) throw new Error(`insert designations for ${c.contract_code}: ${dErr.message}`);
  }
  await ensureClientPolicy(inserted.id, c.designations);
  console.log(`  client created: ${c.contract_code}`);
  return inserted.id;
}

async function ensureEmployeesForClient({ clientId, creatorId, employees }) {
  const { count, error: countErr } = await admin
    .from('employees')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId);
  if (countErr) throw countErr;
  if ((count ?? 0) > 0) {
    console.log(`  employees already present for client ${clientId} (${count} rows)`);
    // Backfill emp_code when missing (for attendance matching)
    for (const e of employees) {
      if (!e.emp_code || !e.mobile) continue;
      const { error: upErr } = await admin
        .from('employees')
        .update({ emp_code: e.emp_code })
        .eq('client_id', clientId)
        .eq('mobile', e.mobile)
        .is('emp_code', null);
      if (upErr) console.warn(`  emp_code backfill warn for ${e.mobile}: ${upErr.message}`);
    }
    return;
  }
  const rows = employees.map(e => ({ ...e, client_id: clientId, created_by: creatorId }));
  const { error } = await admin.from('employees').insert(rows);
  if (error) throw new Error(`insert employees: ${error.message}`);
  console.log(`  inserted ${rows.length} employees for client ${clientId}`);
}

async function run() {
  console.log('Seeding Program Managers (rows + auth users)...');
  for (const pm of programManagers) {
    await upsertUser(pm);
    await ensureAuthUser({
      id: pm.id,
      email: pm.email,
      password: DEMO_PASSWORD,
      name: pm.name
    });
  }

  console.log('Seeding Payroll Lead auth user + row...');
  await ensureAuthUser({
    id: PAYROLL_LEAD_ID,
    email: PAYROLL_LEAD_EMAIL,
    password: DEMO_PASSWORD,
    name: 'Demo Payroll Lead'
  });
  await upsertUser({
    id: PAYROLL_LEAD_ID,
    name: 'Demo Payroll Lead',
    email: PAYROLL_LEAD_EMAIL,
    role: 'PAYROLL_LEAD'
  });

  console.log('Seeding Payroll Head auth user + row...');
  await ensureAuthUser({
    id: PAYROLL_HEAD_ID,
    email: PAYROLL_HEAD_EMAIL,
    password: DEMO_PASSWORD,
    name: 'Demo Payroll Head'
  });
  await upsertUser({
    id: PAYROLL_HEAD_ID,
    name: 'Demo Payroll Head',
    email: PAYROLL_HEAD_EMAIL,
    role: 'PAYROLL_HEAD'
  });

  console.log('Seeding Super Admin auth user + row...');
  await ensureAuthUser({
    id: SUPER_ADMIN_ID,
    email: SUPER_ADMIN_EMAIL,
    password: DEMO_PASSWORD,
    name: 'Demo Super Admin'
  });
  await upsertUser({
    id: SUPER_ADMIN_ID,
    name: 'Demo Super Admin',
    email: SUPER_ADMIN_EMAIL,
    role: 'SUPER_ADMIN'
  });

  console.log('Seeding demo clients...');
  const clientIds = {};
  for (const c of demoClients) {
    clientIds[c.contract_code] = await ensureClient(c);
  }

  console.log('Seeding demo employees for Acme Logistics...');
  await ensureEmployeesForClient({
    clientId: clientIds['ACM-001'],
    creatorId: PM_RAHUL,
    employees: demoEmployees
  });

  console.log('Seeding employees for Demo-Project client...');
  await ensureEmployeesForClient({
    clientId: clientIds['ATT-TEST'],
    creatorId: PM_RAHUL,
    employees: attendanceTestEmployees
  });

  console.log('\nSeed complete. Demo logins (password: 123456):');
  console.log(`  Super Admin:      ${SUPER_ADMIN_EMAIL}`);
  console.log(`  Payroll Head:     ${PAYROLL_HEAD_EMAIL}`);
  console.log(`  Payroll Lead:     ${PAYROLL_LEAD_EMAIL}`);
  for (const pm of programManagers) {
    console.log(`  Program Manager:  ${pm.email}  (${pm.name})`);
  }
}

run().catch(err => {
  console.error('\nSeed failed:', err);
  process.exit(1);
});
