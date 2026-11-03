\set ON_ERROR_STOP on
begin;
insert into public.tenants(id,name) values('29100000-0000-0000-0000-000000000001','Technical pilot fixture'),('29100000-0000-0000-0000-000000000002','Foreign fixture');
insert into auth.users(id,email) values('19100000-0000-0000-0000-000000000001','pilot-owner@fixture.invalid');
insert into public.tenant_users(tenant_id,user_id,role_id) select '29100000-0000-0000-0000-000000000001','19100000-0000-0000-0000-000000000001',id from public.roles where slug='owner';
insert into vsc_private.technical_pilot_targets(tenant_id,confirmed_by,email,mobile) values('29100000-0000-0000-0000-000000000001','19100000-0000-0000-0000-000000000001','synthetic@fixture.invalid','+33600000001');
do $$ begin
 if not (select relrowsecurity from pg_class where oid='vsc_private.technical_pilot_targets'::regclass) then raise exception 'Missing RLS';end if;
 if has_table_privilege('authenticated','vsc_private.technical_pilot_targets','SELECT') or has_table_privilege('anon','vsc_private.technical_pilot_targets','SELECT') or has_table_privilege('service_role','vsc_private.technical_pilot_targets','INSERT') or has_table_privilege('service_role','vsc_private.technical_pilot_targets','UPDATE') then raise exception 'Excess target privileges';end if;
 if has_function_privilege('authenticated','public.vsc_technical_pilot_status(uuid,uuid)','EXECUTE') or has_function_privilege('anon','public.vsc_technical_pilot_status(uuid,uuid)','EXECUTE') then raise exception 'Public pilot RPC';end if;
end $$;
set local role service_role;
do $$ declare r jsonb;begin
 r:=public.vsc_technical_pilot_status('29100000-0000-0000-0000-000000000001','19100000-0000-0000-0000-000000000001');
 if r is null or r->>'emailMasked'<>'s***@fixture.invalid' or (r->>'sendingEnabled')::boolean or r::text like '%synthetic@%' or r::text like '%33600000001%' then raise exception 'Invalid private preview';end if;
 if public.vsc_technical_pilot_status('29100000-0000-0000-0000-000000000002','19100000-0000-0000-0000-000000000001') is not null or public.vsc_technical_pilot_status('29100000-0000-0000-0000-000000000001','19100000-0000-0000-0000-000000000002') is not null then raise exception 'Foreign actor/tenant exposed';end if;
end $$;
reset role;
update public.tenant_users set status='suspended' where tenant_id='29100000-0000-0000-0000-000000000001';
set local role service_role;
do $$ begin if public.vsc_technical_pilot_status('29100000-0000-0000-0000-000000000001','19100000-0000-0000-0000-000000000001') is not null then raise exception 'Suspended actor accepted';end if;end $$;
rollback;
