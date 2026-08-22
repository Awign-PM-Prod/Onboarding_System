import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';

function storageKey(clientId) {
  return `obs.salaryChangeNotice.${clientId}`;
}

export function usePendingSalaryChanges(clientId) {
  const [requests, setRequests] = useState([]);

  const load = useCallback(async () => {
    if (!clientId) {
      setRequests([]);
      return;
    }
    try {
      const rows = await api.listSalaryChangeRequests(clientId, 'PENDING');
      setRequests(Array.isArray(rows) ? rows : []);
    } catch {
      setRequests([]);
    }
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!clientId) return undefined;
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, [clientId, load]);

  const requestKey = useMemo(
    () => requests.map((row) => row.id).filter(Boolean).sort().join(','),
    [requests]
  );

  const [dismissedKey, setDismissedKey] = useState('');

  useEffect(() => {
    if (!clientId) {
      setDismissedKey('');
      return;
    }
    try {
      setDismissedKey(sessionStorage.getItem(storageKey(clientId)) || '');
    } catch {
      setDismissedKey('');
    }
  }, [clientId, requestKey]);

  const dismiss = useCallback(() => {
    if (!clientId) return;
    try {
      sessionStorage.setItem(storageKey(clientId), requestKey);
    } catch {
      /* ignore */
    }
    setDismissedKey(requestKey);
  }, [clientId, requestKey]);

  return {
    count: requests.length,
    requests,
    showNotice: requests.length > 0 && dismissedKey !== requestKey,
    dismiss,
    refresh: load
  };
}
