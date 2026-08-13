import { supabaseAdmin } from '../supabase.js';
import { invokeResendEmail } from './sendEmail.js';
import {
  INVITE_TTL_MS,
  buildInviteEmail,
  buildSetPasswordLink,
  generateRandomPassword,
  generateRawToken,
  hashToken,
  placeholderNameFromEmail
} from './staffInvite.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Create auth user + profile + invite token and send set-password email.
 * @returns {{ id: string, email: string, invite_email_sent: boolean }}
 * @throws {{ status: number, message: string }} for known client errors
 */
export async function createStaffInviteUser({
  email: rawEmail,
  role,
  invitedBy = null,
  roleLabel = 'Program Manager',
  logLabel = 'staff-invite-email',
  warnLabel = 'staff-invite'
}) {
  const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';

  if (!email || !EMAIL_RE.test(email)) {
    const err = new Error('A valid email is required');
    err.status = 400;
    throw err;
  }

  if (!role) {
    const err = new Error('role is required');
    err.status = 400;
    throw err;
  }

  const { data: existing, error: existingErr } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('email', email)
    .maybeSingle();
  if (existingErr) throw existingErr;
  if (existing) {
    const err = new Error('A user with this email already exists');
    err.status = 409;
    throw err;
  }

  const placeholderName = placeholderNameFromEmail(email, roleLabel);
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
      const err = new Error('A user with this email already exists');
      err.status = 409;
      throw err;
    }
    throw authErr;
  }

  const authUser = authData?.user;
  if (!authUser?.id) {
    const err = new Error('Auth user was not created');
    err.status = 500;
    throw err;
  }

  const { data: profile, error: profileErr } = await supabaseAdmin
    .from('users')
    .insert({
      id: authUser.id,
      name: placeholderName,
      email,
      role
    })
    .select('id, email')
    .single();

  if (profileErr) {
    await supabaseAdmin.auth.admin.deleteUser(authUser.id);
    if (profileErr.code === '23505') {
      const err = new Error('A user with this email already exists');
      err.status = 409;
      throw err;
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
    invited_by: invitedBy
  });

  if (inviteErr) {
    await supabaseAdmin.from('users').delete().eq('id', authUser.id);
    await supabaseAdmin.auth.admin.deleteUser(authUser.id);
    throw inviteErr;
  }

  const setPasswordLink = buildSetPasswordLink(rawToken);
  const mail = buildInviteEmail({ setPasswordLink, roleLabel });
  const sendResult = await invokeResendEmail({
    toEmail: email,
    toName: placeholderName,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    logLabel
  });

  if (sendResult?.ok === false && !sendResult?.skipped) {
    console.warn(`[${warnLabel}] invite email failed`, sendResult.error);
  }

  return {
    id: profile.id,
    email: profile.email,
    invite_email_sent: Boolean(sendResult?.ok)
  };
}
