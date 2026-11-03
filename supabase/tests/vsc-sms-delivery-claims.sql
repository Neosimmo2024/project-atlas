-- Synthetic SMS STOP and alias cancellation, every write rolled back.
\set ON_ERROR_STOP on
begin;
insert into public.tenants(id,name) values('2a000000-0000-0000-0000-000000000001','SMS STOP fixture'),('2a000000-0000-0000-0000-000000000002','Foreign SMS fixture');
insert into auth.users(id,email) values('1a000000-0000-0000-0000-000000000001','sms-stop-owner@fixture.invalid');
insert into public.tenant_users(tenant_id,user_id,role_id) select '2a000000-0000-0000-0000-000000000001','1a000000-0000-0000-0000-000000000001',id from public.roles where slug='owner';
insert into public.people(id,tenant_id,display_name,primary_phone,contact_allowed) values
('3a000000-0000-0000-0000-000000000001','2a000000-0000-0000-0000-000000000001','Source','06 12 34 56 78',true),
('3a000000-0000-0000-0000-000000000002','2a000000-0000-0000-0000-000000000001','Alias','+33612345678',true),
('3a000000-0000-0000-0000-000000000003','2a000000-0000-0000-0000-000000000002','Foreign same mobile','+33612345678',true);
insert into public.vsc_brevo_contact_links(tenant_id,provider_id,person_id,email_blocked,sms_blocked,do_not_contact,identity_snapshot,source_status_snapshot,last_outcome,last_imported_by)
select tenant_id,1,id,false,false,false,'{"phones":["+33612345678"],"emails":[]}','{}','created','1a000000-0000-0000-0000-000000000001' from public.people where id in ('3a000000-0000-0000-0000-000000000001','3a000000-0000-0000-0000-000000000003');
insert into public.vsc_campaigns(id,tenant_id,name) values('4a000000-0000-0000-0000-000000000001','2a000000-0000-0000-0000-000000000001','Own fixture'),('4a000000-0000-0000-0000-000000000002','2a000000-0000-0000-0000-000000000002','Foreign fixture');
insert into public.vsc_campaign_deliveries(tenant_id,campaign_id,person_id,channel,step_key,scheduled_at) select tenant_id,case when tenant_id='2a000000-0000-0000-0000-000000000001' then '4a000000-0000-0000-0000-000000000001'::uuid else '4a000000-0000-0000-0000-000000000002'::uuid end,id,'sms','sms-initial',now() from public.people where tenant_id in ('2a000000-0000-0000-0000-000000000001','2a000000-0000-0000-0000-000000000002');
insert into public.vsc_campaign_deliveries(tenant_id,campaign_id,person_id,channel,step_key,scheduled_at) values('2a000000-0000-0000-0000-000000000001','4a000000-0000-0000-0000-000000000001','3a000000-0000-0000-0000-000000000001','email','email-fixture',now());
update public.vsc_campaigns set state='active',approved_by='1a000000-0000-0000-0000-000000000001',approved_at=now(),enabled_at=now(),sms_content='{"version":1,"messages":[{"stepKey":"sms-initial","promotional":false,"text":"VendreSonCommerce test STOP au [STOP_CODE]"},{"stepKey":"sms-followup-1","promotional":false,"text":"VendreSonCommerce test STOP au [STOP_CODE]"},{"stepKey":"sms-followup-2","promotional":false,"text":"VendreSonCommerce test STOP au [STOP_CODE]"}]}' where tenant_id='2a000000-0000-0000-0000-000000000001';
set local role service_role;
do $$declare t uuid:='2a000000-0000-0000-0000-000000000001';p uuid:='3a000000-0000-0000-0000-000000000001';c uuid:='4a000000-0000-0000-0000-000000000001';d uuid;r jsonb;token uuid;payload jsonb;begin
 select id into d from public.vsc_campaign_deliveries where tenant_id=t and person_id=p and channel='sms';
 update public.vsc_campaign_deliveries set status='scheduled' where tenant_id=t and id=d;
 update public.vsc_campaigns set sms_content=jsonb_set(sms_content,'{messages,0,text}','"VendreSonCommerce 79 EUR HT STOP au [STOP_CODE]"') where tenant_id=t and id=c;
 if public.vsc_reserve_sms_delivery(t,d) is not null then raise exception 'Promotion disguised as neutral accepted';end if;
 update public.vsc_campaigns set sms_content=jsonb_set(sms_content,'{messages,0,text}','"VendreSonCommerce test STOP au [STOP_CODE]"') where tenant_id=t and id=c;
 r:=public.vsc_reserve_sms_delivery(t,d);if r is null or r->'payload'->>'sender'<>'VDC' then raise exception 'SMS reserve failed';end if;token:=(r->>'claimToken')::uuid;
 if public.vsc_reserve_sms_delivery(t,d) is not null then raise exception 'SMS reserved twice';end if;
 payload:=public.vsc_begin_sms_dispatch(t,d,token);if payload is null then raise exception 'SMS begin failed';end if;
 if public.vsc_begin_sms_dispatch(t,d,token) is not null or public.vsc_release_sms_reservation(t,d,token) then raise exception 'SMS begin reused or released';end if;
 if not public.vsc_record_sms_dispatch_result(t,d,token,'sent','123') then raise exception 'SMS acceptance not recorded';end if;
 if not public.vsc_record_sms_dispatch_result(t,d,token,'sent','123') then raise exception 'Receipt replay not idempotent';end if;
 begin perform public.vsc_record_sms_dispatch_result(t,d,token,'sent','124');raise exception 'Receipt identity changed';exception when raise_exception then if sqlerrm='Receipt identity changed' then raise;end if;end;
 if public.vsc_reserve_sms_delivery(t,d) is not null then raise exception 'Accepted SMS retried';end if;
 insert into public.vsc_brevo_contact_links(tenant_id,provider_id,person_id,email_blocked,sms_blocked,do_not_contact,identity_snapshot,source_status_snapshot,last_outcome,last_imported_by) values(t,2,'3a000000-0000-0000-0000-000000000002',false,false,false,'{}','{}','matched','1a000000-0000-0000-0000-000000000001');
 select id into d from public.vsc_campaign_deliveries where tenant_id=t and person_id='3a000000-0000-0000-0000-000000000002' and channel='sms';
 update public.vsc_campaign_deliveries set status='scheduled' where tenant_id=t and id=d;
 if public.vsc_reserve_sms_delivery(t,d) is not null then raise exception 'Alias duplicated accepted SMS';end if;
 select id into d from public.vsc_campaign_deliveries where tenant_id=t and channel='email';if public.vsc_reserve_sms_delivery(t,d) is not null then raise exception 'SMS claimed email';end if;
 insert into public.vsc_campaign_deliveries(tenant_id,campaign_id,person_id,channel,step_key,scheduled_at,status) values(t,c,p,'sms','sms-followup-1',now(),'scheduled') returning id into d;
 r:=public.vsc_reserve_sms_delivery(t,d);token:=(r->>'claimToken')::uuid;
 update public.vsc_campaigns set sms_content=jsonb_set(sms_content,'{messages,1,text}','"VendreSonCommerce changed STOP au [STOP_CODE]"') where tenant_id=t and id=c;
 if public.vsc_begin_sms_dispatch(t,d,token) is not null then raise exception 'Changed SMS copy accepted';end if;
 insert into public.vsc_campaign_deliveries(tenant_id,campaign_id,person_id,channel,step_key,scheduled_at,status) values(t,c,p,'sms','sms-followup-2',now(),'scheduled') returning id into d;
 r:=public.vsc_reserve_sms_delivery(t,d);if r is null then raise exception 'SMS followup reserve failed';end if;token:=(r->>'claimToken')::uuid;
 perform public.vsc_unsubscribe_contact(t,'3a000000-0000-0000-0000-000000000002','sms');
 if public.vsc_begin_sms_dispatch(t,d,token) is not null then raise exception 'Alias SMS STOP ignored';end if;
 if not exists(select 1 from public.vsc_campaign_deliveries where tenant_id=t and channel='email' and status='draft') then raise exception 'Email mutated by SMS';end if;
 if exists(select 1 from public.vsc_campaign_deliveries where tenant_id='2a000000-0000-0000-0000-000000000002' and status<>'draft') then raise exception 'Foreign SMS mutated';end if;
 insert into public.people(id,tenant_id,display_name,primary_phone,contact_allowed) values('3a000000-0000-0000-0000-000000000004',t,'Unknown fixture','0712345678',true);
 insert into public.vsc_brevo_contact_links(tenant_id,provider_id,person_id,email_blocked,sms_blocked,do_not_contact,identity_snapshot,source_status_snapshot,last_outcome,last_imported_by) values(t,4,'3a000000-0000-0000-0000-000000000004',false,false,false,'{}','{}','matched','1a000000-0000-0000-0000-000000000001');
 insert into public.vsc_campaign_deliveries(tenant_id,campaign_id,person_id,channel,step_key,scheduled_at,status) values(t,c,'3a000000-0000-0000-0000-000000000004','sms','sms-initial',now(),'scheduled') returning id into d;
 r:=public.vsc_reserve_sms_delivery(t,d);token:=(r->>'claimToken')::uuid;
 if public.vsc_begin_sms_dispatch(t,d,token) is null then raise exception 'Unknown fixture could not begin';end if;
 if not public.vsc_record_sms_dispatch_result(t,d,token,'unknown') then raise exception 'Unknown SMS not recorded';end if;
 if public.vsc_reserve_sms_delivery(t,d) is not null then raise exception 'Unknown SMS retried';end if;
 begin perform public.vsc_record_sms_dispatch_result(t,d,token,'sent','123');raise exception 'Unknown SMS resolved without review';exception when raise_exception then if sqlerrm='Unknown SMS resolved without review' then raise;end if;end;
 insert into public.vsc_campaign_deliveries(tenant_id,campaign_id,person_id,channel,step_key,scheduled_at,status) values(t,c,'3a000000-0000-0000-0000-000000000004','sms','sms-followup-1',now(),'scheduled') returning id into d;
 if public.vsc_reserve_sms_delivery(t,d) is not null then raise exception 'Unknown outcome did not block next SMS';end if;
end $$;
reset role;
do $$declare f text;begin
 foreach f in array array['vsc_sms_dispatch_payload(uuid,uuid)','vsc_reserve_sms_delivery(uuid,uuid)','vsc_begin_sms_dispatch(uuid,uuid,uuid)','vsc_release_sms_reservation(uuid,uuid,uuid)','vsc_record_sms_dispatch_result(uuid,uuid,uuid,text,text)'] loop
 if has_function_privilege('anon','public.'||f,'EXECUTE') or has_function_privilege('authenticated','public.'||f,'EXECUTE') or not has_function_privilege('service_role','public.'||f,'EXECUTE') then raise exception 'SMS RPC grant wrong: %',f;end if;
 end loop;
end $$;
rollback;
