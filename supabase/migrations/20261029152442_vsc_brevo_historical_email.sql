-- Historical campaign 2 only. No new campaign, delivery, SMTP or provider write.
alter table public.vsc_brevo_contact_links add column history_campaign_2 jsonb, add column history_campaign_2_checked_at timestamptz;
create function public.vsc_initial_email_reviewed(p_tenant_id uuid,p_person_id uuid,p_email text) returns boolean
language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.vsc_brevo_contact_links l where l.tenant_id=p_tenant_id and l.history_campaign_2_checked_at is not null
 and (l.person_id=p_person_id or l.source_email=lower(trim(p_email))));
$$;
revoke all on function public.vsc_initial_email_reviewed(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.vsc_initial_email_reviewed(uuid,uuid,text) to service_role;
create function public.vsc_record_brevo_history(p_tenant_id uuid,p_actor_id uuid,p_entries jsonb) returns integer
language plpgsql security invoker set search_path='' as $$
declare e jsonb; l public.vsc_brevo_contact_links%rowtype; n integer:=0;
begin
 if jsonb_typeof(p_entries) is distinct from 'array' or jsonb_array_length(p_entries) not between 1 and 25 then raise exception 'Invalid history batch'; end if;
 if not exists(select 1 from public.tenant_users tu join public.roles r on r.id=tu.role_id where tu.tenant_id=p_tenant_id and tu.user_id=p_actor_id and tu.status='active' and r.slug in ('owner','admin')) then raise exception 'VSC administrator required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text,1077));
 for e in select value from jsonb_array_elements(p_entries) loop
  select * into l from public.vsc_brevo_contact_links where tenant_id=p_tenant_id and provider_id=(e->>'provider_id')::bigint for update;
  if not found or l.person_id is null or l.person_id is distinct from (e->>'person_id')::uuid or l.source_email is null or l.source_email is distinct from e->>'email'
   or not exists(select 1 from public.people p where p.tenant_id=p_tenant_id and p.id=l.person_id and lower(trim(p.primary_email))=l.source_email)
   or jsonb_typeof(e->'delivered') is distinct from 'boolean' or jsonb_typeof(e->'hardBounce') is distinct from 'boolean' or jsonb_typeof(e->'softBounce') is distinct from 'boolean' or jsonb_typeof(e->'emailBlocked') is distinct from 'boolean'
   or not(e ? 'sentAt') or jsonb_typeof(e->'sentAt') not in ('null','string')
  then raise exception 'History identity or status conflict'; end if;
  if e->>'sentAt' is not null and ((e->>'sentAt')::timestamptz<timestamp with time zone '2026-10-26 00:00:00+00' or (e->>'sentAt')::timestamptz>now()+interval '5 minutes') then raise exception 'Invalid history date'; end if;
  update public.vsc_brevo_contact_links set history_campaign_2=jsonb_build_object(
    'email',l.source_email,'sentAt',coalesce(l.history_campaign_2->>'sentAt',e->>'sentAt'),
    'delivered',coalesce((l.history_campaign_2->>'delivered')::boolean,false) or (e->>'delivered')::boolean,
    'hardBounce',coalesce((l.history_campaign_2->>'hardBounce')::boolean,false) or (e->>'hardBounce')::boolean,
    'softBounce',coalesce((l.history_campaign_2->>'softBounce')::boolean,false) or (e->>'softBounce')::boolean),
    history_campaign_2_checked_at=now(),email_blocked=email_blocked or (e->>'emailBlocked')::boolean or (e->>'hardBounce')::boolean
  where tenant_id=p_tenant_id and provider_id=l.provider_id;
  if l.email_blocked or (e->>'emailBlocked')::boolean or (e->>'hardBounce')::boolean then perform public.vsc_unsubscribe_contact(p_tenant_id,l.person_id,'email'); end if;
  -- Never create an OVH sent event from Brevo history. Cancel only queued initial emails.
  update public.vsc_campaign_deliveries set status='cancelled' where tenant_id=p_tenant_id and person_id=l.person_id and channel='email' and step_key='offer' and status in ('draft','scheduled');
  n:=n+1;
 end loop;
 return n;
end;
$$;
revoke all on function public.vsc_record_brevo_history(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.vsc_record_brevo_history(uuid,uuid,jsonb) to service_role;

-- Administrator server service only. Atomic, idempotent EMAIL DRAFT creation; no sending.
create or replace function public.vsc_create_email_draft(
  p_tenant_id uuid, p_campaign_id uuid, p_name text, p_start_date date, p_person_ids uuid[]
) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  expected jsonb;
  actual jsonb;
  existing public.vsc_campaigns%rowtype;
  inserted_count integer;
begin
  if p_tenant_id is null or p_campaign_id is null or p_name is null
    or length(trim(p_name)) not between 1 and 150 or p_start_date is null
    or p_start_date > date '2026-11-30' or p_start_date < date '2026-01-01'
    or p_person_ids is null or cardinality(p_person_ids) not between 1 and 100
    or array_position(p_person_ids, null) is not null
    or cardinality(p_person_ids) <> (select count(distinct id) from unnest(p_person_ids) id)
  then raise exception 'Invalid VSC draft request'; end if;

  select jsonb_agg(jsonb_build_object('person_id', id, 'step_key', step_key,
    'scheduled_at', (p_start_date + offset_days + time '12:00') at time zone 'UTC') order by id, step_key)
  into expected
  from unnest(p_person_ids) id cross join (values ('offer',0),('consideration',20),('last-chance',40)) steps(step_key,offset_days)
  where p_start_date + offset_days <= date '2026-11-30';

  insert into public.vsc_campaigns(id,tenant_id,name,state)
  values(p_campaign_id,p_tenant_id,trim(p_name),'draft') on conflict(id) do nothing;
  get diagnostics inserted_count = row_count;
  if inserted_count = 0 then
    select * into existing from public.vsc_campaigns where id=p_campaign_id for update;
    if existing.tenant_id is distinct from p_tenant_id or existing.name is distinct from trim(p_name)
      or existing.state <> 'draft' or existing.approved_at is not null or existing.enabled_at is not null
    then raise exception 'VSC draft identity conflict'; end if;
    select jsonb_agg(jsonb_build_object('person_id',person_id,'step_key',step_key,'scheduled_at',scheduled_at) order by person_id,step_key)
    into actual from public.vsc_campaign_deliveries where tenant_id=p_tenant_id and campaign_id=p_campaign_id and channel='email' and status='draft';
    if actual is distinct from expected or (select count(*) from public.vsc_campaign_deliveries where tenant_id=p_tenant_id and campaign_id=p_campaign_id) <> jsonb_array_length(expected)
    then raise exception 'VSC draft contents conflict'; end if;
    return jsonb_build_object('campaignId',p_campaign_id,'submitted',jsonb_array_length(expected),'reused',true);
  end if;

  if (select count(*) from public.people p where p.tenant_id=p_tenant_id and p.id=any(p_person_ids)
    and p.contact_allowed is true and p.do_not_contact is false and p.primary_email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    and not exists(select 1 from public.vsc_contact_suppressions s where s.tenant_id=p_tenant_id and s.person_id=p.id and s.channel in ('all','email'))
    and not public.vsc_initial_email_reviewed(p_tenant_id,p.id,p.primary_email)
    and not exists(select 1 from public.vsc_inbound_replies r where r.tenant_id=p_tenant_id and r.person_id=p.id)) <> cardinality(p_person_ids)
  then raise exception 'VSC contact no longer eligible'; end if;

  insert into public.vsc_campaign_deliveries(tenant_id,campaign_id,person_id,channel,step_key,scheduled_at,status)
  select p_tenant_id,p_campaign_id,person_id,'email',step_key,scheduled_at,'draft'
  from jsonb_to_recordset(expected) as plan(person_id uuid,step_key text,scheduled_at timestamptz);
  return jsonb_build_object('campaignId',p_campaign_id,'submitted',jsonb_array_length(expected),'reused',false);
end;
$$;
revoke all on function public.vsc_create_email_draft(uuid,uuid,text,date,uuid[]) from public,anon,authenticated;
grant execute on function public.vsc_create_email_draft(uuid,uuid,text,date,uuid[]) to service_role;

-- Read-only eligibility query uses EXISTS, so large reply histories cannot truncate checks.
create or replace function public.vsc_email_draft_contacts(p_tenant_id uuid, p_person_ids uuid[] default null)
returns table(id uuid, display_name text, primary_email text)
language sql stable security invoker set search_path = ''
as $$
  select p.id,p.display_name,p.primary_email from public.people p
  where p.tenant_id=p_tenant_id and (p_person_ids is null or p.id=any(p_person_ids))
    and p.contact_allowed is true and p.do_not_contact is false
    and p.primary_email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    and not exists(select 1 from public.vsc_contact_suppressions s where s.tenant_id=p_tenant_id and s.person_id=p.id and s.channel in ('all','email'))
    and not public.vsc_initial_email_reviewed(p_tenant_id,p.id,p.primary_email)
    and not exists(select 1 from public.vsc_inbound_replies r where r.tenant_id=p_tenant_id and r.person_id=p.id)
  order by p.id limit 101;
$$;
revoke all on function public.vsc_email_draft_contacts(uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.vsc_email_draft_contacts(uuid,uuid[]) to service_role;

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
    and (d.step_key<>'offer' or not public.vsc_initial_email_reviewed(d.tenant_id,p.id,p.primary_email))
    and not exists(select 1 from public.vsc_inbound_replies r where r.tenant_id=d.tenant_id and r.person_id=d.person_id)
  limit 1;
$$;

