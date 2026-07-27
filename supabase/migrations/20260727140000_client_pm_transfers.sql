-- Audit log when a client is reassigned to a different program manager

create table if not exists public.client_pm_transfers (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  from_program_manager_id uuid references public.users(id) on delete set null,
  to_program_manager_id uuid not null references public.users(id) on delete restrict,
  transferred_by uuid not null references public.users(id) on delete restrict,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists client_pm_transfers_client_id_created_at_idx
  on public.client_pm_transfers (client_id, created_at desc);
