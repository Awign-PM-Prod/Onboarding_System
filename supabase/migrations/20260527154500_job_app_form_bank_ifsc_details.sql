alter table public.job_app_form
  add column if not exists kyc_bank_ifsc_details jsonb;
