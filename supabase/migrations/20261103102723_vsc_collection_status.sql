-- Non-secret health information only, available through the application's service role.
create function public.vsc_collection_status(p_tenant_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s vsc_private.collection_settings%rowtype;scheduled boolean:=false;runs jsonb;
begin
 select * into s from vsc_private.collection_settings where id and tenant_id=p_tenant_id;
 if not found then return null;end if;
 if to_regclass('cron.job') is not null then
  execute 'select exists(select 1 from cron.job where jobname=''vsc-collection-10m'' and active and schedule=''*/10 * * * *'')' into scheduled;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('requestedAt',r.requested_at,'finishedAt',r.finished_at,'state',r.state,'summary',r.summary) order by r.requested_at desc),'[]'::jsonb) into runs
 from (select requested_at,finished_at,state,summary from vsc_private.collection_runs where tenant_id=p_tenant_id order by requested_at desc,nonce limit 10) r;
 return jsonb_build_object('enabled',s.enabled,'scheduled',scheduled,
  'actorActive',exists(select 1 from public.tenant_users tu join public.roles ro on ro.id=tu.role_id where tu.tenant_id=s.tenant_id and tu.user_id=s.actor_id and tu.status='active' and ro.slug in ('owner','admin')),
  'signingConfigured',exists(select 1 from vault.secrets where name='vsc_collection_signing_key'),'runs',runs);
end;
$$;
revoke all on function public.vsc_collection_status(uuid) from public,anon,authenticated;
grant execute on function public.vsc_collection_status(uuid) to service_role;
