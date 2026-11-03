-- Synthetic SMS STOP and alias cancellation, every write rolled back.
\set ON_ERROR_STOP on
begin;
insert into public.tenants(id,name) values('28000000-0000-0000-0000-000000000001','SMS STOP fixture'),('28000000-0000-0000-0000-000000000002','Foreign SMS fixture');
insert into auth.users(id,email) values('18000000-0000-0000-0000-000000000001','sms-stop-owner@fixture.invalid');
insert into public.tenant_users(tenant_id,user_id,role_id) select '28000000-0000-0000-0000-000000000001','18000000-0000-0000-0000-000000000001',id from public.roles where slug='owner';
insert into public.people(id,tenant_id,display_name,primary_phone,contact_allowed) values
('38000000-0000-0000-0000-000000000001','28000000-0000-0000-0000-000000000001','Source','06 12 34 56 78',true),
('38000000-0000-0000-0000-000000000002','28000000-0000-0000-0000-000000000001','Alias','+33612345678',true),
('38000000-0000-0000-0000-000000000003','28000000-0000-0000-0000-000000000002','Foreign same mobile','+33612345678',true);
insert into public.vsc_brevo_contact_links(tenant_id,provider_id,person_id,email_blocked,sms_blocked,do_not_contact,identity_snapshot,source_status_snapshot,last_outcome,last_imported_by)
select tenant_id,1,id,false,false,false,'{"phones":["+33612345678"],"emails":[]}','{}','created','18000000-0000-0000-0000-000000000001' from public.people where id in ('38000000-0000-0000-0000-000000000001','38000000-0000-0000-0000-000000000003');
insert into public.vsc_campaigns(id,tenant_id,name) values('48000000-0000-0000-0000-000000000001','28000000-0000-0000-0000-000000000001','Own fixture'),('48000000-0000-0000-0000-000000000002','28000000-0000-0000-0000-000000000002','Foreign fixture');
insert into public.vsc_campaign_deliveries(tenant_id,campaign_id,person_id,channel,step_key,scheduled_at) select tenant_id,case when tenant_id='28000000-0000-0000-0000-000000000001' then '48000000-0000-0000-0000-000000000001'::uuid else '48000000-0000-0000-0000-000000000002'::uuid end,id,'sms','sms-fixture',now() from public.people where tenant_id in ('28000000-0000-0000-0000-000000000001','28000000-0000-0000-0000-000000000002');
insert into public.vsc_campaign_deliveries(tenant_id,campaign_id,person_id,channel,step_key,scheduled_at) values('28000000-0000-0000-0000-000000000001','48000000-0000-0000-0000-000000000001','38000000-0000-0000-0000-000000000001','email','email-fixture',now());
update public.vsc_brevo_contact_links set source_email='shop@fixture.invalid',history_campaign_2='{"sentAt":"2026-10-26T09:48:00Z"}' where tenant_id='28000000-0000-0000-0000-000000000001';
insert into public.vsc_historical_imap_cursors(tenant_id) values('28000000-0000-0000-0000-000000000001');
set local role service_role;
do $$declare t uuid:='28000000-0000-0000-0000-000000000001';a uuid:='18000000-0000-0000-0000-000000000001';messages jsonb:='[{"personId":"38000000-0000-0000-0000-000000000001","from":"shop@fixture.invalid","messageId":"<historical@fixture.invalid>","receivedAt":"2026-10-27T10:00:00Z"}]';r jsonb;begin
 r:=public.vsc_apply_historical_inbound_batch(t,a,0,'42',100,messages);
 if r<>jsonb_build_object('held',1,'cancelled',3,'version',1) then raise exception 'Hold counts incorrect: %',r;end if;
 if (select count(*) from public.vsc_contact_suppressions where tenant_id=t and channel='all')<>2 then raise exception 'Alias hold missing';end if;
 if exists(select 1 from public.people where tenant_id=t and (not contact_allowed or do_not_contact)) then raise exception 'Person permission mutated';end if;
 if exists(select 1 from public.vsc_inbound_replies where tenant_id=t) then raise exception 'Historical hold falsely marked verified reply';end if;
 if exists(select 1 from public.vsc_imap_cursors where tenant_id=t) then raise exception 'Exact thread checkpoint mutated';end if;
 if exists(select 1 from public.vsc_contact_suppressions where tenant_id='28000000-0000-0000-0000-000000000002') or not exists(select 1 from public.vsc_campaign_deliveries where tenant_id='28000000-0000-0000-0000-000000000002' and status='draft') then raise exception 'Foreign tenant mutated';end if;
 r:=public.vsc_apply_historical_inbound_batch(t,a,1,'42',100,messages);if r->>'held'<>'0' or r->>'cancelled'<>'0' then raise exception 'Replay duplicated';end if;
 begin perform public.vsc_apply_historical_inbound_batch(t,a,1,'42',101,'[]');raise exception 'Old version accepted';exception when raise_exception then if sqlerrm='Old version accepted' then raise;end if;end;
 begin perform public.vsc_apply_historical_inbound_batch(t,a,2,'43',101,'[]');raise exception 'Changed epoch accepted';exception when raise_exception then if sqlerrm='Changed epoch accepted' then raise;end if;end;
 begin perform public.vsc_apply_historical_inbound_batch(t,a,2,'42',99,'[]');raise exception 'Rewind accepted';exception when raise_exception then if sqlerrm='Rewind accepted' then raise;end if;end;
 begin perform public.vsc_apply_historical_inbound_batch(t,a,2,'42',101,replace(messages::text,'shop@fixture.invalid','unknown@fixture.invalid')::jsonb);raise exception 'Unknown sender accepted';exception when raise_exception then if sqlerrm='Unknown sender accepted' then raise;end if;end;
 if (select version from public.vsc_historical_imap_cursors where tenant_id=t)<>2 then raise exception 'Failed batch advanced checkpoint';end if;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','18000000-0000-0000-0000-000000000001',true);
do $$begin if (select count(*) from public.vsc_historical_inbound_holds)<>1 then raise exception 'Owner cannot see hold';end if;end $$;
select set_config('request.jwt.claim.sub','18000000-0000-0000-0000-000000000002',true);
do $$begin if exists(select 1 from public.vsc_historical_inbound_holds) then raise exception 'Foreign user sees hold';end if;end $$;
reset role;
select set_config('request.jwt.claim.sub','18000000-0000-0000-0000-000000000001',true);
update public.tenant_users set status='suspended' where tenant_id='28000000-0000-0000-0000-000000000001';
set local role service_role;
do $$begin
 begin perform public.vsc_apply_historical_inbound_batch('28000000-0000-0000-0000-000000000001','18000000-0000-0000-0000-000000000001',2,'42',101,'[]');raise exception 'Revoked actor accepted';exception when raise_exception then if sqlerrm='Revoked actor accepted' then raise;end if;end;
end $$;
reset role;
do $$begin
 if has_function_privilege('authenticated','public.vsc_apply_historical_inbound_batch(uuid,uuid,integer,text,bigint,jsonb)','EXECUTE') or has_function_privilege('anon','public.vsc_apply_historical_inbound_batch(uuid,uuid,integer,text,bigint,jsonb)','EXECUTE') then raise exception 'Historical RPC exposed';end if;
 if has_table_privilege('service_role','public.vsc_historical_inbound_holds','UPDATE') or has_table_privilege('authenticated','public.vsc_historical_imap_cursors','SELECT') then raise exception 'Journal mutable or cursor exposed';end if;
end $$;
rollback;
