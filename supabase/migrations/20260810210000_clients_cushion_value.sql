-- Optional per-client CTC cushion (absolute ₹ or % of min monthly CTC).

alter table public.clients
  add column if not exists cushion_type text;

alter table public.clients
  add column if not exists cushion_value numeric;

alter table public.clients
  drop constraint if exists clients_cushion_type_check;

alter table public.clients
  add constraint clients_cushion_type_check
  check (cushion_type is null or cushion_type in ('ABSOLUTE', 'PERCENTAGE'));

alter table public.clients
  drop constraint if exists clients_cushion_value_check;

alter table public.clients
  add constraint clients_cushion_value_check
  check (cushion_value is null or cushion_value >= 0);

alter table public.clients
  drop constraint if exists clients_cushion_pair_check;

alter table public.clients
  add constraint clients_cushion_pair_check
  check (
    (cushion_type is null and cushion_value is null)
    or (
      cushion_type is not null
      and cushion_value is not null
      and (cushion_type <> 'PERCENTAGE' or cushion_value <= 100)
    )
  );
