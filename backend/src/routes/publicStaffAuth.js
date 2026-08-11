import { Router } from 'express';
import { supabaseAdmin } from '../supabase.js';
import { hashToken } from '../utils/staffInvite.js';

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STAFF_ROLES = ['PROGRAM_MANAGER', 'PAYROLL_LEAD'];

async function findValidInvite(rawToken) {
  const token = String(rawToken || '').trim();
  if (!token) return { error: 'Invite token is required.' };

  const tokenHash = hashToken(token);
  const { data: invite, error } = await supabaseAdmin
    .from('staff_account_invites')
    .select('id, user_id, email, expires_at, consumed_at')
    .eq('token_hash', tokenHash)
    .is('consumed_at', null)
    .maybeSingle();
  if (error) throw error;
  if (!invite) {
    return { error: 'This invite link is invalid or has already been used.' };
  }
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    return { error: 'This invite link has expired. Ask Super Admin or Payroll Lead to send a new invite.' };
  }
  return { invite };
}

// GET /api/public/staff-auth/invite?token=
router.get('/invite', async (req, res, next) => {
  try {
    const { invite, error } = await findValidInvite(req.query?.token);
    if (error) {
      return res.status(400).json({ error });
    }
    res.json({ email: invite.email });
  } catch (err) {
    next(err);
  }
});

// POST /api/public/staff-auth/set-password
router.post('/set-password', async (req, res, next) => {
  try {
    const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const confirmPassword =
      typeof req.body?.confirmPassword === 'string' ? req.body.confirmPassword : '';

    if (!name) {
      return res.status(400).json({ error: 'Name is required.' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match.' });
    }

    const { invite, error } = await findValidInvite(token);
    if (error) {
      return res.status(400).json({ error });
    }

    const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(invite.user_id, {
      password,
      user_metadata: { name }
    });
    if (authErr) {
      return res.status(400).json({ error: authErr.message || 'Could not set password.' });
    }

    const { error: profileErr } = await supabaseAdmin
      .from('users')
      .update({ name })
      .eq('id', invite.user_id);
    if (profileErr) throw profileErr;

    const { error: consumeErr } = await supabaseAdmin
      .from('staff_account_invites')
      .update({ consumed_at: new Date().toISOString() })
      .eq('id', invite.id)
      .is('consumed_at', null);
    if (consumeErr) throw consumeErr;

    res.json({ ok: true, email: invite.email });
  } catch (err) {
    next(err);
  }
});

// POST /api/public/staff-auth/forgot-password
router.post('/forgot-password', async (req, res, next) => {
  try {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';

    // Always return the same message (no email enumeration).
    const okBody = {
      ok: true,
      message:
        'If an account exists for that email, a password reset request was sent to Super Admin.'
    };

    if (!email || !EMAIL_RE.test(email)) {
      return res.json(okBody);
    }

    const { data: user, error: userErr } = await supabaseAdmin
      .from('users')
      .select('id, role')
      .eq('email', email)
      .maybeSingle();
    if (userErr) throw userErr;

    if (user && STAFF_ROLES.includes(user.role)) {
      const { data: existing, error: existingErr } = await supabaseAdmin
        .from('password_reset_requests')
        .select('id')
        .eq('user_id', user.id)
        .eq('status', 'PENDING')
        .maybeSingle();
      if (existingErr) throw existingErr;

      if (!existing) {
        const { error: insertErr } = await supabaseAdmin.from('password_reset_requests').insert({
          user_id: user.id,
          status: 'PENDING'
        });
        if (insertErr && insertErr.code !== '23505') throw insertErr;
      }
    }

    res.json(okBody);
  } catch (err) {
    next(err);
  }
});

export default router;
