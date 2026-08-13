import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../lib/api';
import {
  clearStoredSession,
  readStoredSession,
  writeStoredSession,
} from '../lib/session';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => readStoredSession());
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!session?.access_token) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const me = await api.me();
        if (!cancelled) setProfile(me);
      } catch {
        if (cancelled) return;
        clearStoredSession();
        setProfile(null);
        setSession(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.access_token]);

  const signIn = async (email, password) => {
    const next = await api.login({ email, password });
    writeStoredSession(next);
    try {
      const me = await api.me();
      setProfile(me);
      setSession(next);
      return me;
    } catch (err) {
      clearStoredSession();
      setProfile(null);
      setSession(null);
      throw err;
    }
  };

  const signOut = async () => {
    try {
      await api.logout();
    } catch {
      // Still clear local session if the API call fails.
    }
    clearStoredSession();
    setProfile(null);
    setSession(null);
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        loading,
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

export function homeRouteForRole(role) {
  if (role === 'PROGRAM_MANAGER') return '/pm-dashboard/dashboard';
  if (role === 'PAYROLL_LEAD') return '/dashboard';
  if (role === 'PAYROLL_HEAD') return '/admin-dashboard';
  if (role === 'SUPER_ADMIN') return '/super-admin/dashboard';
  return '/login';
}
