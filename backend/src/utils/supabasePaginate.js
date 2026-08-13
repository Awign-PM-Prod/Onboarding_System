import { supabaseAdmin } from '../supabase.js';

/**
 * Fetch all rows for a Supabase query builder, paging past the default ~1000 row cap.
 * Pass a factory that returns a fresh query each page (filters applied before range).
 *
 * @param {() => object} buildQuery
 * @param {{ pageSize?: number }} [opts]
 * @returns {Promise<any[]>}
 */
export async function fetchAllRows(buildQuery, { pageSize = 1000 } = {}) {
  const size = Math.max(1, Math.min(Number(pageSize) || 1000, 1000));
  const rows = [];
  let from = 0;

  for (;;) {
    const to = from + size - 1;
    const { data, error } = await buildQuery().range(from, to);
    if (error) throw error;
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < size) break;
    from += size;
  }

  return rows;
}

/**
 * Fetch all rows matching `.in(column, ids)`, chunking the IN list to avoid URL/body limits.
 *
 * @param {(idChunk: string[]) => object} buildQueryForIds
 * @param {string[]} ids
 * @param {{ pageSize?: number, idChunkSize?: number }} [opts]
 */
export async function fetchAllRowsByIds(buildQueryForIds, ids, { pageSize = 1000, idChunkSize = 200 } = {}) {
  const unique = [...new Set((ids || []).filter(Boolean))];
  if (unique.length === 0) return [];

  const chunk = Math.max(1, Number(idChunkSize) || 200);
  const out = [];
  for (let i = 0; i < unique.length; i += chunk) {
    const slice = unique.slice(i, i + chunk);
    const part = await fetchAllRows(() => buildQueryForIds(slice), { pageSize });
    out.push(...part);
  }
  return out;
}

/**
 * Load employees for dashboard stats: date-scoped query, or chunked by client_id.
 */
export async function fetchDashboardEmployees({
  select,
  clientIds,
  dateFiltered,
  fromRaw,
  toRaw,
  filterClientId
}) {
  if (dateFiltered) {
    return fetchAllRows(() => {
      let empQuery = supabaseAdmin.from('employees').select(select);
      if (fromRaw) empQuery = empQuery.gte('created_at', `${fromRaw}T00:00:00.000Z`);
      if (toRaw) empQuery = empQuery.lte('created_at', `${toRaw}T23:59:59.999Z`);
      if (filterClientId) empQuery = empQuery.eq('client_id', filterClientId);
      return empQuery;
    });
  }

  return fetchAllRowsByIds(
    (idChunk) => supabaseAdmin.from('employees').select(select).in('client_id', idChunk),
    clientIds
  );
}
