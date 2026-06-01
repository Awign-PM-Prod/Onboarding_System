alter table public.job_app_form
  add column if not exists kyc_bank_ifsc_details text;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'job_app_form'
      and column_name = 'kyc_bank_ifsc_details'
      and data_type = 'jsonb'
  ) then
    alter table public.job_app_form
      alter column kyc_bank_ifsc_details type text
      using nullif(trim(both '"' from kyc_bank_ifsc_details::text), '');
  end if;
end $$;
