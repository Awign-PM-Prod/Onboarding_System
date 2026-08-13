import crypto from 'crypto';

const FRONTEND_URL =
  String(process.env.FRONTEND_URL || 'http://localhost:8088').trim() || 'http://localhost:8088';

export function hashToken(rawToken) {
  return crypto.createHash('sha256').update(String(rawToken), 'utf8').digest('hex');
}

export function generateRawToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export function generateRandomPassword() {
  return crypto.randomBytes(32).toString('base64url');
}

export function placeholderNameFromEmail(email, roleLabel = 'Program Manager') {
  const local = String(email || '')
    .split('@')[0]
    .trim();
  return local || roleLabel;
}

export function buildSetPasswordLink(rawToken) {
  try {
    const url = new URL('/set-password', FRONTEND_URL);
    url.searchParams.set('token', rawToken);
    return url.toString();
  } catch {
    const base = FRONTEND_URL.replace(/\/+$/, '');
    return `${base}/set-password?token=${encodeURIComponent(rawToken)}`;
  }
}

export function buildLoginLink() {
  try {
    return new URL('/login', FRONTEND_URL).toString();
  } catch {
    return `${FRONTEND_URL.replace(/\/+$/, '')}/login`;
  }
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildInviteEmail({ setPasswordLink, roleLabel = 'Program Manager' }) {
  const link = String(setPasswordLink || '');
  const label = String(roleLabel || 'Program Manager').trim() || 'Program Manager';
  const subject = 'Set up your Awign account';
  const text = [
    `You have been invited to Awign as a ${label}.`,
    '',
    'Click the link below to set your name and password:',
    link,
    '',
    'This link expires in 7 days. If you did not expect this email, you can ignore it.'
  ].join('\n');
  const html = `
    <p>You have been invited to Awign as a ${escapeHtml(label)}.</p>
    <p><a href="${escapeHtml(link)}">Set up your account</a></p>
    <p style="color:#64748b;font-size:13px;">This link expires in 7 days. If you did not expect this email, you can ignore it.</p>
  `.trim();
  return { subject, html, text };
}

export function buildPasswordResetEmail({ name, password, loginLink }) {
  const subject = 'Your Awign password was reset';
  const displayName = String(name || 'there').trim() || 'there';
  const login = String(loginLink || '');
  const pwd = String(password || '');
  const text = [
    `Hi ${displayName},`,
    '',
    'Your Awign password was reset by Super Admin.',
    '',
    `New password: ${pwd}`,
    '',
    `Sign in: ${login}`,
    '',
    'Please change this password after signing in if your organization requires it.'
  ].join('\n');
  const html = `
    <p>Hi ${escapeHtml(displayName)},</p>
    <p>Your Awign password was reset by Super Admin.</p>
    <p><strong>New password:</strong> <code>${escapeHtml(pwd)}</code></p>
    <p><a href="${escapeHtml(login)}">Sign in to Awign</a></p>
  `.trim();
  return { subject, html, text };
}

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
