-- Optional display name for Super Admin holiday calendar rows.

alter table public.holiday_calendars
  add column if not exists holiday_name text;
