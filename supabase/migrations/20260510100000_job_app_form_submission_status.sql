-- Final application status on job form (null until Bank & Photo step is submitted).

alter table public.job_app_form
  add column if not exists submission_status text;
