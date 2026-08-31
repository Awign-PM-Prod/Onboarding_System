-- Named leave-config templates (Default + optional 1:1 client templates)
-- with state-wise accrual / fixed / N/A rules.

create table if not exists public.leave_config_defs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_default boolean not null default false,
  client_id uuid unique references public.clients(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leave_config_defs_name_len check (char_length(trim(name)) between 1 and 100)
);

create unique index if not exists leave_config_defs_name_uidx
  on public.leave_config_defs (lower(trim(name)));

create unique index if not exists leave_config_defs_one_default_uidx
  on public.leave_config_defs (is_default)
  where is_default = true;

insert into public.leave_config_defs (name, is_default)
select 'Default', true
where not exists (
  select 1 from public.leave_config_defs d where d.is_default = true
);

create table if not exists public.leave_config_rules (
  id uuid primary key default gen_random_uuid(),
  config_id uuid not null references public.leave_config_defs(id) on delete cascade,
  state text not null,
  leave_type text not null
    check (leave_type in (
      'earned_privileged',
      'casual',
      'sick',
      'maternity',
      'paternity'
    )),
  not_applicable boolean not null default false,
  accrual_rules jsonb not null default '[]'::jsonb,
  fixed_days numeric null,
  accumulation_limit numeric null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leave_config_rules_config_state_type_key unique (config_id, state, leave_type),
  constraint leave_config_rules_fixed_days_nonneg
    check (fixed_days is null or fixed_days >= 0),
  constraint leave_config_rules_accumulation_nonneg
    check (accumulation_limit is null or accumulation_limit >= 0)
);

create index if not exists leave_config_rules_config_id_idx
  on public.leave_config_rules (config_id);

create index if not exists leave_config_rules_config_state_idx
  on public.leave_config_rules (config_id, state);

alter table public.client_attendance_policies
  add column if not exists leave_source text not null default 'default';

alter table public.client_attendance_policies
  drop constraint if exists client_attendance_policies_leave_source_check;

alter table public.client_attendance_policies
  add constraint client_attendance_policies_leave_source_check
  check (leave_source in ('default', 'custom'));

alter table public.client_attendance_policies
  add column if not exists leave_config_id uuid
    references public.leave_config_defs(id) on delete set null;
