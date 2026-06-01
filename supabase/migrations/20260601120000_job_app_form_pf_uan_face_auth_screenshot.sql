-- PF UAN face authentication verification screenshot (when employee has existing UAN).

alter table public.job_app_form
  add column if not exists bp_pf_uan_face_auth_screenshot_url text;
