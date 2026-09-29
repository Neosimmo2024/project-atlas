-- Preserve tenant policies and legitimate RPCs; remove unnecessary API rights.
revoke truncate, references, trigger on all tables in schema public from public, anon, authenticated;
alter default privileges in schema public revoke truncate, references, trigger on tables from public, anon, authenticated;

-- Only trusted triggers/server operations may append to the audit journal.
drop policy if exists audit_log_insert_for_members on public.audit_log;
revoke insert, update, delete on public.audit_log from public, anon, authenticated;
alter function public.set_updated_at() set search_path = pg_catalog;

-- Remove inherited PUBLIC access without breaking intentionally authenticated
-- business RPCs or trusted server callers. Trigger functions are not RPCs.
do $$
declare f record;
begin
  for f in
    select p.oid, p.oid::regprocedure as signature,
      p.prorettype in ('trigger'::regtype, 'event_trigger'::regtype) as is_trigger,
      has_function_privilege('authenticated', p.oid, 'execute') as auth_allowed,
      has_function_privilege('service_role', p.oid, 'execute') as service_allowed
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
      and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass
        and d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('revoke execute on function %s from public, anon', f.signature);
    if f.is_trigger then
      execute format('revoke execute on function %s from authenticated', f.signature);
    elsif f.auth_allowed then
      execute format('grant execute on function %s to authenticated', f.signature);
    end if;
    if f.service_allowed then
      execute format('grant execute on function %s to service_role', f.signature);
    end if;
  end loop;
end $$;

-- Do not delete or rewrite history. Existing duplicate keys abort migration
-- and require explicit reconciliation before rollout.
create unique index tasks_candidate_reply_unique
  on public.tasks (tenant_id, person_id, (metadata ->> 'inbound_message_id'))
  where deleted_at is null
    and metadata ->> 'source' = 'recruitment_candidate_reply'
    and metadata ->> 'inbound_message_id' is not null;
