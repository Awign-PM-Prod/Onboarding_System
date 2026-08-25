import { createContext, useContext, useMemo } from 'react';

const WorkspaceBasePathContext = createContext(null);

function buildPaths(basePath) {
  const base = String(basePath || '/dashboard').replace(/\/+$/, '') || '/dashboard';
  const isSuperAdmin = base === '/super-admin';

  return {
    basePath: base,
    home: `${base}/dashboard`,
    clients: `${base}/clients`,
    clientNew: isSuperAdmin ? `${base}/clients/new` : '/clients/new',
    clientEdit: (id) =>
      isSuperAdmin ? `${base}/clients/${id}/edit` : `/clients/${id}/edit`,
    client: (id, tab = 'dashboard') => `${base}/client/${id}/${tab}`,
    clientOnboarding: (id, tab = 'dashboard') => `${base}/client/${id}/onboarding/${tab}`,
    programManagers: `${base}/program-managers`,
    programManagerNew: `${base}/program-managers/new`,
    matchClientId: (pathname) => {
      const re = new RegExp(`^${base.replace(/\//g, '\\/')}/client/([^/]+)`);
      return pathname.match(re)?.[1] ?? null;
    },
    isClientFormPath: (pathname) => {
      if (isSuperAdmin) {
        return (
          pathname === `${base}/clients/new` ||
          new RegExp(`^${base.replace(/\//g, '\\/')}/clients/[^/]+/edit/?$`).test(pathname)
        );
      }
      return pathname === '/clients/new' || /^\/clients\/[^/]+\/edit\/?$/.test(pathname);
    }
  };
}

export function WorkspaceBasePathProvider({ basePath = '/dashboard', children }) {
  const value = useMemo(() => buildPaths(basePath), [basePath]);
  return (
    <WorkspaceBasePathContext.Provider value={value}>{children}</WorkspaceBasePathContext.Provider>
  );
}

export function useWorkspacePaths() {
  const ctx = useContext(WorkspaceBasePathContext);
  if (!ctx) {
    return buildPaths('/dashboard');
  }
  return ctx;
}
