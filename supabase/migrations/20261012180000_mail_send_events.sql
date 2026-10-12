-- Unified mail send ledger for onboarding + staff-invite tracking (Mail Tracker).

create table if not exists public.mail_send_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  mail_type text not null check (mail_type in ('onboarding', 'staff_invite')),
  send_kind text not null check (send_kind in ('send', 'resend')),
  status text not null check (status in ('sent', 'failed', 'skipped')),
  recipient_email text not null default '',
  recipient_name text,
  actor_user_id uuid references public.users (id) on delete set null,
  client_id uuid references public.clients (id) on delete set null,
  employee_id uuid references public.employees (id) on delete set null,
  target_user_id uuid references public.users (id) on delete set null,
  error text,
  meta jsonb
);

create index if not exists mail_send_events_created_at_idx
  on public.mail_send_events (created_at desc);

create index if not exists mail_send_events_type_kind_created_at_idx
  on public.mail_send_events (mail_type, send_kind, created_at desc);
