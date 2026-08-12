-- State → region/area → wage zone mapping; employee.region for PM role details.

create table if not exists public.state_region_zones (
  id uuid primary key default gen_random_uuid(),
  state text not null,
  region text not null,
  zone text not null check (zone in ('zone1', 'zone2', 'zone3')),
  updated_by uuid references public.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint state_region_zones_region_nonempty check (length(trim(region)) > 0)
);

create unique index if not exists state_region_zones_state_region_lower_uidx
  on public.state_region_zones (state, lower(region));

create index if not exists state_region_zones_state_idx
  on public.state_region_zones (state);

alter table public.employees
  add column if not exists region text;

-- AVAILABLE employees must not have region/zone; later stages may have null or set values.
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
      and zone is null
      and region is null
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
