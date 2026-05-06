-- Public URL of driving license image (Supabase Storage: bucket driving-licenses).

alter table public.job_app_form
  add column if not exists pd_driving_license_url text;

-- Public bucket so getPublicUrl works for onboarding links (tighten later if needed).
insert into storage.buckets (id, name, public)
values ('driving-licenses', 'driving-licenses', true)
on conflict (id) do update set public = true;
