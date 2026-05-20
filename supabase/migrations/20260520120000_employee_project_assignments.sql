-- Track project assignment history per employee.
-- One employee can be active in only one project at a time.

create table if not exists public.employee_project_assignments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  assignment_status text not null,
  assigned_at timestamptz not null default now(),
  left_at timestamptz,
  left_reason text,
  transferred_by uuid references public.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.employee_project_assignments
  drop constraint if exists employee_project_assignments_status_check;

alter table public.employee_project_assignments
  add constraint employee_project_assignments_status_check
  check (assignment_status in ('ACTIVE', 'INACTIVE'));

alter table public.employee_project_assignments
  drop constraint if exists employee_project_assignments_left_fields_check;

alter table public.employee_project_assignments
  add constraint employee_project_assignments_left_fields_check
  check (
    (assignment_status = 'ACTIVE' and left_at is null)
    or assignment_status = 'INACTIVE'
  );

create index if not exists employee_project_assignments_employee_idx
  on public.employee_project_assignments (employee_id, assigned_at desc);

create index if not exists employee_project_assignments_client_idx
  on public.employee_project_assignments (client_id, assignment_status);

create unique index if not exists employee_project_assignments_one_active_per_employee
  on public.employee_project_assignments (employee_id)
  where assignment_status = 'ACTIVE';

-- Prevent duplicate assignment records for same employee-client pair.
create unique index if not exists employee_project_assignments_unique_employee_client
  on public.employee_project_assignments (employee_id, client_id);

-- Backfill active assignment rows for existing employees.
insert into public.employee_project_assignments (
  employee_id,
  client_id,
  assignment_status,
  assigned_at,
  created_at,
  updated_at
)
select
  e.id,
  e.client_id,
  'ACTIVE',
  coalesce(e.created_at, now()),
  now(),
  now()
from public.employees e
where not exists (
  select 1
  from public.employee_project_assignments a
  where a.employee_id = e.id
);
