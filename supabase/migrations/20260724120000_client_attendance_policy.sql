-- Client attendance policy: payroll cycle, week off, comp off rules

create table if not exists public.client_attendance_policies (
  client_id uuid primary key references public.clients(id) on delete cascade,
  payroll_cycle_start_day smallint not null default 1
    check (payroll_cycle_start_day between 1 and 31),
  payroll_cycle_end_day smallint not null default 31
    check (payroll_cycle_end_day between 1 and 31),
  week_off_config jsonb not null default '{"presets":["sat_sun"],"weekdays":[]}'::jsonb,
  comp_off_applicable boolean not null default false,
  comp_off_types text[] not null default '{}',
  comp_off_rule numeric not null default 1,
  paid_comp_off_rule numeric not null default 1,
  nh_comp_off_applicable boolean not null default false,
  nh_off_rule numeric not null default 1,
  nh_pay_rule numeric not null default 1,
  fh_comp_off_applicable boolean not null default false,
  fh_off_rule numeric not null default 1,
  fh_pay_rule numeric not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.client_leave_allowances (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  designation text not null,
  sick_days numeric not null default 0,
  paid_days numeric not null default 0,
  maternity_days numeric not null default 0,
  paternity_days numeric not null default 0,
  earned_days numeric not null default 0,
  created_at timestamptz not null default now(),
  unique (client_id, designation)
);

create index if not exists client_leave_allowances_client_id_idx
  on public.client_leave_allowances (client_id);

create table if not exists public.client_holidays (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  holiday_date date not null,
  holiday_type text not null check (holiday_type in ('NH', 'FH')),
  created_at timestamptz not null default now(),
  unique (client_id, holiday_date, holiday_type)
);

create index if not exists client_holidays_client_id_idx
  on public.client_holidays (client_id);

-- Backfill default policy for existing clients
insert into public.client_attendance_policies (client_id)
select c.id from public.clients c
where not exists (
  select 1 from public.client_attendance_policies p where p.client_id = c.id
);

-- Allow RECOMPUTE action in attendance activity logs
alter table public.attendance_activity_logs
  drop constraint if exists attendance_activity_logs_action_check;

alter table public.attendance_activity_logs
  add constraint attendance_activity_logs_action_check
  check (action in (
    'SUBMIT',
    'RESUBMIT',
    'LOCK',
    'UNLOCK',
    'REQUEST_EDIT',
    'UPLOAD',
    'CELL_CHANGE',
    'ROW_FIELD_CHANGE',
    'RECOMPUTE'
  ));
