-- Lot 9B — Native Atlas/Supabase orchestration recipe.
-- This file is intentionally NOT a migration and is NOT applied automatically.
-- It must only be executed on an explicitly authorized environment after replacing
-- the endpoint and bearer secret placeholders with environment-specific values.
-- No secret must ever be committed to this repository.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Remove any previous job with the same name before recreating it.
select cron.unschedule(jobid)
from cron.job
where jobname = 'atlas-recruitment-email-follow-ups-lot-9b';

select cron.schedule(
  'atlas-recruitment-email-follow-ups-lot-9b',
  '*/15 * * * *',
  $cron$
    select net.http_post(
      url := 'https://REPLACE_WITH_AUTHORIZED_ATLAS_HOST/api/internal/recruitment-email/orchestrate',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer REPLACE_WITH_SERVER_SECRET'
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 120000
    );
  $cron$
);

-- Verification query after explicit activation:
-- select jobid, jobname, schedule, active from cron.job
-- where jobname = 'atlas-recruitment-email-follow-ups-lot-9b';
