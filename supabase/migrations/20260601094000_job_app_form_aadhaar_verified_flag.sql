alter table public.job_app_form
  add column if not exists aadhaar_verified boolean not null default false;
