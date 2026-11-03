-- Empty preparation store. No real recipients, approval or send capability in migrations.
create table vsc_private.technical_pilot_targets (
 tenant_id uuid primary key references public.tenants(id),
 confirmed_by uuid not null references auth.users(id),
 email text not null check(length(email)<=254 and email ~ '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+[.][a-zA-Z]{2,63}$'),
 mobile text not null check(mobile ~ '^[+]33[67][0-9]{8}$'),
 confirmed_at timestamptz not null default now()
);
create index vsc_technical_pilot_actor_idx on vsc_private.technical_pilot_targets(confirmed_by);
alter table vsc_private.technical_pilot_targets enable row level security;
revoke all on vsc_private.technical_pilot_targets from public,anon,authenticated,service_role;
grant select on vsc_private.technical_pilot_targets to service_role;

create function public.vsc_technical_pilot_status(p_tenant_id uuid,p_actor_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('emailMasked',left(t.email,1)||'***@'||split_part(t.email,'@',2),
 'mobileMasked','+33 ** ** ** '||right(t.mobile,4),'confirmedAt',t.confirmed_at,
 'readOnly',true,'sendingEnabled',false)
 from vsc_private.technical_pilot_targets t
 where t.tenant_id=p_tenant_id and t.confirmed_by=p_actor_id and exists(
  select 1 from public.tenant_users tu join public.roles r on r.id=tu.role_id
  where tu.tenant_id=t.tenant_id and tu.user_id=p_actor_id and tu.status='active' and r.slug in ('owner','admin')
 );
$$;
revoke all on function public.vsc_technical_pilot_status(uuid,uuid) from public,anon,authenticated;
grant execute on function public.vsc_technical_pilot_status(uuid,uuid) to service_role;
