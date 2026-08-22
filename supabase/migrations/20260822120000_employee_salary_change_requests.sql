-- PM salary change after PM approval → Payroll Lead reviews supporting attachment.

create table if not exists public.employee_salary_change_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  requested_by uuid not null references public.users (id),
  from_pay_type text null,
  from_ctc_type text null,
  from_ctc_value numeric null,
  to_pay_type text not null
    check (to_pay_type in ('CTC', 'NET_PAY')),
  to_ctc_type text null
    check (to_ctc_type is null or to_ctc_type in ('MONTHLY', 'ANNUAL')),
  to_ctc_value numeric not null check (to_ctc_value >= 0),
  reason text null,
  document_path text not null,
  document_name text not null,
  document_mime text not null,
  status text not null default 'PENDING'
    check (status in ('PENDING', 'APPROVED', 'REJECTED', 'CANCELED')),
  reviewed_by uuid null references public.users (id),
  reviewed_at timestamptz null,
  review_note text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists employee_salary_change_requests_one_pending
  on public.employee_salary_change_requests (employee_id)
  where status = 'PENDING';

create index if not exists employee_salary_change_requests_client_status_idx
  on public.employee_salary_change_requests (client_id, status, created_at desc);

comment on table public.employee_salary_change_requests is
  'PM salary change requests after PM approval; Payroll Lead approves or rejects with the supporting attachment.';

insert into storage.buckets (id, name, public)
values ('salary-change-documents', 'salary-change-documents', false)
on conflict (id) do update set public = false;
