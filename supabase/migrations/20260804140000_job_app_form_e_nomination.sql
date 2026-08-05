-- E-nomination fields on bank & photo / final compliance step (near police verification).
alter table public.job_app_form
  add column if not exists bp_nominee_name text,
  add column if not exists bp_nominee_relation text,
  add column if not exists bp_nominee_mobile text;
