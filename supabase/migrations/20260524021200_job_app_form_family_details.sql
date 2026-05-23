-- Personal details: family attributes collected in step 1 personal form.

alter table public.job_app_form
  add column if not exists pd_father_name text,
  add column if not exists pd_mother_name text,
  add column if not exists pd_spouse_name text;
