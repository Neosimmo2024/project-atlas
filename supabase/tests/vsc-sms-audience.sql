-- Immutable SMS audience only, synthetic and rolled back.
\set ON_ERROR_STOP on
begin;
insert into public.tenants(id,name) values('27000000-0000-0000-0000-000000000001','Audience fixture'),('27000000-0000-0000-0000-000000000002','Foreign audience fixture');
insert into auth.users(id,email) values('17000000-0000-0000-0000-000000000001','audience-owner@fixture.invalid'),('17000000-0000-0000-0000-000000000002','audience-foreign@fixture.invalid');
insert into public.tenant_users(tenant_id,user_id,role_id) select t.id,t.u,r.id from (values('27000000-0000-0000-0000-000000000001'::uuid,'17000000-0000-0000-0000-000000000001'::uuid),('27000000-0000-0000-0000-000000000002','17000000-0000-0000-0000-000000000002')) t(id,u) cross join public.roles r where r.slug='owner';
insert into public.people(id,tenant_id,display_name,primary_phone,primary_email,contact_allowed) values
('37000000-0000-0000-0000-000000000001','27000000-0000-0000-0000-000000000001','Email mobile','06 12 34 56 78','audience@fixture.invalid',true),
('37000000-0000-0000-0000-000000000002','27000000-0000-0000-0000-000000000001','Alias','+33612345678',null,true),
('37000000-0000-0000-0000-000000000003','27000000-0000-0000-0000-000000000001','Mobile alone','0712345678','blocked-email@fixture.invalid',true),
('37000000-0000-0000-0000-000000000004','27000000-0000-0000-0000-000000000002','Foreign','0612345678','foreign@fixture.invalid',true);
insert into public.vsc_contact_suppressions(tenant_id,person_id,channel) values('27000000-0000-0000-0000-000000000001','37000000-0000-0000-0000-000000000003','email');
set local role service_role;
do $$ declare t uuid:='27000000-0000-0000-0000-000000000001';a uuid:='17000000-0000-0000-0000-000000000001';i uuid:='57000000-0000-0000-0000-000000000001';contacts jsonb;r jsonb;begin
 select jsonb_agg(jsonb_build_object('id',id,'display_name',display_name,'mobile',mobile,'has_email',has_email) order by mobile,id) into contacts from public.vsc_sms_audience_contacts(t);
 if jsonb_array_length(contacts)<>2 then raise exception 'SMS deduplication/isolation failed';end if;
 r:=public.vsc_save_sms_audience(t,a,i,'Audience',contacts);if r->>'recipients'<>'2' or r->>'emailMobile'<>'1' or r->>'mobileOnly'<>'1' or r->>'reused'<>'false' then raise exception 'Audience save failed';end if;
 r:=public.vsc_save_sms_audience(t,a,i,'Audience',contacts);if r->>'reused'<>'true' then raise exception 'Identical retry duplicated';end if;
 begin perform public.vsc_save_sms_audience(t,a,i,'Changed name',contacts);raise exception 'Identity overwrite accepted';exception when raise_exception then if sqlerrm='Identity overwrite accepted' then raise;end if;end;
 perform public.vsc_unsubscribe_contact(t,'37000000-0000-0000-0000-000000000002','sms');
 begin perform public.vsc_save_sms_audience(t,a,'57000000-0000-0000-0000-000000000002','Stale',contacts);raise exception 'Stale STOP snapshot accepted';exception when raise_exception then if sqlerrm='Stale STOP snapshot accepted' then raise;end if;end;
 if (select count(*) from public.vsc_sms_audience_drafts where tenant_id=t)<>1 or exists(select 1 from public.vsc_campaigns where tenant_id=t) or exists(select 1 from public.vsc_campaign_deliveries where tenant_id=t) then raise exception 'Audience created campaign/delivery or duplicate';end if;
end $$;
reset role;
do $$begin
 if has_function_privilege('authenticated','public.vsc_save_sms_audience(uuid,uuid,uuid,text,jsonb)','EXECUTE') or has_function_privilege('anon','public.vsc_sms_audience_contacts(uuid)','EXECUTE') then raise exception 'Audience RPC exposed';end if;
 if has_table_privilege('service_role','public.vsc_sms_audience_drafts','UPDATE') or has_table_privilege('service_role','public.vsc_sms_audience_drafts','DELETE') then raise exception 'Audience not immutable';end if;
 if not exists(select 1 from pg_class where oid='public.vsc_sms_audience_drafts'::regclass and relrowsecurity) then raise exception 'Audience RLS missing';end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','17000000-0000-0000-0000-000000000001',true);
do $$begin if (select count(*) from public.vsc_sms_audience_drafts)<>1 then raise exception 'Owner cannot read audience';end if;end $$;
select set_config('request.jwt.claim.sub','17000000-0000-0000-0000-000000000002',true);
do $$begin if exists(select 1 from public.vsc_sms_audience_drafts) then raise exception 'Foreign owner sees audience';end if;end $$;
reset role;
rollback;
