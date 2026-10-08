-- Super Admin can mark a client Active or Inactive. This is a status label only;
-- inactive clients keep all data and remain fully operable.

alter table public.clients
  add column if not exists is_active boolean not null default true,
  add column if not exists status_changed_at timestamptz null,
  add column if not exists status_changed_by uuid null references public.users (id) on delete set null;

comment on column public.clients.is_active is
  'Client status set by Super Admin (true = Active, false = Inactive).';
comment on column public.clients.status_changed_at is
  'When the Active/Inactive status was last changed (null if never changed).';
comment on column public.clients.status_changed_by is
  'Super Admin who last changed the Active/Inactive status.';
