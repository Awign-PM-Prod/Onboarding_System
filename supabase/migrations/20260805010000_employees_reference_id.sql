-- Auto-generated Reference ID for onboarding; Emp Code only after Joined.

alter table public.employees
  add column if not exists reference_id text;

-- Backfill unique reference ids for existing rows.
update public.employees
set reference_id = 'APP-'
  || to_char(timezone('UTC', coalesce(created_at, now())), 'YYYYMMDD')
  || '-'
  || upper(substr(replace(id::text, '-', ''), 1, 6))
where reference_id is null;

-- Resolve any residual duplicates (should be rare).
with dups as (
  select id, reference_id,
    row_number() over (partition by reference_id order by created_at, id) as rn
  from public.employees
  where reference_id is not null
)
update public.employees e
set reference_id = e.reference_id || '-' || substr(replace(e.id::text, '-', ''), 7, 4)
from dups
where e.id = dups.id
  and dups.rn > 1;

alter table public.employees
  alter column reference_id set not null;

create unique index if not exists employees_reference_id_unique
  on public.employees (reference_id);

-- Existing Joined rows may lack emp_code (it was optional historically).
-- Assign a unique placeholder so the new constraint can be applied; PMs can
-- replace these with real StaffingGo codes later.
update public.employees
set emp_code = 'LEGACY-' || upper(substr(replace(id::text, '-', ''), 1, 10))
where joining_status in ('JOINED', 'JOINED_OTHER_DATE')
  and (emp_code is null or btrim(emp_code) = '');

-- Joined / joined-on-other-date employees must have a StaffingGo emp_code.
alter table public.employees
  drop constraint if exists employees_joined_requires_emp_code;

alter table public.employees
  add constraint employees_joined_requires_emp_code
  check (
    joining_status is null
    or joining_status not in ('JOINED', 'JOINED_OTHER_DATE')
    or emp_code is not null
  );
