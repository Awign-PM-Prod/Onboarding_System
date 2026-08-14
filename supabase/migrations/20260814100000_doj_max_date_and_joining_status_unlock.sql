-- DOJ: Super Admin sets max allowed DOJ on approve; unused unlocks expire after TTL.
-- Joining status: locked after first set; each later change needs Super Admin unlock.

-- Employees: DOJ unlock metadata
alter table public.employees
  add column if not exists doj_extend_max_date date null;

alter table public.employees
  add column if not exists doj_extend_unlock_expires_at timestamptz null;

comment on column public.employees.doj_extend_max_date is
  'Max DOJ PM may set after Super Admin approved Extend DOJ; cleared on use/expiry.';
comment on column public.employees.doj_extend_unlock_expires_at is
  'When doj_extend_unlock expires if unused; cleared on use/expiry.';

-- Employees: joining status unlock
alter table public.employees
  add column if not exists joining_status_unlock boolean not null default false;

alter table public.employees
  add column if not exists joining_status_unlock_expires_at timestamptz null;

comment on column public.employees.joining_status_unlock is
  'When true, PM may change joining_status once after Super Admin approved a change request.';
comment on column public.employees.joining_status_unlock_expires_at is
  'When joining_status_unlock expires if unused; cleared on use/expiry.';

-- doj_extend_requests: max date + unlock expiry + EXPIRED status
alter table public.doj_extend_requests
  add column if not exists max_allowed_doj date null;

alter table public.doj_extend_requests
  add column if not exists unlock_expires_at timestamptz null;

alter table public.doj_extend_requests
  drop constraint if exists doj_extend_requests_status_check;

alter table public.doj_extend_requests
  add constraint doj_extend_requests_status_check
  check (status in ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED'));

comment on column public.doj_extend_requests.max_allowed_doj is
  'Max DOJ allowed for PM after Super Admin approve.';
comment on column public.doj_extend_requests.unlock_expires_at is
  'When the approved unlock expires if PM has not saved a new DOJ.';

-- Joining status change requests (mirror DOJ extend flow)
create table if not exists public.joining_status_change_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  requested_by uuid not null references public.users (id),
  reason text null,
  status text not null default 'PENDING'
    check (status in ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED')),
  reviewed_by uuid null references public.users (id),
  reviewed_at timestamptz null,
  review_note text null,
  unlock_expires_at timestamptz null,
  pm_acked_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists joining_status_change_requests_one_pending_per_employee
  on public.joining_status_change_requests (employee_id)
  where status = 'PENDING';

create index if not exists joining_status_change_requests_status_created_idx
  on public.joining_status_change_requests (status, created_at desc);

create index if not exists joining_status_change_requests_requested_by_ack_idx
  on public.joining_status_change_requests (requested_by, pm_acked_at)
  where status in ('APPROVED', 'REJECTED') and pm_acked_at is null;

comment on table public.joining_status_change_requests is
  'PM requests unlock to change joining status after first set; Super Admin approves/rejects per employee.';
