\set ON_ERROR_STOP on
begin;
create temporary table sms_fixture as select gen_random_uuid() tenant_a,gen_random_uuid() tenant_b,gen_random_uuid() owner_a,gen_random_uuid() owner_b,gen_random_uuid() reader_a;
grant select on sms_fixture to authenticated,anon,service_role;
insert into auth.users(id,email) select owner_a,'sms-a@example.invalid' from sms_fixture union all select owner_b,'sms-b@example.invalid' from sms_fixture union all select reader_a,'sms-reader@example.invalid' from sms_fixture;
insert into public.tenants(id,name) select tenant_a,'SMS A' from sms_fixture union all select tenant_b,'SMS B' from sms_fixture;
insert into public.tenant_users(tenant_id,user_id,role_id)
select tenant_a,owner_a,(select id from public.roles where slug='owner') from sms_fixture union all
select tenant_b,owner_b,(select id from public.roles where slug='owner') from sms_fixture union all
select tenant_a,reader_a,(select id from public.roles where slug='reader') from sms_fixture;
create function pg_temp.sms_assert(ok boolean,label text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'SMS assertion failed: %',label;end if;end $$;
create function pg_temp.sms_reject(statement text,expected_code text) returns void language plpgsql as $$ begin
 begin execute statement;exception when others then if sqlstate=expected_code then return;end if;raise;end;
 raise exception 'Expected SMS statement rejection';end $$;
set local role service_role;
insert into public.sms_personal_pilot_attempts(tenant_id,user_id,recipient_last4,message_sha256) select tenant_a,owner_a,'0000',repeat('a',64) from sms_fixture;
select pg_temp.sms_reject('insert into public.sms_personal_pilot_attempts(tenant_id,user_id,recipient_last4,message_sha256) select tenant_a,owner_a,''0000'',repeat(''a'',64) from sms_fixture','23505');
select pg_temp.sms_reject('update public.sms_personal_pilot_attempts set status=''accepted''','23514');
select pg_temp.sms_reject('update public.sms_personal_pilot_attempts set recipient_last4=''1111''','42501');
update public.sms_personal_pilot_attempts set status='accepted',provider_message_id='123';
select pg_temp.sms_assert((select status='accepted' and finished_at is not null from public.sms_personal_pilot_attempts),'acceptance recorded');
select pg_temp.sms_reject('update public.sms_personal_pilot_attempts set status=''unknown'',provider_message_id=null','P0001');
select pg_temp.sms_reject('delete from public.sms_personal_pilot_attempts','42501');
select pg_temp.sms_reject('insert into public.sms_personal_pilot_attempts(tenant_id,user_id,recipient_last4,message_sha256) select tenant_a,owner_a,''0000'',repeat(''a'',64) from sms_fixture','23505');
insert into public.sms_personal_pilot_attempts(tenant_id,user_id,recipient_last4,message_sha256) select tenant_b,owner_b,'0000',repeat('b',64) from sms_fixture;
update public.sms_personal_pilot_attempts set status='unknown' where status='pending';
select pg_temp.sms_reject('insert into public.sms_personal_pilot_attempts(tenant_id,user_id,recipient_last4,message_sha256) select tenant_b,owner_b,''0000'',repeat(''b'',64) from sms_fixture','23505');
set local role authenticated;
select set_config('request.jwt.claim.sub',owner_a::text,true) from sms_fixture;
select pg_temp.sms_assert((select count(*)=1 from public.sms_personal_pilot_attempts),'owner sees only own tenant and actor');
select pg_temp.sms_reject('insert into public.sms_personal_pilot_attempts(tenant_id,user_id,recipient_last4,message_sha256) select tenant_a,owner_a,''0000'',repeat(''a'',64) from sms_fixture','42501');
select pg_temp.sms_reject('update public.sms_personal_pilot_attempts set status=''unknown''','42501');
select pg_temp.sms_reject('delete from public.sms_personal_pilot_attempts','42501');
select set_config('request.jwt.claim.sub',reader_a::text,true) from sms_fixture;
select pg_temp.sms_assert((select count(*)=0 from public.sms_personal_pilot_attempts),'reader cannot see journal');
set local role anon;
select pg_temp.sms_reject('select * from public.sms_personal_pilot_attempts','42501');
rollback;
