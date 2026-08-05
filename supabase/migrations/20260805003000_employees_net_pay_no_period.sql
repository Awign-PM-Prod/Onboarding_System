-- Net Pay stores amount only (no monthly/annual period).

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
