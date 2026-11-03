-- Disabled QA-only scheduler. No cron job, secret or tenant is installed by this migration.
create extension if not exists pg_net with schema extensions;
create schema if not exists vsc_private;
revoke all on schema vsc_private from public,anon,authenticated;
grant usage on schema vsc_private to service_role;
create table vsc_private.collection_settings(
 id boolean primary key default true check(id),enabled boolean not null default false,
 tenant_id uuid references public.tenants(id),actor_id uuid references auth.users(id),
 check(not enabled or (tenant_id is not null and actor_id is not null))
);
insert into vsc_private.collection_settings(id) values(true);
create table vsc_private.collection_runs(
 nonce uuid primary key,tenant_id uuid not null references public.tenants(id),
 requested_at timestamptz not null default now(),request_id bigint,
 state text not null default 'queued' check(state in ('queued','running','complete','incomplete','failed','expired')),
 started_at timestamptz,finished_at timestamptz,summary jsonb,
 check(summary is null or (jsonb_typeof(summary)='object' and pg_column_size(summary)<=4096))
);
create index vsc_collection_runs_tenant_time_idx on vsc_private.collection_runs(tenant_id,requested_at desc);
create index vsc_collection_settings_actor_idx on vsc_private.collection_settings(actor_id);
create index vsc_collection_settings_tenant_idx on vsc_private.collection_settings(tenant_id);
alter table vsc_private.collection_settings enable row level security;
alter table vsc_private.collection_runs enable row level security;
revoke all on vsc_private.collection_settings,vsc_private.collection_runs from public,anon,authenticated,service_role;
grant select on vsc_private.collection_settings,vsc_private.collection_runs to service_role;
grant update(state,started_at,finished_at,summary) on vsc_private.collection_runs to service_role;

create function public.vsc_begin_collection(p_tenant_id uuid,p_actor_id uuid,p_nonce uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from vsc_private.collection_settings s join public.tenant_users tu on tu.tenant_id=s.tenant_id and tu.user_id=s.actor_id join public.roles r on r.id=tu.role_id
 where s.id and s.enabled and s.tenant_id=p_tenant_id and s.actor_id=p_actor_id and tu.status='active' and r.slug in ('owner','admin')) then return false;end if;
 update vsc_private.collection_runs set state='running',started_at=now()
 where nonce=p_nonce and tenant_id=p_tenant_id and state='queued' and requested_at between now()-interval '5 minutes' and now();
 return found;
end;
$$;
create function public.vsc_finish_collection(p_tenant_id uuid,p_nonce uuid,p_state text,p_summary jsonb)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 if p_state is null or p_state not in ('complete','incomplete','failed') or jsonb_typeof(p_summary) is distinct from 'object' or pg_column_size(p_summary)>4096 then raise exception 'Invalid collection result';end if;
 if exists(select 1 from jsonb_each(p_summary) e where
  (e.key in ('replies','historical','smsStops') and (jsonb_typeof(e.value)<>'string' or e.value#>>'{}' not in ('complete','incomplete','failed')))
  or (e.key in ('repliesInspected','repliesRecorded','historicalInspected','historicalHeld','historicalCancelled','sourceContacts','sourceSmsBlocked','unknownSmsStatus','unmappedSources','smsCancelled') and (jsonb_typeof(e.value)<>'number' or e.value::text !~ '^[0-9]{1,15}$'))
  or e.key not in ('replies','historical','smsStops','repliesInspected','repliesRecorded','historicalInspected','historicalHeld','historicalCancelled','sourceContacts','sourceSmsBlocked','unknownSmsStatus','unmappedSources','smsCancelled'))
 or (select count(*) from jsonb_object_keys(p_summary))<>13 then raise exception 'Invalid collection summary';end if;
 if (p_state='complete' and (p_summary->>'replies'<>'complete' or p_summary->>'historical'<>'complete' or p_summary->>'smsStops'<>'complete' or (p_summary->>'unknownSmsStatus')::bigint>0 or (p_summary->>'unmappedSources')::bigint>0)) then raise exception 'Incomplete collection cannot succeed';end if;
 update vsc_private.collection_runs set state=p_state,summary=p_summary,finished_at=now()
 where nonce=p_nonce and tenant_id=p_tenant_id and state='running';
 return found;
end;
$$;
revoke all on function public.vsc_begin_collection(uuid,uuid,uuid),public.vsc_finish_collection(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.vsc_begin_collection(uuid,uuid,uuid),public.vsc_finish_collection(uuid,uuid,text,jsonb) to service_role;

-- Only postgres/cron can call this private definer. The queue receives a short-lived
-- signature tied to a single nonce, never the Vault signing key or provider secrets.
create function vsc_private.enqueue_collection()
returns jsonb language plpgsql security definer set search_path='' as $$
declare s vsc_private.collection_settings%rowtype;k text;n uuid;stamp text;signature text;request bigint;
begin
 select * into s from vsc_private.collection_settings where id for update;
 if not found or not s.enabled then return jsonb_build_object('state','disabled');end if;
 if not exists(select 1 from public.tenant_users tu join public.roles r on r.id=tu.role_id where tu.tenant_id=s.tenant_id and tu.user_id=s.actor_id and tu.status='active' and r.slug in ('owner','admin')) then raise exception 'Active VSC administrator required';end if;
 if exists(select 1 from vsc_private.collection_runs where tenant_id=s.tenant_id and state in ('queued','running') and requested_at>=now()-interval '10 minutes') then return jsonb_build_object('state','already_pending');end if;
 update vsc_private.collection_runs set state='expired',finished_at=now() where tenant_id=s.tenant_id and state in ('queued','running') and requested_at<now()-interval '10 minutes';
 select decrypted_secret into k from vault.decrypted_secrets where name='vsc_collection_signing_key';
 if k is null or k !~ '^[a-f0-9]{64}$' then raise exception 'Collection signing key unavailable';end if;
 n:=pg_catalog.gen_random_uuid();stamp:=floor(extract(epoch from now()))::bigint::text;
 signature:=encode(extensions.hmac('GET'||chr(10)||'/api/cron/vsc-collection'||chr(10)||stamp||chr(10)||n::text,k,'sha256'),'hex');
 insert into vsc_private.collection_runs(nonce,tenant_id) values(n,s.tenant_id);
 select net.http_get(
  url:='https://project-atlas-qa-beta-1-git-feature-vsc-campai-f0c292-neos-immo.vercel.app/api/cron/vsc-collection',
  headers:=jsonb_build_object('x-vsc-timestamp',stamp,'x-vsc-nonce',n::text,'x-vsc-signature',signature,'Accept','application/json'),
  timeout_milliseconds:=300000) into request;
 update vsc_private.collection_runs set request_id=request where nonce=n;
 return jsonb_build_object('state','queued','nonce',n,'requestId',request);
end;
$$;
revoke all on function vsc_private.enqueue_collection() from public,anon,authenticated,service_role;
