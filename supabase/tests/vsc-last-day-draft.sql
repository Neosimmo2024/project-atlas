-- Synthetic future follow-up only, all writes rolled back.
\set ON_ERROR_STOP on
begin;
insert into public.tenants(id,name) values('29000000-0000-0000-0000-000000000001','Followup fixture'),('29000000-0000-0000-0000-000000000002','Foreign followup fixture');
insert into auth.users(id,email) values('19000000-0000-0000-0000-000000000001','followup-admin@fixture.invalid');
insert into public.tenant_users(tenant_id,user_id,role_id) select '29000000-0000-0000-0000-000000000001','19000000-0000-0000-0000-000000000001',id from public.roles where slug='owner';
insert into public.people(id,tenant_id,display_name,primary_email,contact_allowed) values
('39000000-0000-0000-0000-000000000001','29000000-0000-0000-0000-000000000001','Eligible fixture','followup@fixture.invalid',true),
('39000000-0000-0000-0000-000000000002','29000000-0000-0000-0000-000000000001','Stopped fixture','stopped-followup@fixture.invalid',true),
('39000000-0000-0000-0000-000000000003','29000000-0000-0000-0000-000000000002','Foreign fixture','followup@fixture.invalid',true);
insert into public.vsc_brevo_contact_links(tenant_id,provider_id,person_id,source_email,email_blocked,sms_blocked,do_not_contact,identity_snapshot,source_status_snapshot,last_outcome,last_imported_by,history_campaign_2,history_campaign_2_checked_at)
select tenant_id,case when id='39000000-0000-0000-0000-000000000001' then 1 else 2 end,id,primary_email,false,false,false,'{}','{}','created','19000000-0000-0000-0000-000000000001','{"sentAt":"2026-10-26T09:48:00Z"}',now() from public.people where tenant_id='29000000-0000-0000-0000-000000000001';
insert into public.vsc_contact_suppressions(tenant_id,person_id,channel) values('29000000-0000-0000-0000-000000000001','39000000-0000-0000-0000-000000000002','email');
set local role service_role;
do $$ declare
 t uuid:='29000000-0000-0000-0000-000000000001'; a uuid:='19000000-0000-0000-0000-000000000001'; c uuid:='49000000-0000-0000-0000-000000000001';
 plan jsonb; copy jsonb:='{"version":1,"messages":[{"stepKey":"offer","subject":"Fixture","text":"Fixture"},{"stepKey":"consideration","subject":"Fixture followup","text":"Fixture followup"},{"stepKey":"last-chance","subject":"Fixture","text":"Fixture"}]}'; result jsonb;
 begin
 if now()<timestamptz '2026-11-30 08:30:00+00' then
  if (select count(*) from public.vsc_last_day_contacts(t))<>1 then raise exception 'Permissions/tenant/history filter failed'; end if;
  select jsonb_agg(jsonb_build_object('id',id,'email',email,'scheduled_at',scheduled_at)) into plan from public.vsc_last_day_contacts(t);
  if (plan->0->>'scheduled_at')::timestamptz<>timestamptz '2026-11-30 08:30:00+00' then raise exception 'Paris last day conversion failed'; end if;
  begin
   perform public.vsc_save_last_day_draft(t,a,c,'Wrong date',jsonb_set(plan,'{0,scheduled_at}','"2026-12-05T08:30:00Z"'),copy);
   raise exception 'Altered historical date accepted';
  exception when raise_exception then if sqlerrm='Altered historical date accepted' then raise; end if; end;
  result:=public.vsc_save_last_day_draft(t,a,c,'Fixture last day',plan,copy);
  if result->>'submitted'<>'1' or result->>'reused'<>'false' then raise exception 'Save failed'; end if;
  result:=public.vsc_save_last_day_draft(t,a,c,'Fixture last day',plan,copy);
  if result->>'reused'<>'true' then raise exception 'Retry not idempotent'; end if;
  if exists(select 1 from public.vsc_last_day_contacts(t)) then raise exception 'Duplicate followup suggested'; end if;
  begin
   perform public.vsc_save_last_day_draft(t,a,'49000000-0000-0000-0000-000000000002','Duplicate last day',plan,copy);
   raise exception 'Second draft accepted';
  exception when raise_exception then if sqlerrm='Second draft accepted' then raise; end if; end;
  if (select count(*) from public.vsc_campaign_deliveries where tenant_id=t)<>1 or not exists(select 1 from public.vsc_campaign_deliveries where tenant_id=t and campaign_id=c and channel='email' and step_key='last-chance' and status='draft' and historical_brevo_campaign_id=2 and provider_message_id is null) then raise exception 'Unexpected delivery or send state'; end if;
  if not exists(select 1 from public.vsc_campaigns where tenant_id=t and id=c and state='draft' and approved_by is null and approved_at is null and enabled_at is null) then raise exception 'Draft activated'; end if;
 else
  if exists(select 1 from public.vsc_last_day_contacts(t)) then raise exception 'Past followup suggested'; end if;
 end if;
 if exists(select 1 from public.vsc_last_day_contacts('29000000-0000-0000-0000-000000000002')) then raise exception 'Foreign contact without history eligible'; end if;
 end $$;
reset role;
do $$ begin
 if has_function_privilege('authenticated','public.vsc_save_last_day_draft(uuid,uuid,uuid,text,jsonb,jsonb)','EXECUTE') or has_function_privilege('anon','public.vsc_last_day_contacts(uuid)','EXECUTE') then raise exception 'Historical draft RPC exposed'; end if;
 if exists(select 1 from pg_proc where proname in ('vsc_save_last_day_draft','vsc_last_day_contacts') and prosecdef) then raise exception 'Definer forbidden'; end if;
end $$;
rollback;
