-- Allow one extra update for the chain:
-- NOT_JOINED -> JOINED_OTHER_DATE -> JOINED_ABSCONDED

alter table public.employees
  drop constraint if exists employees_joining_status_change_count_range;

alter table public.employees
  add constraint employees_joining_status_change_count_range
  check (joining_status_change_count between 0 and 3);
