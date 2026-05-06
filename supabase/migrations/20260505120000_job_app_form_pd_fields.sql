-- Personal details form fields (only where no existing column already holds the data).
-- Aadhaar-sourced and identity fields use aad_* / name / email / mobile; these are the extras.

alter table public.job_app_form
  add column if not exists pd_alternate_number text,
  add column if not exists pd_city text,
  add column if not exists pd_age smallint,
  add column if not exists pd_marital_status text,
  add column if not exists pd_driving_license text;
