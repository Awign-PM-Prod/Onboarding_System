# Onboarding Test Identity (Live Retest) Design

**Date:** 2026-10-27  
**Status:** Approved (Approach 1)

## Goal

Allow one fixed live test identity to be reused any number of times for create / send-form / full onboarding retest without uniqueness or “already submitted” blockers.

## Identity (both required)

- Mobile: `9944621246` (override via `ONBOARDING_TEST_MOBILE`)
- Email: `dinesh.kumar@awign.com` (override via `ONBOARDING_TEST_EMAIL`)

Allowlist applies only when **both** match the configured pair.

## Behavior

1. **Create employee** (`POST /employees`, including batch/bulk): if the payload is the test pair and an employee with that pair already exists on the **same client**, reuse that row (`reused: true`) instead of `409 already exists`. Do not create a second row. Different-client collision stays blocked.
2. **Initiate / resend onboarding**: if the selected employee is the test pair, hard-reset `job_app_form` via existing `buildReinitiateFormResetPayload`, clear employee `aadhaar_number`, set `FORM_SENT` + `onboarding_initiated`, then send invite — even if previously submitted / reviewed. Skip `EXITED` employees.
3. **Out of scope:** demo OTP, mocked Digilocker/Aadhaar, new admin UI, multi-identity DB table.

## Safety

- Env-configurable; defaults to the pair above.
- Log when reuse/reset runs.
- Real Digilocker / SMS / email providers still apply.
