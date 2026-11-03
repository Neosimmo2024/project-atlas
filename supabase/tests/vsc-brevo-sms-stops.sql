-- Synthetic SMS STOP and alias cancellation, every write rolled back.
\set ON_ERROR_STOP on
begin;
insert into public.tenants(id,name) values('26000000-0000-0000-0000-000000000001','SMS STOP fixture'),('26000000-0000-0000-0000-000000000002','Foreign SMS fixture');
insert into auth.users(id,email) values('16000000-0000-0000-0000-000000000001','sms-stop-owner@fixture.invalid');
insert into public.tenant_users(tenant_id,user_id,role_id) select '26000000-0000-0000-0000-000000000001','16000000-0000-0000-0000-000000000001',id from public.roles where slug='owner';
insert into public.people(id,tenant_id,display_name,primary_phone,contact_allowed) values
('36000000-0000-0000-0000-000000000001','26000000-0000-0000-0000-000000000001','Source','06 12 34 56 78',true),
('36000000-0000-0000-0000-000000000002','26000000-0000-0000-0000-000000000001','Alias','+33612345678',true),
('36000000-0000-0000-0000-000000000003','26000000-0000-0000-0000-000000000002','Foreign same mobile','+33612345678',true);
insert into public.vsc_brevo_contact_links(tenant_id,provider_id,person_id,email_blocked,sms_blocked,do_not_contact,identity_snapshot,source_status_snapshot,last_outcome,last_imported_by)
select tenant_id,1,id,false,false,false,'{"phones":["+33612345678"],"emails":[]}','{}','created','16000000-0000-0000-0000-000000000001' from public.people where id in ('36000000-0000-0000-0000-000000000001','36000000-0000-0000-0000-000000000003');
insert into public.vsc_campaigns(id,tenant_id,name) values('46000000-0000-0000-0000-000000000001','26000000-0000-0000-0000-000000000001','Own fixture'),('46000000-0000-0000-0000-000000000002','26000000-0000-0000-0000-000000000002','Foreign fixture');
insert into public.vsc_campaign_deliveries(tenant_id,campaign_id,person_id,channel,step_key,scheduled_at) select tenant_id,case when tenant_id='26000000-0000-0000-0000-000000000001' then '46000000-0000-0000-0000-000000000001'::uuid else '46000000-0000-0000-0000-000000000002'::uuid end,id,'sms','sms-fixture',now() from public.people where tenant_id in ('26000000-0000-0000-0000-000000000001','26000000-0000-0000-0000-000000000002');
insert into public.vsc_campaign_deliveries(tenant_id,campaign_id,person_id,channel,step_key,scheduled_at) values('26000000-0000-0000-0000-000000000001','46000000-0000-0000-0000-000000000001','36000000-0000-0000-0000-000000000001','email','email-fixture',now());
set local role service_role;
do $$ declare t uuid:='26000000-0000-0000-0000-000000000001';a uuid:='16000000-0000-0000-0000-000000000001';r jsonb;begin
 r:=public.vsc_apply_brevo_sms_stops(t,a,array[1,999]::bigint[]);
 if r<>jsonb_build_object('matchedSources',1,'unmappedSources',1,'peopleStopped',2,'cancelled',2) then raise exception 'SMS STOP counts incorrect: %',r; end if;
 if (select count(*) from public.vsc_contact_suppressions where tenant_id=t and channel='sms')<>2 then raise exception 'Alias STOP missing'; end if;
 if exists(select 1 from public.vsc_contact_suppressions where tenant_id=t and channel<>'sms') then raise exception 'Email/global permission modified'; end if;
 if exists(select 1 from public.people where tenant_id=t and (not contact_allowed or do_not_contact)) then raise exception 'Person permission modified'; end if;
 if not exists(select 1 from public.vsc_campaign_deliveries where tenant_id=t and channel='email' and status='draft') then raise exception 'Email cancelled'; end if;
 if not exists(select 1 from public.vsc_campaign_deliveries where tenant_id='26000000-0000-0000-0000-000000000002' and status='draft') or exists(select 1 from public.vsc_contact_suppressions where tenant_id='26000000-0000-0000-0000-000000000002') then raise exception 'Foreign data mutated'; end if;
 -- Empty new block list does not clear a known STOP and cancels subsequent queued work.
 insert into public.vsc_campaign_deliveries(tenant_id,campaign_id,person_id,channel,step_key,scheduled_at) values(t,'46000000-0000-0000-0000-000000000001','36000000-0000-0000-0000-000000000002','sms','later-fixture',now());
 r:=public.vsc_apply_brevo_sms_stops(t,a,'{}'::bigint[]);if r->>'cancelled'<>'1' or not exists(select 1 from public.vsc_brevo_contact_links where tenant_id=t and provider_id=1 and sms_blocked) then raise exception 'Known STOP reactivated'; end if;
 begin perform public.vsc_apply_brevo_sms_stops('26000000-0000-0000-0000-000000000002',a,array[1]::bigint[]);raise exception 'Foreign administrator accepted';exception when raise_exception then if sqlerrm='Foreign administrator accepted' then raise;end if;end;
end $$;
reset role;
do $$ begin if has_function_privilege('authenticated','public.vsc_apply_brevo_sms_stops(uuid,uuid,bigint[])','EXECUTE') or has_function_privilege('anon','public.vsc_apply_brevo_sms_stops(uuid,uuid,bigint[])','EXECUTE') then raise exception 'RPC exposed';end if;if exists(select 1 from pg_proc where proname='vsc_apply_brevo_sms_stops' and prosecdef) then raise exception 'Definer forbidden';end if;end $$;
rollback;
