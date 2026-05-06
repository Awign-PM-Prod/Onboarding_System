-- Step 4: Bank & Photo — passport photo, optional ESIC / PF UAN / police verification document.

alter table public.job_app_form
  add column if not exists bp_passport_photo_url text,
  add column if not exists bp_esic_number text,
  add column if not exists bp_pf_uan_number text,
  add column if not exists bp_police_verification_url text;

insert into storage.buckets (id, name, public)
values ('bank-photo-documents', 'bank-photo-documents', true)
on conflict (id) do update set public = true;
