const STORAGE_KEY = 'obs_auth_session';

export function readStoredSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.access_token || !parsed?.user?.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeStoredSession(session) {
  if (!session?.access_token) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearStoredSession() {
  localStorage.removeItem(STORAGE_KEY);
}

export function getAccessToken() {
  return readStoredSession()?.access_token || null;
}

export function getRefreshToken() {
  return readStoredSession()?.refresh_token || null;
}
