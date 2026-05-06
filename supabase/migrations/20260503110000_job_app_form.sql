-- Job application form: one row per employee (snapshot + Aadhaar collected on public flow).

create table if not exists public.job_app_form (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null unique references public.employees (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  name text not null,
  mobile text not null,
  email text,
  designation text,
  aadhaar_number text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists job_app_form_client_id_idx
  on public.job_app_form (client_id);

create index if not exists job_app_form_employee_id_idx
  on public.job_app_form (employee_id);
