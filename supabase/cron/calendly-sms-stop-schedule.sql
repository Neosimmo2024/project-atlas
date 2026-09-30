-- QA only; run AFTER deployment and successful controlled /sync test.
-- Does not activate any Brevo workflow or any email cron.
select cron.schedule(
  'neos-calendly-sms-stop-15m',
  '*/15 * * * *',
  $job$
    select net.http_post(
      url := 'https://project-atlas-qa-beta-1-git-agent-calendly-fre-46509c-neos-immo.vercel.app/api/internal/calendly/sync',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'Authorization','Bearer ' || (
          select decrypted_secret from vault.decrypted_secrets
          where name='atlas_recruitment_cron_secret'
          order by created_at desc limit 1
        )
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
  $job$
);
-- Pause only this worker:
-- update public.calendly_sms_stop_state set enabled=false where singleton;
-- select cron.alter_job(jobid,active:=false) from cron.job where jobname='neos-calendly-sms-stop-15m';
-- Health: inspect both cron.job_run_details and calendly_sms_stop_runs.
-- Cron success alone only proves that the HTTP request was queued.
-- An expired/running run older than 2 minutes, failed run, missing recent run,
-- or nonzero unmatched/missingEmail needs investigation before SMS launch.
