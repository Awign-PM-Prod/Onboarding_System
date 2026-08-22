-- Named holiday calendars: one shared Default plus optional 1:1 client calendars.

create table if not exists public.holiday_calendar_defs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_default boolean not null default false,
  client_id uuid unique references public.clients(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint holiday_calendar_defs_name_len check (char_length(trim(name)) between 1 and 100)
);

create unique index if not exists holiday_calendar_defs_name_uidx
  on public.holiday_calendar_defs (lower(trim(name)));

create unique index if not exists holiday_calendar_defs_one_default_uidx
  on public.holiday_calendar_defs (is_default)
  where is_default = true;

insert into public.holiday_calendar_defs (name, is_default)
select 'Default', true
where not exists (
  select 1 from public.holiday_calendar_defs d where d.is_default = true
);

alter table public.holiday_calendars
  add column if not exists calendar_id uuid references public.holiday_calendar_defs(id) on delete cascade;

update public.holiday_calendars hc
set calendar_id = d.id
from public.holiday_calendar_defs d
where hc.calendar_id is null
  and d.is_default = true;

alter table public.holiday_calendars
  drop constraint if exists holiday_calendars_state_holiday_date_key;

drop index if exists public.holiday_calendars_state_date_idx;

alter table public.holiday_calendars
  alter column calendar_id set not null;

alter table public.holiday_calendars
  drop constraint if exists holiday_calendars_calendar_state_date_key;

alter table public.holiday_calendars
  add constraint holiday_calendars_calendar_state_date_key unique (calendar_id, state, holiday_date);

create index if not exists holiday_calendars_calendar_id_idx
  on public.holiday_calendars (calendar_id);

alter table public.client_attendance_policies
  add column if not exists holiday_calendar_id uuid references public.holiday_calendar_defs(id) on delete set null;

-- Custom clients: one named calendar each, dates copied from client_holidays.
insert into public.holiday_calendar_defs (name, is_default, client_id)
select
  left(
    coalesce(nullif(trim(c.client_name), ''), 'Client')
      || ' calendar ('
      || substr(replace(c.id::text, '-', ''), 1, 8)
      || ')',
    100
  ),
  false,
  c.id
from public.clients c
inner join public.client_attendance_policies p on p.client_id = c.id
where p.holiday_source = 'custom'
  and coalesce(p.holiday_calendar_id::text, '') = ''
  and not exists (
    select 1 from public.holiday_calendar_defs d where d.client_id = c.id
  );

insert into public.holiday_calendars (
  calendar_id,
  state,
  holiday_date,
  weekday,
  holiday_type,
  holiday_name,
  updated_at
)
select
  d.id,
  trim(ch.state),
  ch.holiday_date,
  case extract(dow from ch.holiday_date)::int
    when 0 then 'Sunday'
    when 1 then 'Monday'
    when 2 then 'Tuesday'
    when 3 then 'Wednesday'
    when 4 then 'Thursday'
    when 5 then 'Friday'
    else 'Saturday'
  end,
  case when ch.holiday_type = 'FH' then 'FH' else 'NH' end,
  nullif(trim(ch.holiday_name), ''),
  now()
from public.client_holidays ch
inner join public.holiday_calendar_defs d on d.client_id = ch.client_id
where ch.state is not null
  and length(trim(ch.state)) > 0
on conflict (calendar_id, state, holiday_date) do nothing;

update public.client_attendance_policies p
set holiday_calendar_id = d.id
from public.holiday_calendar_defs d
where d.client_id = p.client_id
  and p.holiday_source = 'custom'
  and p.holiday_calendar_id is null;
