-- Step 3: KYC (Aadhaar card images, PAN, bank details + passbook). Public bucket for onboarding URLs.

alter table public.job_app_form
  add column if not exists kyc_aadhar_front_url text,
  add column if not exists kyc_aadhar_back_url text,
  add column if not exists kyc_pan_number text,
  add column if not exists kyc_pan_card_url text,
  add column if not exists kyc_account_holder_name text,
  add column if not exists kyc_account_number text,
  add column if not exists kyc_ifsc_code text,
  add column if not exists kyc_bank_passbook_url text;

insert into storage.buckets (id, name, public)
values ('kyc-documents', 'kyc-documents', true)
on conflict (id) do update set public = true;
