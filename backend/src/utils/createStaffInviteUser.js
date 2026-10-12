import { supabaseAdmin } from '../supabase.js';
import { invokeResendEmail } from './sendEmail.js';
import { logMailSendEvents } from './mailSendEvents.js';
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

  const inviteEmailSent = await sendStaffInviteEmail({
    rawToken,
    email,
    name: placeholderName,
    roleLabel,
    logLabel,
    warnLabel,
    sendKind: 'send',
    actorUserId: invitedBy,
    targetUserId: profile.id
  });

  return {
    id: profile.id,
    email: profile.email,
    invite_email_sent: inviteEmailSent
  };
}

async function sendStaffInviteEmail({
  rawToken,
  email,
  name,
  roleLabel,
  logLabel,
  warnLabel,
  sendKind = 'send',
  actorUserId = null,
  targetUserId = null
}) {
  const setPasswordLink = buildSetPasswordLink(rawToken);
  const mail = buildInviteEmail({ setPasswordLink, roleLabel });
  const sendResult = await invokeResendEmail({
    toEmail: email,
    toName: name,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    logLabel
  });

  if (sendResult?.ok === false && !sendResult?.skipped) {
    console.warn(`[${warnLabel}] invite email failed`, sendResult.error);
  }

  let status = 'failed';
  let error = null;
  if (sendResult?.ok) {
    status = 'sent';
  } else if (sendResult?.skipped) {
    status = 'skipped';
    error = String(sendResult?.reason || 'skipped');
  } else {
    error = String(sendResult?.error || 'Email send failed');
  }

  await logMailSendEvents([
    {
      mail_type: 'staff_invite',
      send_kind: sendKind === 'resend' ? 'resend' : 'send',
      status,
      recipient_email: email,
      recipient_name: name || null,
      actor_user_id: actorUserId || null,
      target_user_id: targetUserId || null,
      error
    }
  ]);

  return Boolean(sendResult?.ok);
}

/**
 * Replace the user's unused invite with a fresh token + expiry and email the new link.
 * The previous link stops working because its token hash is overwritten.
 * @returns {{ invite_email_sent: boolean, expires_at: string }}
 * @throws {{ status: number, message: string }} when there is no unused invite to resend
 */
export async function resendStaffInvite({
  user,
  invitedBy = null,
  roleLabel,
  logLabel = 'staff-invite-resend-email',
  warnLabel = 'staff-invite-resend'
}) {
  const rawToken = generateRawToken();
  const nowIso = new Date().toISOString();
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();

  const { data: updated, error } = await supabaseAdmin
    .from('staff_account_invites')
    .update({
      token_hash: hashToken(rawToken),
      expires_at: expiresAt,
      invited_by: invitedBy,
      created_at: nowIso
    })
    .eq('user_id', user.id)
    .is('consumed_at', null)
    .select('id');
  if (error) throw error;
  if (!updated?.length) {
    const err = new Error('This user has already set up their account, so there is no invite to resend.');
    err.status = 409;
    throw err;
  }

  const inviteEmailSent = await sendStaffInviteEmail({
    rawToken,
    email: user.email,
    name: user.name,
    roleLabel,
    logLabel,
    warnLabel,
    sendKind: 'resend',
    actorUserId: invitedBy,
    targetUserId: user.id
  });

  return { invite_email_sent: inviteEmailSent, expires_at: expiresAt };
}
