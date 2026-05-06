-- Backfill pd_city from Aadhaar district and pd_age from Aadhaar DOB for existing rows.

update public.job_app_form
set pd_city = nullif(trim(aad_district), '')
where aad_district is not null
  and trim(aad_district) <> '';

update public.job_app_form
set pd_age = (extract(year from age (current_date, aad_dob::date)))::smallint
where aad_dob is not null;
