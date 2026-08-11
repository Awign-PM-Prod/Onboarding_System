import { Router } from 'express';
import { supabaseAdmin } from '../supabase.js';
import { requireRole } from '../middleware/requireRole.js';
import { invokeResendEmail } from '../utils/sendEmail.js';
import {
  INVITE_TTL_MS,
  buildInviteEmail,
  buildSetPasswordLink,
  generateRandomPassword,
  generateRawToken,
  hashToken,
  placeholderNameFromEmail
} from '../utils/staffInvite.js';

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
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';

    if (!email || !EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'A valid email is required' });
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

    const placeholderName = placeholderNameFromEmail(email);
    const tempPassword = generateRandomPassword();

    const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { name: placeholderName }
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
        name: placeholderName,
        email,
        role: 'PROGRAM_MANAGER'
      })
      .select('id, email')
      .single();

    if (profileErr) {
      await supabaseAdmin.auth.admin.deleteUser(authUser.id);
      if (profileErr.code === '23505') {
        return res.status(409).json({ error: 'A user with this email already exists' });
      }
      throw profileErr;
    }

    const rawToken = generateRawToken();
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();

    const { error: inviteErr } = await supabaseAdmin.from('staff_account_invites').insert({
      user_id: authUser.id,
      email,
      token_hash: tokenHash,
      expires_at: expiresAt,
      invited_by: req.user?.id ?? null
    });

    if (inviteErr) {
      await supabaseAdmin.from('users').delete().eq('id', authUser.id);
      await supabaseAdmin.auth.admin.deleteUser(authUser.id);
      throw inviteErr;
    }

    const setPasswordLink = buildSetPasswordLink(rawToken);
    const mail = buildInviteEmail({ setPasswordLink });
    const sendResult = await invokeResendEmail({
      toEmail: email,
      toName: placeholderName,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      logLabel: 'pm-invite-email'
    });

    if (sendResult?.ok === false && !sendResult?.skipped) {
      console.warn('[program-managers] invite email failed', sendResult.error);
    }

    res.status(201).json({
      id: profile.id,
      email: profile.email,
      invite_email_sent: Boolean(sendResult?.ok)
    });
  } catch (err) {
    next(err);
  }
});

export default router;
