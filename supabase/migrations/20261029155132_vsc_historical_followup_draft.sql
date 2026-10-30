-- Prepare only J+20 from proven historical campaign 2. Never creates an initial email.
alter table public.vsc_campaign_deliveries add column historical_brevo_campaign_id integer check(historical_brevo_campaign_id is null or historical_brevo_campaign_id=2);
create unique index vsc_historical_followup_once on public.vsc_campaign_deliveries(tenant_id,person_id,historical_brevo_campaign_id,step_key) where historical_brevo_campaign_id is not null;
create function public.vsc_historical_followup_contacts(p_tenant_id uuid)
returns table(id uuid,display_name text,email text,scheduled_at timestamptz)
language sql stable security invoker set search_path='' as $$
 with historical as (
  select l.person_id,l.source_email,min((l.history_campaign_2->>'sentAt')::timestamptz) as sent_at
  from public.vsc_brevo_contact_links l where l.tenant_id=p_tenant_id and l.history_campaign_2->>'sentAt' is not null
  group by l.person_id,l.source_email
 ), candidates as (
  select p.id,p.display_name,trim(p.primary_email) as email,(((h.sent_at at time zone 'Europe/Paris')::date+20+time '09:30') at time zone 'Europe/Paris') as scheduled_at
  from historical h join public.people p on p.tenant_id=p_tenant_id and p.id=h.person_id and lower(trim(p.primary_email))=h.source_email
  where p.contact_allowed and not p.do_not_contact
   and not exists(select 1 from public.vsc_contact_suppressions s where s.tenant_id=p_tenant_id and s.person_id=p.id and s.channel in ('all','email'))
   and not exists(select 1 from public.vsc_inbound_replies r where r.tenant_id=p_tenant_id and r.person_id=p.id)
   and not exists(select 1 from public.vsc_campaign_deliveries d where d.tenant_id=p_tenant_id and d.person_id=p.id and d.historical_brevo_campaign_id=2 and d.step_key='consideration')
 ) select distinct c.id,c.display_name,c.email,c.scheduled_at from candidates c
 where c.scheduled_at>now() and (c.scheduled_at at time zone 'Europe/Paris')::date<=date '2026-11-30'
 order by c.id limit 1000;
$$;
revoke all on function public.vsc_historical_followup_contacts(uuid) from public,anon,authenticated;
grant execute on function public.vsc_historical_followup_contacts(uuid) to service_role;
create function public.vsc_save_historical_followup(p_tenant_id uuid,p_actor_id uuid,p_campaign_id uuid,p_name text,p_plan jsonb,p_content jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare wanted jsonb; actual jsonb; fresh jsonb; existing public.vsc_campaigns%rowtype;
begin
 if p_tenant_id is null or p_campaign_id is null or length(trim(p_name)) not between 1 and 150 or p_name is null
  or jsonb_typeof(p_plan) is distinct from 'array' or jsonb_array_length(p_plan) not between 1 and 100
  or pg_column_size(p_plan)>100000 then raise exception 'Invalid historical follow-up'; end if;
 if not exists(select 1 from public.tenant_users tu join public.roles r on r.id=tu.role_id where tu.tenant_id=p_tenant_id and tu.user_id=p_actor_id and tu.status='active' and r.slug in ('owner','admin')) then raise exception 'Administrator required'; end if;
 if jsonb_typeof(p_content) is distinct from 'object' or p_content->'version' is distinct from '1'::jsonb or jsonb_typeof(p_content->'messages') is distinct from 'array'
 then raise exception 'Invalid VSC content'; end if;
 if jsonb_array_length(p_content->'messages')<>3 or pg_column_size(p_content)>100000 or (select count(distinct m->>'stepKey') from jsonb_array_elements(p_content->'messages') m where m->>'stepKey' in ('offer','consideration','last-chance'))<>3
  or exists(select 1 from jsonb_array_elements(p_content->'messages') m where jsonb_typeof(m->'subject') is distinct from 'string' or jsonb_typeof(m->'text') is distinct from 'string' or length(trim(m->>'subject')) not between 1 and 200 or length(trim(m->>'text')) not between 1 and 6000 or m->>'subject' ~ E'[\\r\\n]') then raise exception 'Invalid VSC messages'; end if;
 select jsonb_agg(jsonb_build_object('id',x.id,'email',x.email,'scheduled_at',x.scheduled_at) order by x.id) into wanted from jsonb_to_recordset(p_plan) x(id uuid,email text,scheduled_at timestamptz);
 if exists(select 1 from jsonb_to_recordset(p_plan) x(id uuid,email text,scheduled_at timestamptz) where x.id is null or x.email is null or x.scheduled_at is null)
 or (select count(distinct x.id) from jsonb_to_recordset(p_plan) x(id uuid))<>jsonb_array_length(p_plan) then raise exception 'Invalid historical identities'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text,1077));
 select * into existing from public.vsc_campaigns where id=p_campaign_id for update;
 if found then
  if existing.tenant_id is distinct from p_tenant_id or existing.state<>'draft' or existing.name is distinct from trim(p_name) or existing.email_content is distinct from p_content or existing.approved_at is not null or existing.enabled_at is not null then raise exception 'Historical draft identity conflict'; end if;
  select jsonb_agg(jsonb_build_object('id',d.person_id,'email',p.primary_email,'scheduled_at',d.scheduled_at) order by d.person_id) into actual from public.vsc_campaign_deliveries d join public.people p on p.tenant_id=d.tenant_id and p.id=d.person_id
  where d.tenant_id=p_tenant_id and d.campaign_id=p_campaign_id and d.channel='email' and d.step_key='consideration' and d.status='draft' and d.historical_brevo_campaign_id=2;
  if actual is distinct from wanted or (select count(*) from public.vsc_campaign_deliveries where tenant_id=p_tenant_id and campaign_id=p_campaign_id)<>jsonb_array_length(p_plan) then raise exception 'Historical draft contents conflict'; end if;
  return jsonb_build_object('campaignId',p_campaign_id,'submitted',jsonb_array_length(p_plan),'reused',true);
 end if;
 select jsonb_agg(jsonb_build_object('id',f.id,'email',f.email,'scheduled_at',f.scheduled_at) order by f.id) into fresh from public.vsc_historical_followup_contacts(p_tenant_id) f where f.id in(select x.id from jsonb_to_recordset(p_plan) x(id uuid));
 if fresh is distinct from wanted then raise exception 'Historical contact/date no longer eligible'; end if;
 insert into public.vsc_campaigns(id,tenant_id,name,state,email_content) values(p_campaign_id,p_tenant_id,trim(p_name),'draft',p_content);
 insert into public.vsc_campaign_deliveries(tenant_id,campaign_id,person_id,channel,step_key,scheduled_at,status,historical_brevo_campaign_id)
 select p_tenant_id,p_campaign_id,x.id,'email','consideration',x.scheduled_at,'draft',2 from jsonb_to_recordset(p_plan) x(id uuid,scheduled_at timestamptz);
 return jsonb_build_object('campaignId',p_campaign_id,'submitted',jsonb_array_length(p_plan),'reused',false);
end;
$$;
revoke all on function public.vsc_save_historical_followup(uuid,uuid,uuid,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.vsc_save_historical_followup(uuid,uuid,uuid,text,jsonb,jsonb) to service_role;
