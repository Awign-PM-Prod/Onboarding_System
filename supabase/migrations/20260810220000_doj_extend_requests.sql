-- Per-employee Extend DOJ request/approval (PM → Super Admin).
-- doj_extend_unlock is true only for that employee after SA approve until PM saves new DOJ.

alter table public.employees
  add column if not exists doj_extend_unlock boolean not null default false;

comment on column public.employees.doj_extend_unlock is
  'When true, PM may edit date_of_joining once for this employee after Super Admin approved an Extend DOJ request.';

create table if not exists public.doj_extend_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  requested_by uuid not null references public.users (id),
  reason text null,
  status text not null default 'PENDING'
    check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  reviewed_by uuid null references public.users (id),
  reviewed_at timestamptz null,
  review_note text null,
  pm_acked_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists doj_extend_requests_one_pending_per_employee
  on public.doj_extend_requests (employee_id)
  where status = 'PENDING';

create index if not exists doj_extend_requests_status_created_idx
  on public.doj_extend_requests (status, created_at desc);

create index if not exists doj_extend_requests_requested_by_ack_idx
  on public.doj_extend_requests (requested_by, pm_acked_at)
  where status in ('APPROVED', 'REJECTED') and pm_acked_at is null;

comment on table public.doj_extend_requests is
  'PM requests to extend expected DOJ; Super Admin approves/rejects per employee.';
