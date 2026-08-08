-- State wage minimums by zone × skill; client zone_dependency; designation skill_level; employee zone.

create table if not exists public.state_wage_minimums (
  state text not null,
  zone text not null check (zone in ('zone1', 'zone2', 'zone3')),
  skill_level text not null check (skill_level in ('SKILLED', 'SEMI_SKILLED', 'UNSKILLED')),
  min_monthly_ctc numeric not null check (min_monthly_ctc >= 0),
  updated_by uuid references public.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (state, zone, skill_level)
);

create index if not exists state_wage_minimums_state_idx
  on public.state_wage_minimums (state);

-- Seed from legacy single-value table into all 9 cells per state.
insert into public.state_wage_minimums (state, zone, skill_level, min_monthly_ctc, updated_by, updated_at)
select
  s.state,
  z.zone,
  sk.skill_level,
  s.min_monthly_ctc,
  s.updated_by,
  s.updated_at
from public.state_salary_minimums s
cross join (values ('zone1'), ('zone2'), ('zone3')) as z(zone)
cross join (values ('SKILLED'), ('SEMI_SKILLED'), ('UNSKILLED')) as sk(skill_level)
on conflict (state, zone, skill_level) do nothing;

alter table public.clients
  add column if not exists zone_dependency boolean not null default false;

alter table public.designations
  add column if not exists skill_level text;

update public.designations
set skill_level = 'UNSKILLED'
where skill_level is null;

alter table public.designations
  alter column skill_level set default 'UNSKILLED';

alter table public.designations
  alter column skill_level set not null;

alter table public.designations
  drop constraint if exists designations_skill_level_check;

alter table public.designations
  add constraint designations_skill_level_check
  check (skill_level in ('SKILLED', 'SEMI_SKILLED', 'UNSKILLED'));

alter table public.employees
  add column if not exists zone text;

alter table public.employees
  drop constraint if exists employees_zone_check;

alter table public.employees
  add constraint employees_zone_check
  check (zone is null or zone in ('zone1', 'zone2', 'zone3'));

-- AVAILABLE employees must not have a zone; later stages may have null or a valid zone.
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
