/**
 * Live onboarding test identity — both mobile and email must match.
 * Defaults: 9944621246 + dinesh.kumar@awign.com
 * Override with ONBOARDING_TEST_MOBILE / ONBOARDING_TEST_EMAIL.
 *
 * This pair is unrestricted for repeated Digilocker / form / OTP testing:
 * reuse on create, hard-reset on initiate/resend, no submission-attempt cap,
 * and form stays editable even after submit/approve/reject.
 */

export function normalizeTestMobile(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return digits;
}

export function normalizeTestEmail(raw) {
  return String(raw ?? '').trim().toLowerCase();
}

export function getOnboardingTestIdentity() {
  const mobile = normalizeTestMobile(
    process.env.ONBOARDING_TEST_MOBILE ?? '9944621246'
  );
  const email = normalizeTestEmail(
    process.env.ONBOARDING_TEST_EMAIL ?? 'dinesh.kumar@awign.com'
  );
  if (!/^\d{10}$/.test(mobile) || !email) return null;
  return { mobile, email };
}

export function isOnboardingTestIdentity(mobile, email) {
  const configured = getOnboardingTestIdentity();
  if (!configured) return false;
  return (
    normalizeTestMobile(mobile) === configured.mobile &&
    normalizeTestEmail(email) === configured.email
  );
}

/** True when an employees row (or similar) is the configured live test pair. */
export function isOnboardingTestEmployee(row) {
  if (!row) return false;
  return isOnboardingTestIdentity(row.mobile, row.email);
}
