import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SEARCH_EMPLOYEE_PARAM } from '../lib/globalSearchRoutes';

/** Reads the `?employee=<id>` deep-link set by GlobalSearch and lets the page clear it. */
export function useSearchEmployeeFilter() {
  const [searchParams, setSearchParams] = useSearchParams();
  const employeeId = searchParams.get(SEARCH_EMPLOYEE_PARAM) || null;

  const clear = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete(SEARCH_EMPLOYEE_PARAM);
        return next;
      },
      { replace: true }
    );
  }, [setSearchParams]);

  const filterRows = useCallback(
    (rows) => (employeeId ? rows.filter((row) => String(row.id) === employeeId) : rows),
    [employeeId]
  );

  return { employeeId, clear, filterRows };
}
