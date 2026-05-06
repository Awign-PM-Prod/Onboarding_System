-- PM review history for job application decisions.

create table if not exists public.job_app_form_reviews (
  id uuid primary key default gen_random_uuid(),
  job_app_form_id uuid not null references public.job_app_form (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  attempt_no integer not null,
  decision_status text not null,
  rejected_fields jsonb not null default '[]'::jsonb,
  decision_reason text,
  reviewed_by uuid not null references public.users (id),
  reviewed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists job_app_form_reviews_employee_idx
  on public.job_app_form_reviews (employee_id, reviewed_at desc);

create index if not exists job_app_form_reviews_form_idx
  on public.job_app_form_reviews (job_app_form_id, reviewed_at desc);

alter table public.job_app_form_reviews
  drop constraint if exists job_app_form_reviews_attempt_no_range;

alter table public.job_app_form_reviews
  add constraint job_app_form_reviews_attempt_no_range
  check (attempt_no between 1 and 3);

alter table public.job_app_form_reviews
  drop constraint if exists job_app_form_reviews_decision_status_check;

alter table public.job_app_form_reviews
  add constraint job_app_form_reviews_decision_status_check
  check (decision_status in ('APPROVED', 'REJECTED', 'CORRECTION_REQUESTED'));

alter table public.job_app_form_reviews
  drop constraint if exists job_app_form_reviews_correction_requires_reason_and_fields;

alter table public.job_app_form_reviews
  add constraint job_app_form_reviews_correction_requires_reason_and_fields
  check (
    decision_status <> 'CORRECTION_REQUESTED'
    or (
      coalesce(length(trim(decision_reason)), 0) > 0
      and jsonb_typeof(rejected_fields) = 'array'
      and jsonb_array_length(rejected_fields) > 0
    )
  );

alter table public.job_app_form_reviews
  drop constraint if exists job_app_form_reviews_reject_requires_reason;

alter table public.job_app_form_reviews
  add constraint job_app_form_reviews_reject_requires_reason
  check (
    decision_status <> 'REJECTED'
    or coalesce(length(trim(decision_reason)), 0) > 0
  );
