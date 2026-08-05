-- PM role details: choose whether the entered amount is CTC or Net Pay.

alter table public.employees
  add column if not exists pay_type text;

alter table public.employees
  drop constraint if exists employees_pay_type_check;

alter table public.employees
  add constraint employees_pay_type_check
  check (pay_type is null or pay_type in ('CTC', 'NET_PAY'));

-- Historical amounts were treated as CTC.
update public.employees
set pay_type = 'CTC'
where onboarding_status <> 'AVAILABLE'
  and pay_type is null
  and ctc_value is not null;

update public.employees
set pay_type = null
where onboarding_status = 'AVAILABLE'
  and pay_type is not null;

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
      and pay_type is null
      and state is null
      and onboarding_initiated = false
    )
    or
    (
      onboarding_status in ('ROLE_ASSIGNED', 'FORM_SENT', 'Form Submitted')
      and designation is not null
      and date_of_joining is not null
      and ctc_value is not null
      and (
        (pay_type = 'CTC' and ctc_type in ('MONTHLY', 'ANNUAL'))
        or (pay_type = 'NET_PAY' and ctc_type is null)
      )
    )
  );
