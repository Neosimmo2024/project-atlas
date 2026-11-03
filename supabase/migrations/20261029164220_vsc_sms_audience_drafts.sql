-- Immutable recipient preparation only; no campaign, delivery, provider change or send.
create function public.vsc_sms_audience_contacts(p_tenant_id uuid)
returns table(id uuid,display_name text,mobile text,has_email boolean)
language sql stable security invoker set search_path = '' as $$
  with phones as materialized (
    select p.*,public.vsc_normalize_fr_mobile(p.primary_phone) as normalized
    from public.people p where p.tenant_id=p_tenant_id
  ), eligible as (
    select p.id,p.display_name,p.normalized as mobile,
      (coalesce(p.primary_email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$',false)
        and not exists(select 1 from public.vsc_contact_suppressions s
          where s.tenant_id=p_tenant_id and s.person_id=p.id and s.channel in ('all','email'))) as has_email
    from phones p
    where p.normalized is not null and p.contact_allowed is true and p.do_not_contact is false
      and not exists(select 1 from phones alias where alias.normalized=p.normalized and (
        alias.do_not_contact is true
        or exists(select 1 from public.vsc_contact_suppressions s
          where s.tenant_id=p_tenant_id and s.person_id=alias.id and s.channel in ('all','sms'))
        or exists(select 1 from public.vsc_inbound_replies r
          where r.tenant_id=p_tenant_id and r.person_id=alias.id)))
  )
  select distinct on(e.mobile) e.id,e.display_name,e.mobile,e.has_email
  from eligible e order by e.mobile,e.has_email desc,e.id limit 1000;
$$;
revoke all on function public.vsc_sms_audience_contacts(uuid) from public,anon,authenticated;
grant execute on function public.vsc_sms_audience_contacts(uuid) to service_role;

create table public.vsc_sms_audience_drafts(
 tenant_id uuid not null references public.tenants(id),id uuid not null,
 name text not null check(length(trim(name)) between 1 and 150),contacts jsonb not null,
 recipient_count integer not null check(recipient_count between 1 and 999),
 email_mobile_count integer not null check(email_mobile_count between 0 and recipient_count),
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 primary key(tenant_id,id),check(jsonb_typeof(contacts)='array' and jsonb_array_length(contacts)=recipient_count and pg_column_size(contacts)<=500000)
);
alter table public.vsc_sms_audience_drafts enable row level security;
revoke all on public.vsc_sms_audience_drafts from public,anon,authenticated,service_role;
grant select on public.vsc_sms_audience_drafts to authenticated;
grant select,insert on public.vsc_sms_audience_drafts to service_role;
create policy vsc_sms_audience_admin_read on public.vsc_sms_audience_drafts for select to authenticated using(exists(select 1 from public.tenant_users tu join public.roles r on r.id=tu.role_id where tu.tenant_id=vsc_sms_audience_drafts.tenant_id and tu.user_id=auth.uid() and tu.status='active' and r.slug in ('owner','admin')));
create function public.vsc_save_sms_audience(p_tenant_id uuid,p_actor_id uuid,p_id uuid,p_name text,p_contacts jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare actual jsonb;stored public.vsc_sms_audience_drafts%rowtype;inserted integer;
begin
 if p_tenant_id is null or p_id is null or p_name is null or length(trim(p_name)) not between 1 and 150 or jsonb_typeof(p_contacts) is distinct from 'array' then raise exception 'Invalid SMS audience';end if;
 if jsonb_array_length(p_contacts) not between 1 and 999 or pg_column_size(p_contacts)>500000 then raise exception 'Invalid SMS audience size';end if;
 if not exists(select 1 from public.tenant_users tu join public.roles r on r.id=tu.role_id where tu.tenant_id=p_tenant_id and tu.user_id=p_actor_id and tu.status='active' and r.slug in ('owner','admin')) then raise exception 'VSC administrator required';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text,1077));
 select jsonb_agg(jsonb_build_object('id',c.id,'display_name',c.display_name,'mobile',c.mobile,'has_email',c.has_email) order by c.mobile,c.id) into actual from public.vsc_sms_audience_contacts(p_tenant_id) c;
 if actual is distinct from p_contacts then raise exception 'SMS audience changed: review again';end if;
 insert into public.vsc_sms_audience_drafts(tenant_id,id,name,contacts,recipient_count,email_mobile_count,created_by)
 values(p_tenant_id,p_id,trim(p_name),actual,jsonb_array_length(actual),(select count(*) from jsonb_array_elements(actual) c where c->>'has_email'='true'),p_actor_id) on conflict(tenant_id,id) do nothing;
 get diagnostics inserted=row_count;
 select * into stored from public.vsc_sms_audience_drafts where tenant_id=p_tenant_id and id=p_id;
 if stored.name is distinct from trim(p_name) or stored.contacts is distinct from actual then raise exception 'SMS audience identity conflict';end if;
 return jsonb_build_object('id',stored.id,'recipients',stored.recipient_count,'emailMobile',stored.email_mobile_count,'mobileOnly',stored.recipient_count-stored.email_mobile_count,'reused',inserted=0);
end;
$$;
revoke all on function public.vsc_save_sms_audience(uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.vsc_save_sms_audience(uuid,uuid,uuid,text,jsonb) to service_role;
