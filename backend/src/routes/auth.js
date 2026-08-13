import { Router } from 'express';
import { createAuthClient, supabaseAdmin } from '../supabase.js';

const router = Router();

function sessionPayload(session, user) {
  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at ?? null,
    expires_in: session.expires_in ?? null,
    token_type: session.token_type || 'bearer',
    user: {
      id: user.id,
      email: user.email,
    },
  };
}

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    // Isolated client so the user session never sticks on supabaseAdmin.
    const auth = createAuthClient();
    const { data, error } = await auth.auth.signInWithPassword({ email, password });
    if (error || !data?.session || !data?.user) {
      return res.status(401).json({ error: error?.message || 'Invalid email or password.' });
    }

    res.json({ session: sessionPayload(data.session, data.user) });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res, next) => {
  try {
    const refreshToken =
      typeof req.body?.refresh_token === 'string' ? req.body.refresh_token.trim() : '';
    if (!refreshToken) {
      return res.status(400).json({ error: 'refresh_token is required.' });
    }

    const auth = createAuthClient();
    const { data, error } = await auth.auth.refreshSession({
      refresh_token: refreshToken,
    });
    if (error || !data?.session || !data?.user) {
      return res.status(401).json({ error: error?.message || 'Session expired. Please sign in again.' });
    }

    res.json({ session: sessionPayload(data.session, data.user) });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout — client clears tokens; best-effort revoke when bearer present
router.post('/logout', async (req, res, next) => {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (token) {
      try {
        await supabaseAdmin.auth.admin.signOut(token);
      } catch {
        // Ignore revoke failures; client still drops local session.
      }
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
