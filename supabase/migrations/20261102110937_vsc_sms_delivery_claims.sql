-- Inert SMS claims, separate from email. No route, scheduler, approval or send activated.
alter table public.vsc_campaigns add column sms_content jsonb;
create function public.vsc_sms_dispatch_payload(p_tenant_id uuid,p_delivery_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('deliveryId',d.id,'campaignId',c.id,'personId',p.id,
   'recipient',public.vsc_normalize_fr_mobile(p.primary_phone),'text',m->>'text','promotional',(m->>'promotional')::boolean,'sender','VDC')
 from public.vsc_campaign_deliveries d
 join public.vsc_campaigns c on c.tenant_id=d.tenant_id and c.id=d.campaign_id
 join public.people p on p.tenant_id=d.tenant_id and p.id=d.person_id
 cross join lateral jsonb_array_elements(case when jsonb_typeof(c.sms_content->'messages')='array' then c.sms_content->'messages' else '[]'::jsonb end) m
 where d.tenant_id=p_tenant_id and d.id=p_delivery_id and d.channel='sms'
 and d.status in ('scheduled','claimed') and d.provider_message_id is null and d.scheduled_at<=now()
 and (d.scheduled_at at time zone 'Europe/Paris')::date=(now() at time zone 'Europe/Paris')::date
 and c.state='active' and c.approved_by is not null and c.approved_at is not null and c.enabled_at is not null
 and c.sms_content->'version'='1'::jsonb and m->>'stepKey'=d.step_key
 and d.step_key in ('sms-reminder','sms-initial','sms-followup-1','sms-followup-2','sms-followup-3','sms-followup-4')
 and (select count(*) from jsonb_array_elements(c.sms_content->'messages') x where x->>'stepKey'=d.step_key)=1
 and jsonb_typeof(m->'text')='string' and length(trim(m->>'text')) between 1 and 2000
 and m->>'text' like '%VendreSonCommerce%' and m->>'text' like '%STOP au [STOP_CODE]%'
 and jsonb_typeof(m->'promotional')='boolean'
 and (case when m->>'promotional'='true' then (now() at time zone 'Europe/Paris')::date<=date '2026-11-30'
      else m->>'text' !~ '(^|[^0-9])(79|159)([^0-9]|$)' end)
 and p.contact_allowed and not p.do_not_contact and public.vsc_normalize_fr_mobile(p.primary_phone) is not null
 and exists(select 1 from public.vsc_brevo_contact_links l where l.tenant_id=d.tenant_id and l.person_id=d.person_id and not l.sms_blocked and not l.do_not_contact)
 and not exists(select 1 from public.vsc_campaign_deliveries other join public.people op on op.tenant_id=other.tenant_id and op.id=other.person_id
   where other.tenant_id=d.tenant_id and other.channel='sms' and other.id<>d.id
   and (coalesce(other.dispatch_payload->>'recipient',public.vsc_normalize_fr_mobile(op.primary_phone))=public.vsc_normalize_fr_mobile(p.primary_phone) or other.person_id=p.id)
   and (other.dispatch_outcome in ('reserved','sending','unknown') or (other.step_key=d.step_key and (other.status='sent' or other.dispatch_outcome='sent'))))
 and not exists(select 1 from public.people alias where alias.tenant_id=d.tenant_id and (alias.id=p.id or public.vsc_normalize_fr_mobile(alias.primary_phone)=public.vsc_normalize_fr_mobile(p.primary_phone)) and (
   alias.do_not_contact or exists(select 1 from public.vsc_contact_suppressions s where s.tenant_id=d.tenant_id and s.person_id=alias.id and s.channel in ('all','sms'))
   or exists(select 1 from public.vsc_inbound_replies r where r.tenant_id=d.tenant_id and r.person_id=alias.id)
   or exists(select 1 from public.vsc_brevo_contact_links l where l.tenant_id=d.tenant_id and l.person_id=alias.id and (l.sms_blocked or l.do_not_contact))))
 limit 1;
$$;
create or replace function public.vsc_reserve_sms_delivery(p_tenant_id uuid,p_delivery_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare delivery public.vsc_campaign_deliveries%rowtype; payload jsonb; token uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text,1077));
  select * into delivery from public.vsc_campaign_deliveries where tenant_id=p_tenant_id and id=p_delivery_id for update skip locked;
  if not found or delivery.status<>'scheduled' or delivery.channel<>'sms' or delivery.claim_token is not null
    or delivery.dispatch_started_at is not null or delivery.dispatch_outcome is not null or delivery.provider_message_id is not null
  then return null; end if;
  payload := public.vsc_sms_dispatch_payload(p_tenant_id,p_delivery_id);
  if payload is null then return null; end if;
  token := gen_random_uuid();
  update public.vsc_campaign_deliveries set status='claimed',claim_token=token,claimed_at=current_timestamp,
    dispatch_started_at=null,dispatch_outcome='reserved',dispatch_payload=payload
  where tenant_id=p_tenant_id and id=p_delivery_id;
  return jsonb_build_object('deliveryId',p_delivery_id,'claimToken',token,'payload',payload);
