# Onboarding Test Identity Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox syntax.

**Goal:** Reuse one live test mobile+email pair for unlimited onboarding retests without uniqueness/submit blockers.

**Architecture:** Env-backed helper `isOnboardingTestIdentity`; create path reuses same-client row; initiate/resend hard-reset form then send invite.

**Tech Stack:** Express backend, existing `buildReinitiateFormResetPayload`, Supabase admin client.

## Global Constraints

- Both mobile and email must match.
- No Digilocker/OTP mock.
- EXITED employees are not auto-reopened.

---

### Task 1: Helper + create reuse

**Files:**
- Create: `backend/src/utils/onboardingTestIdentity.js`
- Modify: `backend/src/routes/employees.js`, `backend/.env.example`

- [ ] Add helper with defaults + env overrides
- [ ] On `POST /` and bulk-upload, reuse same-client test identity instead of duplicate error
- [ ] Document env vars in `.env.example`

### Task 2: Initiate / resend reset

**Files:**
- Modify: `backend/src/routes/employees.js`

- [ ] Shared `resetTestIdentityOnboarding(employeeId)` using `buildReinitiateFormResetPayload`
- [ ] `initiate-onboarding`: for test identity (non-EXITED), reset + FORM_SENT + send
- [ ] `resend-onboarding`: for test identity, allow after submit; reset + send
- [ ] Log reuse/reset actions
