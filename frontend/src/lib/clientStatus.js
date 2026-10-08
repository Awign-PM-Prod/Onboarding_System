export function isClientActive(client) {
  return client?.is_active !== false;
}

export function matchesClientStatusFilter(client, statusFilter) {
  if (statusFilter === 'ACTIVE') return isClientActive(client);
  if (statusFilter === 'INACTIVE') return !isClientActive(client);
  return true;
}
