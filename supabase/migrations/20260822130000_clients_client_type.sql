-- Client classification: compliance vs non-compliance onboarding.

alter table public.clients
  add column if not exists client_type text not null default 'COMPLIANCE';

alter table public.clients
  drop constraint if exists clients_client_type_check;

alter table public.clients
  add constraint clients_client_type_check
  check (client_type in ('COMPLIANCE', 'NON_COMPLIANCE'));
