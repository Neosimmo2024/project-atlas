-- Preparation only: no scheduler, campaign activation or provider call.
alter table public.vsc_campaign_deliveries
  add column claim_token uuid,
  add column claimed_at timestamptz,
  add column dispatch_started_at timestamptz,
  add column dispatch_outcome text check (dispatch_outcome in ('reserved','sending','sent','rejected','unknown','cancelled')),
  add column dispatch_payload jsonb,
  add column sent_at timestamptz;

-- Fresh eligibility and the exact stored copy. This helper is server-only too.
create or replace function public.vsc_email_dispatch_payload(p_tenant_id uuid,p_delivery_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('deliveryId',d.id,'personId',p.id,'campaignId',c.id,
    'recipient',trim(p.primary_email),'subject',m->>'subject','text',m->>'text',
    'messageId','<vsc-'||d.id::text||'@vendresoncommerce.com>')
  from public.vsc_campaign_deliveries d
  join public.vsc_campaigns c on c.id=d.campaign_id and c.tenant_id=d.tenant_id
  join public.people p on p.id=d.person_id and p.tenant_id=d.tenant_id
  cross join lateral jsonb_array_elements(case when jsonb_typeof(c.email_content->'messages')='array' then c.email_content->'messages' else '[]'::jsonb end) m
  where d.tenant_id=p_tenant_id and d.id=p_delivery_id and d.channel='email'
    and d.provider_message_id is null and d.status in ('scheduled','claimed') and d.scheduled_at<=current_timestamp
    and (d.scheduled_at at time zone 'Europe/Paris')::date<=date '2026-11-30'
    and (current_timestamp at time zone 'Europe/Paris')::date<=date '2026-11-30'
    and c.state='active' and c.approved_by is not null and c.approved_at is not null and c.enabled_at is not null
    and p.contact_allowed is true and p.do_not_contact is false
    and p.primary_email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    and c.email_content->'version'='1'::jsonb and m->>'stepKey'=d.step_key
    and jsonb_typeof(m->'subject')='string' and length(trim(m->>'subject')) between 1 and 200
    and m->>'subject' !~ E'[\\r\\n]' and jsonb_typeof(m->'text')='string' and length(trim(m->>'text')) between 1 and 6000
    and (select count(*) from jsonb_array_elements(c.email_content->'messages') x where x->>'stepKey'=d.step_key)=1
    and not exists(select 1 from public.vsc_contact_suppressions s where s.tenant_id=d.tenant_id and s.person_id=d.person_id and s.channel in ('all','email'))
    and not exists(select 1 from public.vsc_inbound_replies r where r.tenant_id=d.tenant_id and r.person_id=d.person_id)
  limit 1;
$$;

create or replace function public.vsc_reserve_email_delivery(p_tenant_id uuid,p_delivery_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare delivery public.vsc_campaign_deliveries%rowtype; payload jsonb; token uuid;
begin
  select * into delivery from public.vsc_campaign_deliveries where tenant_id=p_tenant_id and id=p_delivery_id for update skip locked;
  if not found or delivery.status<>'scheduled' or delivery.channel<>'email' or delivery.claim_token is not null
    or delivery.dispatch_started_at is not null or delivery.dispatch_outcome is not null or delivery.provider_message_id is not null
  then return null; end if;
  payload := public.vsc_email_dispatch_payload(p_tenant_id,p_delivery_id);
  if payload is null then return null; end if;
  token := gen_random_uuid();
  update public.vsc_campaign_deliveries set status='claimed',claim_token=token,claimed_at=current_timestamp,
    dispatch_started_at=null,dispatch_outcome='reserved',dispatch_payload=payload
  where tenant_id=p_tenant_id and id=p_delivery_id;
  return jsonb_build_object('deliveryId',p_delivery_id,'claimToken',token,'payload',payload);
end;
$$;

-- This is the sole one-shot transition granting a future worker permission to attempt SMTP.
-- The caller must still perform its fresh stop check immediately before the provider call.
create or replace function public.vsc_begin_email_dispatch(p_tenant_id uuid,p_delivery_id uuid,p_claim_token uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare delivery public.vsc_campaign_deliveries%rowtype; payload jsonb;
begin
  select * into delivery from public.vsc_campaign_deliveries where tenant_id=p_tenant_id and id=p_delivery_id for update;
  if not found or delivery.status<>'claimed' or delivery.claim_token is distinct from p_claim_token
    or p_claim_token is null or delivery.dispatch_started_at is not null or delivery.dispatch_outcome is distinct from 'reserved'
  then return null; end if;
  payload := public.vsc_email_dispatch_payload(p_tenant_id,p_delivery_id);
  if payload is null or payload is distinct from delivery.dispatch_payload then
    update public.vsc_campaign_deliveries set status='cancelled',dispatch_outcome='cancelled' where tenant_id=p_tenant_id and id=p_delivery_id;
    return null;
  end if;
  update public.vsc_campaign_deliveries set dispatch_started_at=current_timestamp,dispatch_outcome='sending' where tenant_id=p_tenant_id and id=p_delivery_id;
  return payload;
end;
$$;

-- Safe to release only before provider intent is recorded. The old token becomes invalid.
create or replace function public.vsc_release_email_reservation(p_tenant_id uuid,p_delivery_id uuid,p_claim_token uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  update public.vsc_campaign_deliveries set status='scheduled',claim_token=null,claimed_at=null,dispatch_payload=null,dispatch_outcome=null
  where tenant_id=p_tenant_id and id=p_delivery_id and status='claimed' and claim_token=p_claim_token
    and dispatch_started_at is null and dispatch_outcome='reserved';
  return found;
end;
$$;

-- Unknown SMTP acceptance stays claimed and cannot be released/retried automatically.
create or replace function public.vsc_record_email_dispatch_result(p_tenant_id uuid,p_delivery_id uuid,p_claim_token uuid,p_result text,p_message_id text default null)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare delivery public.vsc_campaign_deliveries%rowtype;
begin
  if p_result is null or p_result not in ('sent','rejected','unknown') then raise exception 'Invalid VSC dispatch result'; end if;
  select * into delivery from public.vsc_campaign_deliveries where tenant_id=p_tenant_id and id=p_delivery_id for update;
  if not found or p_claim_token is null or delivery.claim_token is distinct from p_claim_token or delivery.dispatch_started_at is null then return false; end if;
  if p_result='sent' and (p_message_id is null or p_message_id is distinct from delivery.dispatch_payload->>'messageId') then raise exception 'VSC message identity mismatch'; end if;
  if p_result<>'sent' and p_message_id is not null then raise exception 'Unexpected VSC message identity'; end if;
  if delivery.dispatch_outcome=p_result then return true; end if;
  if delivery.status<>'claimed' or delivery.dispatch_outcome is distinct from 'sending' then raise exception 'VSC dispatch outcome requires manual review'; end if;
  update public.vsc_campaign_deliveries set dispatch_outcome=p_result,
    status=case p_result when 'sent' then 'sent' when 'rejected' then 'failed' else 'claimed' end,
    provider_message_id=case when p_result='sent' then p_message_id else provider_message_id end,
    sent_at=case when p_result='sent' then current_timestamp else null end
  where tenant_id=p_tenant_id and id=p_delivery_id;
  return true;
end;
$$;

revoke all on function public.vsc_email_dispatch_payload(uuid,uuid) from public,anon,authenticated;
revoke all on function public.vsc_reserve_email_delivery(uuid,uuid) from public,anon,authenticated;
revoke all on function public.vsc_begin_email_dispatch(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.vsc_release_email_reservation(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.vsc_record_email_dispatch_result(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.vsc_email_dispatch_payload(uuid,uuid),public.vsc_reserve_email_delivery(uuid,uuid),
  public.vsc_begin_email_dispatch(uuid,uuid,uuid),public.vsc_release_email_reservation(uuid,uuid,uuid),
  public.vsc_record_email_dispatch_result(uuid,uuid,uuid,text,text) to service_role;

-- Existing tenant read policies remain; reservation credentials stay server-only.
revoke select on public.vsc_campaign_deliveries from authenticated;
grant select(id,tenant_id,campaign_id,person_id,channel,step_key,scheduled_at,status,provider_message_id,created_at,sent_at)
  on public.vsc_campaign_deliveries to authenticated;
