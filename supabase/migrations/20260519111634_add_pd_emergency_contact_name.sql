-- Personal details: emergency contact attributes (number reuses pd_alternate_number).

alter table public.job_app_form
  add column if not exists pd_emergency_contact_name text,
  add column if not exists pd_emergency_contact_relation text,
  add column if not exists pd_current_address_same_as_aadhaar boolean,
  add column if not exists pd_current_address text;