end;
$$;

-- This is the sole one-shot transition granting a future worker permission to attempt SMS.
-- The caller must still perform its fresh stop check immediately before the provider call.
create or replace function public.vsc_begin_sms_dispatch(p_tenant_id uuid,p_delivery_id uuid,p_claim_token uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare delivery public.vsc_campaign_deliveries%rowtype; payload jsonb;
begin
  select * into delivery from public.vsc_campaign_deliveries where tenant_id=p_tenant_id and id=p_delivery_id for update;
  if not found or delivery.channel<>'sms' or delivery.status<>'claimed' or delivery.claim_token is distinct from p_claim_token
    or p_claim_token is null or delivery.dispatch_started_at is not null or delivery.dispatch_outcome is distinct from 'reserved'
  then return null; end if;
  payload := public.vsc_sms_dispatch_payload(p_tenant_id,p_delivery_id);
  if payload is null or payload is distinct from delivery.dispatch_payload then
    update public.vsc_campaign_deliveries set status='cancelled',dispatch_outcome='cancelled' where tenant_id=p_tenant_id and id=p_delivery_id;
    return null;
  end if;
  update public.vsc_campaign_deliveries set dispatch_started_at=current_timestamp,dispatch_outcome='sending' where tenant_id=p_tenant_id and id=p_delivery_id;
  return payload;
end;
$$;

-- Safe to release only before provider intent is recorded. The old token becomes invalid.
create or replace function public.vsc_release_sms_reservation(p_tenant_id uuid,p_delivery_id uuid,p_claim_token uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  update public.vsc_campaign_deliveries set status='scheduled',claim_token=null,claimed_at=null,dispatch_payload=null,dispatch_outcome=null
  where tenant_id=p_tenant_id and id=p_delivery_id and channel='sms' and status='claimed' and claim_token=p_claim_token
    and dispatch_started_at is null and dispatch_outcome='reserved';
  return found;
end;
$$;

-- Unknown SMS acceptance stays claimed and cannot be released/retried automatically.
create or replace function public.vsc_record_sms_dispatch_result(p_tenant_id uuid,p_delivery_id uuid,p_claim_token uuid,p_result text,p_message_id text default null)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare delivery public.vsc_campaign_deliveries%rowtype;
begin
  if p_result is null or p_result not in ('sent','rejected','unknown') then raise exception 'Invalid VSC dispatch result'; end if;
  select * into delivery from public.vsc_campaign_deliveries where tenant_id=p_tenant_id and id=p_delivery_id for update;
  if not found or delivery.channel<>'sms' or p_claim_token is null or delivery.claim_token is distinct from p_claim_token or delivery.dispatch_started_at is null then return false; end if;
  if p_result='sent' and (p_message_id is null or p_message_id !~ '^[1-9][0-9]*$' or length(p_message_id)>30) then raise exception 'VSC message identity mismatch'; end if;
  if p_result<>'sent' and p_message_id is not null then raise exception 'Unexpected VSC message identity'; end if;
  if delivery.dispatch_outcome=p_result then
    if p_result='sent' and delivery.provider_message_id is distinct from p_message_id then raise exception 'SMS receipt identity conflict';end if;
    return true;
  end if;
  if delivery.status<>'claimed' or delivery.dispatch_outcome is distinct from 'sending' then raise exception 'VSC dispatch outcome requires manual review'; end if;
  update public.vsc_campaign_deliveries set dispatch_outcome=p_result,
    status=case p_result when 'sent' then 'sent' when 'rejected' then 'failed' else 'claimed' end,
    provider_message_id=case when p_result='sent' then p_message_id else provider_message_id end,
    sent_at=case when p_result='sent' then current_timestamp else null end
  where tenant_id=p_tenant_id and id=p_delivery_id;
  return true;
end;
$$;

revoke all on function public.vsc_sms_dispatch_payload(uuid,uuid) from public,anon,authenticated;
revoke all on function public.vsc_reserve_sms_delivery(uuid,uuid) from public,anon,authenticated;
revoke all on function public.vsc_begin_sms_dispatch(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.vsc_release_sms_reservation(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.vsc_record_sms_dispatch_result(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.vsc_sms_dispatch_payload(uuid,uuid),public.vsc_reserve_sms_delivery(uuid,uuid),
  public.vsc_begin_sms_dispatch(uuid,uuid,uuid),public.vsc_release_sms_reservation(uuid,uuid,uuid),
  public.vsc_record_sms_dispatch_result(uuid,uuid,uuid,text,text) to service_role;

