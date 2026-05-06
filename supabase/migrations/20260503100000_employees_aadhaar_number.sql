-- Collected during public onboarding after Aadhaar OTP verification.
alter table public.employees add column if not exists aadhaar_number text;
