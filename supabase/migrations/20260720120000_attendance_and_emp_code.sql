-- StaffingGo emp_code on employees + attendance sheets/rows/marks + activity logs

alter table public.employees
  add column if not exists emp_code text;

create unique index if not exists employees_emp_code_unique
  on public.employees (emp_code)
  where emp_code is not null;

create table if not exists public.attendance_sheets (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  attendance_month date not null,
  status text not null default 'DRAFT'
    check (status in ('DRAFT', 'SUBMITTED')),
  locked boolean not null default false,
  locked_at timestamptz,
  locked_by uuid references public.users(id),
  unlock_requested_at timestamptz,
  unlock_requested_by uuid references public.users(id),
  unlock_request_status text not null default 'NONE'
    check (unlock_request_status in ('NONE', 'PENDING', 'GRANTED')),
  ever_locked boolean not null default false,
  contract_code text,
  entity text,
  cycle_type text,
  payroll_cycle text,
  payroll_start_date date,
  payroll_end_date date,
  salary_payout_date date,
  project_manager_name text,
  source_filename text,
  uploaded_by uuid references public.users(id),
  uploaded_at timestamptz,
  submitted_at timestamptz,
  submitted_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, attendance_month)
);

create table if not exists public.attendance_rows (
  id uuid primary key default gen_random_uuid(),
  sheet_id uuid not null references public.attendance_sheets(id) on delete cascade,
  employee_id uuid references public.employees(id) on delete set null,
  emp_code text not null,
  employee_name_snapshot text,
  mobile text,
  gender text,
  location text,
  designation text,
  doj date,
  lwd date,
  status_label text,
  amt_type text,
  monthly_amt numeric,
  paid_days numeric,
  lop numeric,
  not_considered numeric,
  total_days numeric,
  legend_totals jsonb not null default '{}'::jsonb,
  leave_summary jsonb not null default '{}'::jsonb,
  remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists attendance_rows_sheet_id_idx
  on public.attendance_rows (sheet_id);

create table if not exists public.attendance_day_marks (
  id uuid primary key default gen_random_uuid(),
  row_id uuid not null references public.attendance_rows(id) on delete cascade,
  mark_date date not null,
  code text not null,
  unique (row_id, mark_date)
);

create index if not exists attendance_day_marks_row_id_idx
  on public.attendance_day_marks (row_id);

create table if not exists public.attendance_activity_logs (
  id uuid primary key default gen_random_uuid(),
  sheet_id uuid not null references public.attendance_sheets(id) on delete cascade,
  row_id uuid references public.attendance_rows(id) on delete set null,
  day_mark_id uuid references public.attendance_day_marks(id) on delete set null,
  action text not null
    check (action in (
      'SUBMIT',
      'RESUBMIT',
      'LOCK',
      'UNLOCK',
      'REQUEST_EDIT',
      'UPLOAD',
      'CELL_CHANGE',
      'ROW_FIELD_CHANGE'
    )),
  actor_user_id uuid references public.users(id),
  actor_role text,
  before_json jsonb,
  after_json jsonb,
  message text,
  created_at timestamptz not null default now()
);

create index if not exists attendance_activity_logs_sheet_id_created_at_idx
  on public.attendance_activity_logs (sheet_id, created_at desc);
