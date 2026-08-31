-- Lot 9B — Native Atlas/Supabase orchestration recipe.
-- QA redeploy marker: refresh Preview after BREVO_API_KEY scope update.
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
  if p_secret is null or length(trim(p_secret)) < 32 then return false; end if;
  select decrypted_secret into v_expected
  from vault.decrypted_secrets
  where name = 'atlas_recruitment_cron_secret'
  order by created_at desc
  limit 1;
  if v_expected is null then return false; end if;
  return v_expected = trim(p_secret);
end;
$$;

create or replace function public.get_vault_secret_value(p_name text)
returns text
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
declare
  v_value text;
begin
  select decrypted_secret into v_value
  from vault.decrypted_secrets
  where name = trim(p_name)
  order by created_at desc
  limit 1;
  return v_value;
end;
$$;

create or replace function public.set_vault_secret_value(p_name text, p_value text, p_description text default null)
returns void
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
declare
  v_id uuid;
begin
  select id into v_id from vault.secrets where name = trim(p_name) order by created_at desc limit 1;
  if v_id is null then
    perform vault.create_secret(p_value, trim(p_name), p_description, null);
  else
    perform vault.update_secret(v_id, p_value, trim(p_name), p_description, null);
  end if;
end;
$$;

create or replace function public.get_recruitment_follow_up_template_id(p_step_index integer)
returns integer
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
declare
  v_name text;
  v_value text;
begin
  if p_step_index = 1 then
    v_name := 'brevo_recruitment_follow_up_1_template_id';
  elsif p_step_index = 2 then
    v_name := 'brevo_recruitment_follow_up_2_template_id';
  else
    return null;
  end if;
  select public.get_vault_secret_value(v_name) into v_value;
  if v_value ~ '^[0-9]+$' then return v_value::integer; end if;
  return null;
end;
$$;

revoke all on function public.verify_recruitment_cron_secret(text) from public, anon, authenticated;
revoke all on function public.get_vault_secret_value(text) from public, anon, authenticated;
revoke all on function public.set_vault_secret_value(text, text, text) from public, anon, authenticated;
revoke all on function public.get_recruitment_follow_up_template_id(integer) from public, anon, authenticated;
grant execute on function public.verify_recruitment_cron_secret(text) to service_role;
grant execute on function public.get_vault_secret_value(text) to service_role;
grant execute on function public.set_vault_secret_value(text, text, text) to service_role;
grant execute on function public.get_recruitment_follow_up_template_id(integer) to service_role;

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
