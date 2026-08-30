create extension if not exists supabase_vault with schema vault;

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
