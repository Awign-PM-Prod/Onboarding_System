-- Employee work/location state, set with role details (PM).

alter table public.employees
  add column if not exists state text;

-- Backfill from client state for employees that already have role details.
update public.employees e
set state = nullif(btrim(c.state), '')
from public.clients c
where e.client_id = c.id
  and e.onboarding_status <> 'AVAILABLE'
  and e.state is null
  and nullif(btrim(c.state), '') is not null;

update public.employees
set state = null
where onboarding_status = 'AVAILABLE'
  and state is not null;

alter table public.employees
  drop constraint if exists employees_stage_job_fields_consistency;

alter table public.employees
  add constraint employees_stage_job_fields_consistency
  check (
    (
      onboarding_status = 'AVAILABLE'
      and designation is null
      and date_of_joining is null
      and ctc_type is null
      and ctc_value is null
      and state is null
      and onboarding_initiated = false
    )
    or
    (
      onboarding_status in ('ROLE_ASSIGNED', 'FORM_SENT', 'Form Submitted')
      and designation is not null
      and date_of_joining is not null
      and ctc_type in ('MONTHLY', 'ANNUAL')
      and ctc_value is not null
    )
  );
