-- Many-to-many: a client can be accessible to multiple program managers.

create table if not exists public.client_program_managers (
  client_id uuid not null references public.clients(id) on delete cascade,
  program_manager_id uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (client_id, program_manager_id)
);

create index if not exists client_program_managers_pm_id_idx
  on public.client_program_managers (program_manager_id);

-- Backfill from the existing single program_manager_id column.
insert into public.client_program_managers (client_id, program_manager_id)
select id, program_manager_id
from public.clients
where program_manager_id is not null
on conflict do nothing;
