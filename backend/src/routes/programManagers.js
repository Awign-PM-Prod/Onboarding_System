import { Router } from 'express';
import { supabaseAdmin } from '../supabase.js';
import { requireRole } from '../middleware/requireRole.js';

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.get('/', async (_req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('id, name, email')
      .eq('role', 'PROGRAM_MANAGER')
      .order('name', { ascending: true });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.post('/', requireRole(['PAYROLL_LEAD', 'SUPER_ADMIN']), async (req, res, next) => {
  try {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }
    if (!email || !EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'A valid email is required' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const { data: existing, error: existingErr } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();
    if (existingErr) throw existingErr;
    if (existing) {
      return res.status(409).json({ error: 'A user with this email already exists' });
    }

    const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name }
    });
    if (authErr) {
      const msg = authErr.message || 'Could not create auth user';
      if (/already|registered|exists/i.test(msg)) {
        return res.status(409).json({ error: 'A user with this email already exists' });
      }
      throw authErr;
    }

    const authUser = authData?.user;
    if (!authUser?.id) {
      return res.status(500).json({ error: 'Auth user was not created' });
    }

    const { data: profile, error: profileErr } = await supabaseAdmin
      .from('users')
      .insert({
        id: authUser.id,
        name,
        email,
        role: 'PROGRAM_MANAGER'
      })
      .select('id, name, email')
      .single();

    if (profileErr) {
      await supabaseAdmin.auth.admin.deleteUser(authUser.id);
      if (profileErr.code === '23505') {
        return res.status(409).json({ error: 'A user with this email already exists' });
      }
      throw profileErr;
    }

    res.status(201).json(profile);
  } catch (err) {
    next(err);
  }
});

export default router;
