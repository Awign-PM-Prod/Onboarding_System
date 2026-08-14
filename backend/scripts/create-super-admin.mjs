/**
 * Bootstrap a SUPER_ADMIN Auth user + public.users row.
 *
 * Usage (from backend/):
 *   node scripts/create-super-admin.mjs
 *   node scripts/create-super-admin.mjs --email you@company.com --name "Your Name" --password 'secret'
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in backend/.env
 * and migration 20260805200000_super_admin_salary_activity.sql applied.
 */
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

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--email') out.email = argv[++i];
    else if (a === '--name') out.name = argv[++i];
    else if (a === '--password') out.password = argv[++i];
    else if (a === '--id') out.id = argv[++i];
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));

const SUPER_ADMIN_ID = args.id || '66666666-6666-6666-6666-666666666666';
const SUPER_ADMIN_EMAIL = (args.email || 'superadmin@test.com').trim().toLowerCase();
const SUPER_ADMIN_NAME = (args.name || 'Demo Super Admin').trim();
const PASSWORD = args.password || '123456';

if (PASSWORD.length < 6) {
  console.error('Password must be at least 6 characters');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function findAuthUserByEmail(email) {
  // Paginate lightly; demo projects are small.
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const users = data?.users ?? [];
    const hit = users.find((u) => String(u.email ?? '').toLowerCase() === email);
    if (hit) return hit;
    if (users.length < 200) break;
  }
  return null;
}

async function run() {
  console.log(`Creating SUPER_ADMIN: ${SUPER_ADMIN_EMAIL}`);

  let authUserId = SUPER_ADMIN_ID;
  const byId = await admin.auth.admin.getUserById(SUPER_ADMIN_ID);
  if (byId?.data?.user) {
    authUserId = byId.data.user.id;
    console.log('  auth user already exists by id');
  } else {
    const byEmail = await findAuthUserByEmail(SUPER_ADMIN_EMAIL);
    if (byEmail) {
      authUserId = byEmail.id;
      console.log('  auth user already exists by email');
    } else {
      const { data, error } = await admin.auth.admin.createUser({
        id: SUPER_ADMIN_ID,
        email: SUPER_ADMIN_EMAIL,
        password: PASSWORD,
        email_confirm: true,
        user_metadata: { name: SUPER_ADMIN_NAME }
      });
      if (error) throw new Error(`create auth user: ${error.message}`);
      authUserId = data.user.id;
      console.log('  auth user created');
    }
  }

  const { error: pwErr } = await admin.auth.admin.updateUserById(authUserId, {
    password: PASSWORD
  });
  if (pwErr) throw new Error(`update password: ${pwErr.message}`);
  console.log('  password updated');

  const { data: existingProfile, error: findErr } = await admin
    .from('users')
    .select('id, email, role')
    .eq('id', authUserId)
    .maybeSingle();
  if (findErr) throw findErr;

  if (existingProfile) {
    if (existingProfile.role !== 'SUPER_ADMIN') {
      const { error: upErr } = await admin
        .from('users')
        .update({ role: 'SUPER_ADMIN', name: SUPER_ADMIN_NAME, email: SUPER_ADMIN_EMAIL })
        .eq('id', authUserId);
      if (upErr) throw new Error(`update profile role: ${upErr.message}`);
      console.log(`  profile updated to SUPER_ADMIN (was ${existingProfile.role})`);
    } else {
      console.log('  profile already SUPER_ADMIN');
    }
  } else {
    const { error: insErr } = await admin.from('users').insert({
      id: authUserId,
      name: SUPER_ADMIN_NAME,
      email: SUPER_ADMIN_EMAIL,
      role: 'SUPER_ADMIN'
    });
    if (insErr) throw new Error(`insert profile: ${insErr.message}`);
    console.log('  profile created with role SUPER_ADMIN');
  }

  console.log('\nDone. Login with:');
  console.log(`  Email:    ${SUPER_ADMIN_EMAIL}`);
  console.log(`  Password: ${PASSWORD}`);
  console.log('  Route:    /super-admin/dashboard');
}

run().catch((err) => {
  console.error('\nFailed:', err.message || err);
  if (/SUPER_ADMIN|users_role_check/i.test(String(err.message || ''))) {
    console.error('Hint: apply migration 20260805200000_super_admin_salary_activity.sql first.');
  }
  process.exit(1);
});
