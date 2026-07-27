-- Per-employee add-on incentive on attendance rows

alter table public.attendance_rows
  add column if not exists addon_incentive numeric;
