-- PM bulk-alert send history: one send row plus per-recipient outcomes.

create table if not exists public.pm_bulk_alert_sends (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  sender_user_id uuid not null references public.users (id) on delete cascade,
  mode text not null check (mode in ('single', 'bulk')),
  subject text not null,
  message text not null,
  client_id uuid references public.clients (id) on delete set null,
  employee_id uuid references public.employees (id) on delete set null,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  skipped_count integer not null default 0
);

create index if not exists pm_bulk_alert_sends_sender_created_at_idx
  on public.pm_bulk_alert_sends (sender_user_id, created_at desc);

create table if not exists public.pm_bulk_alert_recipients (
  id uuid primary key default gen_random_uuid(),
  send_id uuid not null references public.pm_bulk_alert_sends (id) on delete cascade,
  employee_id uuid references public.employees (id) on delete set null,
  name text not null default '',
  email text not null default '',
  status text not null check (status in ('sent', 'failed', 'skipped')),
  error text
);

create index if not exists pm_bulk_alert_recipients_send_id_idx
  on public.pm_bulk_alert_recipients (send_id);
