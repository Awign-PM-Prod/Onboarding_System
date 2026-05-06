-- Payroll Lead assigned identity numbers (used when employee did not provide).

alter table public.employees
  add column if not exists payroll_pf_uan_number text,
  add column if not exists payroll_esic_number text,
  add column if not exists payroll_numbers_updated_at timestamptz,
  add column if not exists payroll_numbers_updated_by uuid references public.users (id);
