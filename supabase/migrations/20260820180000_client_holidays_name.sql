-- Optional display name on custom client holiday rows.

alter table public.client_holidays
  add column if not exists holiday_name text;
