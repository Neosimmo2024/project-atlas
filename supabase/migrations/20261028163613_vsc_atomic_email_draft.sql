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
    and not exists(select 1 from public.vsc_inbound_replies r where r.tenant_id=p_tenant_id and r.person_id=p.id)
  order by p.id limit 101;
$$;
revoke all on function public.vsc_email_draft_contacts(uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.vsc_email_draft_contacts(uuid,uuid[]) to service_role;
