-- PM review workflow state on job application form.

alter table public.job_app_form
  add column if not exists submission_attempt_count integer not null default 1,
  add column if not exists review_status text,
  add column if not exists editable_fields jsonb not null default '[]'::jsonb,
  add column if not exists review_reason text,
  add column if not exists reviewed_by uuid references public.users (id),
  add column if not exists reviewed_at timestamptz;

alter table public.job_app_form
  drop constraint if exists job_app_form_submission_attempt_count_range;

alter table public.job_app_form
  add constraint job_app_form_submission_attempt_count_range
  check (submission_attempt_count between 1 and 3);
