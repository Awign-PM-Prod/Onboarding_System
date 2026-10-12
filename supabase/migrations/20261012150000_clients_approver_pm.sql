-- Optional Approver PM: when set, Extend DOJ and joining status change requests
-- from the client's PMs are reviewed by this PM instead of Super Admin.

alter table public.clients
  add column if not exists approver_pm_id uuid null references public.users(id) on delete set null;

create index if not exists clients_approver_pm_id_idx
  on public.clients (approver_pm_id);
