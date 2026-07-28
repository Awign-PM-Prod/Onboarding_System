-- Versioned client attendance policy (effective from month)

create table if not exists public.client_policy_versions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  effective_from_month date not null,
  policy_json jsonb not null,
  actor_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (client_id, effective_from_month)
);

create index if not exists client_policy_versions_client_effective_idx
  on public.client_policy_versions (client_id, effective_from_month desc);

-- Backfill one baseline version per client from current live policy tables
insert into public.client_policy_versions (client_id, effective_from_month, policy_json)
select
  p.client_id,
  '2000-01-01'::date,
  jsonb_build_object(
    'attendance_policy', to_jsonb(p) - 'client_id' - 'created_at' - 'updated_at',
    'leave_allowances', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'designation', la.designation,
          'sick_days', la.sick_days,
          'paid_days', la.paid_days,
          'maternity_days', la.maternity_days,
          'paternity_days', la.paternity_days,
          'earned_days', la.earned_days
        )
        order by la.designation
      )
      from public.client_leave_allowances la
      where la.client_id = p.client_id
    ), '[]'::jsonb),
    'holidays', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'holiday_date', to_char(h.holiday_date, 'YYYY-MM-DD'),
          'holiday_type', 'NH'
        )
        order by h.holiday_date
      )
      from public.client_holidays h
      where h.client_id = p.client_id
    ), '[]'::jsonb)
  )
from public.client_attendance_policies p
on conflict (client_id, effective_from_month) do nothing;
