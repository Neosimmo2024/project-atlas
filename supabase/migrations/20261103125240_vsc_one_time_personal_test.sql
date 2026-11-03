-- Empty one-time authorization ledger. User-authorized rows are installed only in QA, outside migrations.
create table vsc_private.technical_pilot_attempts(
 tenant_id uuid not null references public.tenants(id),channel text not null check(channel in ('email','sms')),
 id uuid not null unique default gen_random_uuid(),approved_by uuid not null references auth.users(id),
 target_confirmed_at timestamptz not null,approved_at timestamptz not null default now(),expires_at timestamptz not null,
 state text not null default 'authorized' check(state in ('authorized','running','accepted','rejected','unknown')),
 started_at timestamptz,finished_at timestamptz,provider_reference text check(length(provider_reference)<=200),
 primary key(tenant_id,channel),check(expires_at>approved_at)
);
create index vsc_technical_pilot_attempt_actor_idx on vsc_private.technical_pilot_attempts(approved_by);
alter table vsc_private.technical_pilot_attempts enable row level security;
revoke all on vsc_private.technical_pilot_attempts from public,anon,authenticated,service_role;
grant select on vsc_private.technical_pilot_attempts to service_role;
grant update(state,started_at,finished_at,provider_reference) on vsc_private.technical_pilot_attempts to service_role;

create function public.vsc_claim_personal_test(p_tenant_id uuid,p_actor_id uuid,p_channel text,p_confirmed_at timestamptz)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare a vsc_private.technical_pilot_attempts%rowtype;t vsc_private.technical_pilot_targets%rowtype;
begin
 if p_channel not in ('email','sms') or p_channel is null then return null;end if;
 select * into t from vsc_private.technical_pilot_targets where tenant_id=p_tenant_id and confirmed_by=p_actor_id and confirmed_at=p_confirmed_at;
 if not found or not exists(select 1 from public.tenant_users tu join public.roles r on r.id=tu.role_id where tu.tenant_id=p_tenant_id and tu.user_id=p_actor_id and tu.status='active' and r.slug in ('owner','admin')) then return null;end if;
 update vsc_private.technical_pilot_attempts set state='running',started_at=now()
 where tenant_id=p_tenant_id and channel=p_channel and approved_by=p_actor_id and target_confirmed_at=t.confirmed_at and state='authorized' and now() between approved_at and expires_at returning * into a;
 if not found then return null;end if;
 return jsonb_build_object('id',a.id,'channel',a.channel,'recipient',case when p_channel='email' then t.email else t.mobile end);
end $$;

create function public.vsc_finish_personal_test(p_tenant_id uuid,p_actor_id uuid,p_id uuid,p_state text,p_reference text)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 if p_state is null or p_state not in ('accepted','rejected','unknown') or (p_reference is not null and (p_state<>'accepted' or p_reference !~ '^[a-zA-Z0-9<>@._:+-]{1,200}$')) then raise exception 'Invalid technical receipt';end if;
 update vsc_private.technical_pilot_attempts set state=p_state,provider_reference=p_reference,finished_at=now()
 where tenant_id=p_tenant_id and approved_by=p_actor_id and id=p_id and state='running';
 return found;
end $$;
revoke all on function public.vsc_claim_personal_test(uuid,uuid,text,timestamptz),public.vsc_finish_personal_test(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.vsc_claim_personal_test(uuid,uuid,text,timestamptz),public.vsc_finish_personal_test(uuid,uuid,uuid,text,text) to service_role;
