-- PM-controlled joining status for PL-approved employees.

alter table public.employees
  add column if not exists joining_status text,
  add column if not exists joining_actual_date date,
  add column if not exists joining_status_change_count integer not null default 0,
  add column if not exists joining_status_set_at timestamptz,
  add column if not exists joining_status_set_by uuid references public.users (id),
  add column if not exists joining_status_updated_at timestamptz,
  add column if not exists joining_status_updated_by uuid references public.users (id);

alter table public.employees
  drop constraint if exists employees_joining_status_check;

alter table public.employees
  add constraint employees_joining_status_check
  check (
    joining_status is null
    or joining_status in (
      'JOINED',
      'NOT_JOINED',
      'JOINED_OTHER_DATE',
      'JOINED_ABSCONDED'
    )
  );

alter table public.employees
  drop constraint if exists employees_joining_status_change_count_range;

alter table public.employees
  add constraint employees_joining_status_change_count_range
  check (joining_status_change_count between 0 and 2);

alter table public.employees
  drop constraint if exists employees_joining_other_date_requires_date;

alter table public.employees
  add constraint employees_joining_other_date_requires_date
  check (
    joining_status <> 'JOINED_OTHER_DATE'
    or joining_actual_date is not null
  );
