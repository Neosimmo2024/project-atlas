-- Lot 9B — Native Atlas/Supabase orchestration recipe.
-- This file is intentionally NOT a migration and is NOT applied automatically.
-- It must only be executed on an explicitly authorized environment after replacing
-- the Atlas endpoint placeholder. The bearer secret must already exist in Supabase Vault
-- under the name `atlas_recruitment_cron_secret`.
-- No secret must ever be committed to this repository or embedded in cron.job.

create extension if not exists supabase_vault with schema vault;
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

create or replace function public.verify_recruitment_cron_secret(p_secret text)
returns boolean
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
declare
  v_expected text;
begin
  if p_secret is null or length(trim(p_secret)) < 32 then
    return false;
  end if;

  select decrypted_secret
  into v_expected
  from vault.decrypted_secrets
  where name = 'atlas_recruitment_cron_secret'
  order by created_at desc
  limit 1;

  if v_expected is null then
    return false;
  end if;

  return v_expected = trim(p_secret);
end;
$$;

revoke all on function public.verify_recruitment_cron_secret(text) from public, anon, authenticated;
grant execute on function public.verify_recruitment_cron_secret(text) to service_role;

-- Prerequisite (performed separately in the authorized environment only):
-- create secret in Supabase Vault named `atlas_recruitment_cron_secret`.

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
        'Authorization', 'Bearer ' || (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'atlas_recruitment_cron_secret'
          order by created_at desc
          limit 1
        )
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 120000
    );
  $cron$
);

-- Verification query after explicit activation:
-- select jobid, jobname, schedule, active from cron.job
-- where jobname = 'atlas-recruitment-email-follow-ups-lot-9b';
