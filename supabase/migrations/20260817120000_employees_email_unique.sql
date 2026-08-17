-- Employees: email must be unique across all employees (case-insensitive).

update public.employees
set email = lower(trim(email))
where email is distinct from lower(trim(email));

create unique index if not exists employees_email_unique
  on public.employees (lower(email));
