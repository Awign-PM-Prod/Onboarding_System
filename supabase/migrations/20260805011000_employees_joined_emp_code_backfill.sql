-- Repair: if 20260805010000 failed on the joined emp_code check, backfill then add it.

update public.employees
set emp_code = 'LEGACY-' || upper(substr(replace(id::text, '-', ''), 1, 10))
where joining_status in ('JOINED', 'JOINED_OTHER_DATE')
  and (emp_code is null or btrim(emp_code) = '');

alter table public.employees
  drop constraint if exists employees_joined_requires_emp_code;

alter table public.employees
  add constraint employees_joined_requires_emp_code
  check (
    joining_status is null
    or joining_status not in ('JOINED', 'JOINED_OTHER_DATE')
    or emp_code is not null
  );
