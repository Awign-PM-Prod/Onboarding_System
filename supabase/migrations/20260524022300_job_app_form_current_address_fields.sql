-- Personal details: structured current address fields captured from employee.

alter table public.job_app_form
  add column if not exists pd_current_state text,
  add column if not exists pd_current_city text,
  add column if not exists pd_current_pincode text;
