-- Schedule remaining-task-digest Edge Function daily at 10:00 Asia/Kolkata (04:30 UTC).
--
-- Prerequisites (run once in SQL editor / ops after deploy):
--   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--   select vault.create_secret('<same value as edge CRON_SECRET>', 'remaining_task_digest_cron_secret');
--
-- Edge secrets (CLI):
--   supabase secrets set CRON_SECRET=<long-random> FRONTEND_URL=https://your-frontend
--   supabase functions deploy remaining-task-digest
--
-- Manual invoke:
--   POST https://<project-ref>.supabase.co/functions/v1/remaining-task-digest
--   Authorization: Bearer <CRON_SECRET>
--
-- Confirm schedule in Dashboard → Database → Extensions (pg_cron) / cron.job if needed.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$
declare
  existing_jobid bigint;
begin
  select jobid into existing_jobid
  from cron.job
  where jobname = 'remaining-task-digest-daily'
  limit 1;

  if existing_jobid is not null then
    perform cron.unschedule(existing_jobid);
  end if;
end $$;

select cron.schedule(
  'remaining-task-digest-daily',
  '30 4 * * *', -- 10:00 Asia/Kolkata
  $cron$
  select
    net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url' limit 1)
        || '/functions/v1/remaining-task-digest',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'remaining_task_digest_cron_secret'
          limit 1
        )
      ),
      body := '{}'::jsonb
    ) as request_id;
  $cron$
);
