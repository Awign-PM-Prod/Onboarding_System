-- Per-employee incentive amount on attendance rows

alter table public.attendance_rows
  add column if not exists incentive numeric;
