\set ON_ERROR_STOP on
begin;
insert into public.tenants(id,name) values('29200000-0000-0000-0000-000000000001','Personal test fixture');
insert into auth.users(id,email) values('19200000-0000-0000-0000-000000000001','one-test-owner@fixture.invalid');
insert into public.tenant_users(tenant_id,user_id,role_id) select '29200000-0000-0000-0000-000000000001','19200000-0000-0000-0000-000000000001',id from public.roles where slug='owner';
insert into vsc_private.technical_pilot_targets(tenant_id,confirmed_by,email,mobile) values('29200000-0000-0000-0000-000000000001','19200000-0000-0000-0000-000000000001','synthetic@fixture.invalid','+33600000002');
insert into vsc_private.technical_pilot_attempts(tenant_id,channel,approved_by,target_confirmed_at,expires_at) select tenant_id,c,confirmed_by,confirmed_at,now()+interval '2 hours' from vsc_private.technical_pilot_targets cross join (values('email'),('sms')) v(c) where tenant_id='29200000-0000-0000-0000-000000000001';
do $$ begin
 if not (select relrowsecurity from pg_class where oid='vsc_private.technical_pilot_attempts'::regclass) then raise exception 'Missing RLS';end if;
 if has_function_privilege('authenticated','public.vsc_claim_personal_test(uuid,uuid,text,timestamptz)','EXECUTE') or has_function_privilege('anon','public.vsc_finish_personal_test(uuid,uuid,uuid,text,text)','EXECUTE') or has_table_privilege('authenticated','vsc_private.technical_pilot_attempts','SELECT') or has_table_privilege('service_role','vsc_private.technical_pilot_attempts','INSERT') or has_column_privilege('service_role','vsc_private.technical_pilot_attempts','expires_at','UPDATE') then raise exception 'Excess test privileges';end if;
end $$;
set local role service_role;
do $$ declare stamp timestamptz;r jsonb;id uuid;begin
 select confirmed_at into stamp from vsc_private.technical_pilot_targets where tenant_id='29200000-0000-0000-0000-000000000001';
 if public.vsc_claim_personal_test('29200000-0000-0000-0000-000000000001','19200000-0000-0000-0000-000000000002','email',stamp) is not null then raise exception 'Foreign actor';end if;
 if public.vsc_claim_personal_test('29200000-0000-0000-0000-000000000002','19200000-0000-0000-0000-000000000001','email',stamp) is not null then raise exception 'Foreign tenant';end if;
 if public.vsc_claim_personal_test('29200000-0000-0000-0000-000000000001','19200000-0000-0000-0000-000000000001','email',stamp-interval '1 second') is not null then raise exception 'Stale target';end if;
 r:=public.vsc_claim_personal_test('29200000-0000-0000-0000-000000000001','19200000-0000-0000-0000-000000000001','email',stamp);
 if r is null or r->>'recipient'<>'synthetic@fixture.invalid' then raise exception 'Claim failed';end if;id:=(r->>'id')::uuid;
 if public.vsc_claim_personal_test('29200000-0000-0000-0000-000000000001','19200000-0000-0000-0000-000000000001','email',stamp) is not null then raise exception 'Duplicate submission';end if;
 if public.vsc_finish_personal_test('29200000-0000-0000-0000-000000000002','19200000-0000-0000-0000-000000000001',id,'accepted','fixture-ref') then raise exception 'Foreign receipt';end if;
 if not public.vsc_finish_personal_test('29200000-0000-0000-0000-000000000001','19200000-0000-0000-0000-000000000001',id,'unknown',null) then raise exception 'Unknown not recorded';end if;
 if public.vsc_finish_personal_test('29200000-0000-0000-0000-000000000001','19200000-0000-0000-0000-000000000001',id,'accepted','fixture-ref') then raise exception 'Unknown overwritten';end if;
 if public.vsc_claim_personal_test('29200000-0000-0000-0000-000000000001','19200000-0000-0000-0000-000000000001','email',stamp) is not null then raise exception 'Unknown retried';end if;
end $$;
reset role;
update public.tenant_users set status='suspended' where tenant_id='29200000-0000-0000-0000-000000000001';
set local role service_role;
do $$ begin if public.vsc_claim_personal_test('29200000-0000-0000-0000-000000000001','19200000-0000-0000-0000-000000000001','sms',(select confirmed_at from vsc_private.technical_pilot_targets where tenant_id='29200000-0000-0000-0000-000000000001')) is not null then raise exception 'Suspended actor';end if;end $$;
rollback;
