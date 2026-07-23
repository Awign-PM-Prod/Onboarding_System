-- Employee contact verification: email OTP + alternate (secondary) mobile OTP.

alter table public.job_app_form
  add column if not exists email_verified boolean not null default false,
  add column if not exists pd_secondary_mobile text,
  add column if not exists pd_secondary_mobile_verified boolean not null default false;
