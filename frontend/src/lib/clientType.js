export const CLIENT_TYPE_COMPLIANCE = 'COMPLIANCE';
export const CLIENT_TYPE_NON_COMPLIANCE = 'NON_COMPLIANCE';

export const CLIENT_TYPES = [CLIENT_TYPE_COMPLIANCE, CLIENT_TYPE_NON_COMPLIANCE];

export const CLIENT_TYPE_LABELS = {
  COMPLIANCE: 'Compliance',
  NON_COMPLIANCE: 'Non-compliance'
};

export const STATUTORY_ONBOARDING_FIELDS = [
  'bp_esic_number',
  'bp_pf_uan_number',
  'bp_pf_uan_face_auth_screenshot_url',
  'bp_police_verification_url',
  'bp_nominee_name',
  'bp_nominee_relation',
  'bp_nominee_mobile'
];

const STATUTORY_ONBOARDING_FIELD_SET = new Set(STATUTORY_ONBOARDING_FIELDS);

export function normalizeClientType(raw) {
  const v = String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/[-\s]+/g, '_');
  if (v === 'NON_COMPLIANCE' || v === 'NONCOMPLIANCE') return CLIENT_TYPE_NON_COMPLIANCE;
  if (v === 'COMPLIANCE') return CLIENT_TYPE_COMPLIANCE;
  return undefined;
}

export function clientTypeOrDefault(raw) {
  return normalizeClientType(raw) || CLIENT_TYPE_COMPLIANCE;
}

export function isNonComplianceClient(clientOrType) {
  const raw =
    clientOrType && typeof clientOrType === 'object' ? clientOrType.client_type : clientOrType;
  return clientTypeOrDefault(raw) === CLIENT_TYPE_NON_COMPLIANCE;
}

export function isStatutoryOnboardingField(field) {
  return STATUTORY_ONBOARDING_FIELD_SET.has(String(field ?? '').trim());
}

export function clientRequiresStatutoryCompliance(clientOrForm) {
  return !isNonComplianceClient(clientOrForm);
}
