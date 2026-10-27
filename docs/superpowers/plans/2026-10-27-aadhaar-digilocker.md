# Aadhaar Digilocker Implementation Plan

> **For agentic workers:** Digilocker is primary; OTP routes/functions remain for rollback.

**Goal:** Wire ProfileX Digilocker Step 1/2 into onboarding as the primary Aadhaar verification path.

**Architecture:** New Supabase edge functions call Neokred Digilocker APIs; Express public routes start/complete the flow; frontend redirects to Digilocker and completes on return.

**Tech Stack:** Deno edge functions, Express, React onboarding form, existing `job_app_form` KYC columns.

## Tasks

- [x] Edge: `aadhaar-digilocker-start`, `aadhaar-digilocker-details`
- [x] Backend: `POST /aadhaar/digilocker/start`, `POST /aadhaar/digilocker/complete`
- [x] Frontend: Digilocker CTA + return callback
- [x] Env examples updated
- [ ] Deploy edge functions to Supabase
- [ ] Smoke-test start → Digilocker → complete

## Deploy

```bash
supabase functions deploy aadhaar-digilocker-start
supabase functions deploy aadhaar-digilocker-details
```

Confirm secrets: `NEOKRED_CLIENT_USER_ID`, `NEOKRED_SECRET_KEY`, `NEOKRED_ACCESS_KEY`, Digilocker Step1/Step2 service IDs + URLs.
