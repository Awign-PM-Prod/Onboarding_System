-- Aadhaar KYC fields from verification API (demo until UIDAI integration).

alter table public.job_app_form
  add column if not exists aad_profile_photo text,
  add column if not exists aad_name text,
  add column if not exists aad_care_of text,
  add column if not exists aad_dob date,
  add column if not exists aad_gender text,
  add column if not exists aad_address text,
  add column if not exists aad_state text,
  add column if not exists aad_district text,
  add column if not exists aad_pincode text;
