alter table public.job_app_form
  add column if not exists kyc_pan_verified boolean not null default false,
  add column if not exists kyc_bank_verified boolean not null default false,
  add column if not exists kyc_bank_branch_confirmed boolean not null default false;
