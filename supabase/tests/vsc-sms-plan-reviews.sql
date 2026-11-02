-- Immutable SMS audience only, synthetic and rolled back.
\set ON_ERROR_STOP on
begin;
insert into public.tenants(id,name) values('28000000-0000-0000-0000-000000000001','Audience fixture'),('28000000-0000-0000-0000-000000000002','Foreign audience fixture');
insert into auth.users(id,email) values('18000000-0000-0000-0000-000000000001','audience-owner@fixture.invalid'),('18000000-0000-0000-0000-000000000002','audience-foreign@fixture.invalid');
insert into public.tenant_users(tenant_id,user_id,role_id) select t.id,t.u,r.id from (values('28000000-0000-0000-0000-000000000001'::uuid,'18000000-0000-0000-0000-000000000001'::uuid),('28000000-0000-0000-0000-000000000002','18000000-0000-0000-0000-000000000002')) t(id,u) cross join public.roles r where r.slug='owner';
insert into public.people(id,tenant_id,display_name,primary_phone,primary_email,contact_allowed) values
('38000000-0000-0000-0000-000000000001','28000000-0000-0000-0000-000000000001','Email mobile','06 12 34 56 78','audience@fixture.invalid',true),
('38000000-0000-0000-0000-000000000002','28000000-0000-0000-0000-000000000001','Alias','+33612345678',null,true),
('38000000-0000-0000-0000-000000000003','28000000-0000-0000-0000-000000000001','Mobile alone','0712345678','blocked-email@fixture.invalid',true),
('38000000-0000-0000-0000-000000000004','28000000-0000-0000-0000-000000000002','Foreign','0612345678','foreign@fixture.invalid',true);
insert into public.vsc_contact_suppressions(tenant_id,person_id,channel) values('28000000-0000-0000-0000-000000000001','38000000-0000-0000-0000-000000000003','email');
set local role service_role;
do $$ declare t uuid:='28000000-0000-0000-0000-000000000001';a uuid:='18000000-0000-0000-0000-000000000001';i uuid:='58000000-0000-0000-0000-000000000001';contacts jsonb;c jsonb;r jsonb;d date:=(now() at time zone 'Europe/Paris')::date;begin
 select jsonb_agg(jsonb_build_object('id',id,'mobile',mobile) order by mobile,id) into contacts from public.vsc_sms_audience_contacts(t) where not has_email;
 if jsonb_array_length(contacts)<>1 then raise exception 'Not mobile-only';end if;
 if d>'2026-11-30'::date then
 begin perform public.vsc_save_sms_plan_review(t,a,i,d,contacts,'{}');raise exception 'Expired review accepted';exception when raise_exception then if sqlerrm='Expired review accepted' then raise;end if;end;return;end if;
 select jsonb_build_object('today',d,'startDate',d,'mobileOnly',1,'readOnly',true,'sendingEnabled',false,'mobileOnlySteps',jsonb_agg(jsonb_build_object('offsetDays',n*15,'date',d+n*15,'count',1,'text','VendreSonCommerce : votre annonce jusqu a la vente. STOP au [STOP_CODE]','promotional',d+n*15<='2026-11-30'::date,'providerDayAllowed',true) order by n)) into c from generate_series(0,4) n;
 r:=public.vsc_save_sms_plan_review(t,a,i,d,contacts,c);if r->>'recipients'<>'1' or r->>'reused'<>'false' then raise exception 'Save failed';end if;
 r:=public.vsc_save_sms_plan_review(t,a,i,d,contacts,c);if r->>'reused'<>'true' then raise exception 'Duplicate';end if;
 begin perform public.vsc_save_sms_plan_review(t,a,i,d,contacts,c||'{"sendingEnabled":true}');raise exception 'Enabled review accepted';exception when raise_exception then if sqlerrm='Enabled review accepted' then raise;end if;end;
 begin perform public.vsc_save_sms_plan_review(t,'18000000-0000-0000-0000-000000000002',i,d,contacts,c);raise exception 'Foreign actor accepted';exception when raise_exception then if sqlerrm='Foreign actor accepted' then raise;end if;end;
 begin perform public.vsc_save_sms_plan_review(t,a,i,d,contacts,c||'{"extra":"changed"}');raise exception 'Overwrite accepted';exception when raise_exception then if sqlerrm='Overwrite accepted' then raise;end if;end;
 perform public.vsc_unsubscribe_contact(t,'38000000-0000-0000-0000-000000000003','sms');
 begin perform public.vsc_save_sms_plan_review(t,a,'58000000-0000-0000-0000-000000000002',d,contacts,c);raise exception 'Stale STOP accepted';exception when raise_exception then if sqlerrm='Stale STOP accepted' then raise;end if;end;
 if exists(select 1 from public.vsc_campaigns where tenant_id=t) or exists(select 1 from public.vsc_campaign_deliveries where tenant_id=t) then raise exception 'Review created campaign/delivery';end if;
end $$;
reset role;
do $$begin
 if has_function_privilege('authenticated','public.vsc_save_sms_plan_review(uuid,uuid,uuid,date,jsonb,jsonb)','EXECUTE') or has_function_privilege('anon','public.vsc_save_sms_plan_review(uuid,uuid,uuid,date,jsonb,jsonb)','EXECUTE') then raise exception 'RPC exposed';end if;
 if has_table_privilege('service_role','public.vsc_sms_plan_reviews','UPDATE') or has_table_privilege('service_role','public.vsc_sms_plan_reviews','DELETE') then raise exception 'Not immutable';end if;
 if not exists(select 1 from pg_class where oid='public.vsc_sms_plan_reviews'::regclass and relrowsecurity) then raise exception 'RLS missing';end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','18000000-0000-0000-0000-000000000001',true);
do $$begin if (now() at time zone 'Europe/Paris')::date<='2026-11-30'::date and (select count(*) from public.vsc_sms_plan_reviews)<>1 then raise exception 'Owner cannot read';end if;end $$;
select set_config('request.jwt.claim.sub','18000000-0000-0000-0000-000000000002',true);
do $$begin if exists(select 1 from public.vsc_sms_plan_reviews) then raise exception 'Foreign owner sees review';end if;end $$;
reset role;
rollback;
