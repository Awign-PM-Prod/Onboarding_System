# Aadhaar Digilocker Verification Design

**Date:** 2026-10-27  
**Status:** Approved (option B)

## Goal

Replace broken Offline OKYC OTP as the **primary** Aadhaar path with ProfileX Digilocker Step 1/2. Keep existing OTP edge functions and routes unused for rollback.

## Flow

1. After mobile verify, user clicks **Verify via Digilocker**.
2. Backend `POST /aadhaar/digilocker/start` → edge `aadhaar-digilocker-start` → ProfileX `unified-digital-kyc` with `redirectionUrl` + `uniqueId`.
3. Persist Digilocker session/transaction ids on `job_app_form` (reuse `aad_otp_session_id` / `aad_otp_transaction_id`).
4. Frontend redirects to Digilocker URL from Step 1.
5. Digilocker returns to `FRONTEND_URL/onboardingform?...&aadhaar_digilocker=done`.
6. Frontend calls `POST /aadhaar/digilocker/complete` → edge `aadhaar-digilocker-details` → ProfileX `unified-digital-kyc-details`.
7. Map KYC via existing `extractNeokredAadhaarPayload`; set `aadhaar_verified` and `aad_*` fields.

## Auth (Supabase secrets)

Reuse: `NEOKRED_CLIENT_USER_ID`, `NEOKRED_SECRET_KEY`, `NEOKRED_ACCESS_KEY`.  
Add: Digilocker Step1/Step2 service IDs and URLs (and optional redirect override).

## Out of scope

- Deleting OTP functions/routes
- Changing KYC upload / PAN / address steps
- Changing Aadhaar resume SMS OTP (own OTP for returning users)
