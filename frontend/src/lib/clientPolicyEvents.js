export const CLIENT_POLICY_UPDATED_EVENT = 'client-policy-updated';

export function emitClientPolicyUpdated(clientId) {
  if (!clientId || typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(CLIENT_POLICY_UPDATED_EVENT, { detail: { clientId: String(clientId) } })
  );
}
