-- Payroll Lead review state and history (after PM approval).

alter table public.job_app_form
  add column if not exists payroll_review_status text,
  add column if not exists payroll_review_reason text,
  add column if not exists payroll_reviewed_by uuid references public.users (id),
  add column if not exists payroll_reviewed_at timestamptz;

alter table public.job_app_form
  drop constraint if exists job_app_form_payroll_review_status_check;

alter table public.job_app_form
  add constraint job_app_form_payroll_review_status_check
  check (
    payroll_review_status is null
    or payroll_review_status in (
      'PENDING_PAYROLL_LEAD',
      'PAYROLL_APPROVED',
      'PAYROLL_REJECTED'
    )
  );

create table if not exists public.job_app_form_payroll_reviews (
  id uuid primary key default gen_random_uuid(),
  job_app_form_id uuid not null references public.job_app_form (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  cycle_no integer not null default 1,
  decision_status text not null,
  rejected_fields jsonb not null default '[]'::jsonb,
  decision_reason text,
  reviewed_by uuid not null references public.users (id),
  reviewed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists job_app_form_payroll_reviews_employee_idx
  on public.job_app_form_payroll_reviews (employee_id, reviewed_at desc);

create index if not exists job_app_form_payroll_reviews_form_idx
  on public.job_app_form_payroll_reviews (job_app_form_id, reviewed_at desc);

alter table public.job_app_form_payroll_reviews
  drop constraint if exists job_app_form_payroll_reviews_cycle_no_range;

alter table public.job_app_form_payroll_reviews
  add constraint job_app_form_payroll_reviews_cycle_no_range
  check (cycle_no >= 1 and cycle_no <= 50);

alter table public.job_app_form_payroll_reviews
  drop constraint if exists job_app_form_payroll_reviews_decision_status_check;

alter table public.job_app_form_payroll_reviews
  add constraint job_app_form_payroll_reviews_decision_status_check
  check (decision_status in ('APPROVED', 'REJECTED'));

alter table public.job_app_form_payroll_reviews
  drop constraint if exists job_app_form_payroll_reviews_reject_requires_reason;

alter table public.job_app_form_payroll_reviews
  add constraint job_app_form_payroll_reviews_reject_requires_reason
  check (
    decision_status <> 'REJECTED'
    or coalesce(length(trim(decision_reason)), 0) > 0
  );

-- Existing PM-approved applications enter the Payroll Lead queue.
update public.job_app_form
set payroll_review_status = 'PENDING_PAYROLL_LEAD'
where review_status = 'APPROVED'
  and payroll_review_status is null;
