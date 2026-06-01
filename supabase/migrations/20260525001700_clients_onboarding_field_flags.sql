-- Client-level toggles to control onboarding form fields.

alter table public.clients
  add column if not exists require_license_upload boolean not null default true,
  add column if not exists require_qualification_certificate_upload boolean not null default true;
