-- Custom client holidays are per employee work state (not client contract state).

alter table public.client_holidays
  add column if not exists state text;

alter table public.client_holidays
  drop constraint if exists client_holidays_client_id_holiday_date_holiday_type_key;

create unique index if not exists client_holidays_client_state_date_uidx
  on public.client_holidays (client_id, state, holiday_date)
  where state is not null and length(trim(state)) > 0;

create unique index if not exists client_holidays_client_date_legacy_uidx
  on public.client_holidays (client_id, holiday_date)
  where state is null or length(trim(state)) = 0;
