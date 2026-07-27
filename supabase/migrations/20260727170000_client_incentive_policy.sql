-- Client attendance policy: incentive rules

alter table public.client_attendance_policies
  add column if not exists incentive_applicable boolean not null default false,
  add column if not exists incentive_min_days smallint not null default 26
    check (incentive_min_days >= 0),
  add column if not exists incentive_value numeric not null default 0
    check (incentive_value >= 0);
