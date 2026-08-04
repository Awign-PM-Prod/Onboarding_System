-- Add insurance amount on clients (required when insurance is applicable).

alter table public.clients
  add column if not exists insurance_amount numeric(12, 2);

alter table public.clients
  drop constraint if exists clients_insurance_amount_required;

alter table public.clients
  add constraint clients_insurance_amount_required
  check (
    insurance_applicable = false
    or (insurance_amount is not null and insurance_amount >= 0)
  );
