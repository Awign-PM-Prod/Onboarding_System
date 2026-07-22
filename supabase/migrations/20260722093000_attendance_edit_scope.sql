-- Scoped unlock: PL_ONLY / ALL_PMS / SHARED edit access on attendance sheets

alter table public.attendance_sheets
  add column if not exists edit_scope text not null default 'NONE';

alter table public.attendance_sheets
  drop constraint if exists attendance_sheets_edit_scope_check;

alter table public.attendance_sheets
  add constraint attendance_sheets_edit_scope_check
  check (edit_scope in ('NONE', 'PL_ONLY', 'ALL_PMS', 'SHARED'));

-- Backfill: previously unlocked sheets were editable by the assigned PM
update public.attendance_sheets
set edit_scope = 'ALL_PMS'
where locked = false;

create table if not exists public.attendance_edit_grants (
  id uuid primary key default gen_random_uuid(),
  sheet_id uuid not null references public.attendance_sheets(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (sheet_id, user_id)
);

create index if not exists attendance_edit_grants_sheet_id_idx
  on public.attendance_edit_grants (sheet_id);

create index if not exists attendance_edit_grants_user_id_idx
  on public.attendance_edit_grants (user_id);
