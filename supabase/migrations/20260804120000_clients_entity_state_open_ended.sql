-- Client creation: entity, state, and open-ended contract support.

alter table public.clients
  add column if not exists entity text,
  add column if not exists state text,
  add column if not exists open_ended_contract boolean not null default false;

alter table public.clients
  alter column contract_end_date drop not null;

alter table public.clients
  drop constraint if exists clients_contract_dates_valid;

alter table public.clients
  add constraint clients_contract_dates_valid
  check (
    contract_end_date is null
    or contract_end_date >= contract_start_date
  );

alter table public.clients
  drop constraint if exists clients_open_ended_end_date;

alter table public.clients
  add constraint clients_open_ended_end_date
  check (
    (open_ended_contract = true and contract_end_date is null)
    or (open_ended_contract = false and contract_end_date is not null)
  );
