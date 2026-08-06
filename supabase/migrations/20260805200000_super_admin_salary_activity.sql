-- SUPER_ADMIN role + state CTC minimums + org-wide activity logs.
-- Bootstrap a Super Admin manually: create Auth user, then insert into public.users with role SUPER_ADMIN.

alter table public.users
  drop constraint if exists users_role_check;

alter table public.users
  add constraint users_role_check
  check (role in ('PAYROLL_LEAD', 'PROGRAM_MANAGER', 'PAYROLL_HEAD', 'SUPER_ADMIN'));

create table if not exists public.state_salary_minimums (
  state text primary key,
  min_monthly_ctc numeric not null check (min_monthly_ctc >= 0),
  updated_by uuid references public.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.org_activity_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_user_id uuid references public.users (id) on delete set null,
  actor_role text,
  actor_name text,
  action text not null,
  entity_type text,
  entity_id text,
  client_id uuid references public.clients (id) on delete set null,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists org_activity_logs_created_at_idx
  on public.org_activity_logs (created_at desc);

create index if not exists org_activity_logs_client_id_created_at_idx
  on public.org_activity_logs (client_id, created_at desc);

create index if not exists org_activity_logs_action_created_at_idx
  on public.org_activity_logs (action, created_at desc);
