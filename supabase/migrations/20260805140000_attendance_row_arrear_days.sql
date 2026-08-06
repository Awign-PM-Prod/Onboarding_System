-- Per-employee arrear days on attendance rows (entered later by PM / PL)

alter table public.attendance_rows
  add column if not exists arrear_days numeric;
