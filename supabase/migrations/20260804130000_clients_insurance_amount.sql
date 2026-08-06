-- Add insurance amount on clients (required when insurance is applicable).

alter table public.clients
  add column if not exists insurance_amount numeric(12, 2);

-- Existing insured clients have no amount yet; use 0 so the check can apply.
-- Edit those clients later to set the real amount.
update public.clients
set insurance_amount = 0
where insurance_applicable = true
  and insurance_amount is null;

alter table public.clients
  drop constraint if exists clients_insurance_amount_required;

alter table public.clients
  add constraint clients_insurance_amount_required
  check (
    insurance_applicable = false
    or (insurance_amount is not null and insurance_amount >= 0)
  );
