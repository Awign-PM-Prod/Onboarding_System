-- Super Admin state-wise holiday master + per-client default vs custom source.

create table if not exists public.holiday_calendars (
  id uuid primary key default gen_random_uuid(),
  state text not null,
  holiday_date date not null,
  weekday text not null,
  holiday_type text not null check (holiday_type in ('NH', 'FH')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (state, holiday_date)
);

create index if not exists holiday_calendars_state_date_idx
  on public.holiday_calendars (state, holiday_date);

alter table public.client_attendance_policies
  add column if not exists holiday_source text not null default 'custom';

alter table public.client_attendance_policies
  drop constraint if exists client_attendance_policies_holiday_source_check;

alter table public.client_attendance_policies
  add constraint client_attendance_policies_holiday_source_check
  check (holiday_source in ('default', 'custom'));
