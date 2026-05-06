-- Step 2: Qualification (highest qualification + certificate URLs).

alter table public.job_app_form
  add column if not exists qual_highest_qualification text,
  add column if not exists qual_education_certificate_url text,
  add column if not exists qual_additional_certificates_url jsonb not null default '[]'::jsonb;

insert into storage.buckets (id, name, public)
values ('qualification-certificates', 'qualification-certificates', true)
on conflict (id) do update set public = true;
