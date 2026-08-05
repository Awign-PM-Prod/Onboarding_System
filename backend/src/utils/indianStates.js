/** Indian states and union territories (keep in sync with frontend/src/lib/indianStates.js). */
export const INDIAN_STATES = [
  'Andaman and Nicobar Islands',
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chandigarh',
  'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jammu and Kashmir',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Ladakh',
  'Lakshadweep',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Puducherry',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal'
];

const STATE_SET = new Set(INDIAN_STATES.map((s) => s.toLowerCase()));

export function isIndianState(value) {
  return STATE_SET.has(String(value ?? '').trim().toLowerCase());
}

/** Return canonical casing from the list, or null if invalid. */
export function normalizeIndianState(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const found = INDIAN_STATES.find((s) => s.toLowerCase() === raw.toLowerCase());
  return found ?? null;
}
