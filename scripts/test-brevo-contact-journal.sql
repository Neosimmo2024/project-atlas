\set ON_ERROR_STOP on
begin;
-- Transactional fictitious fixtures. This file is only run against local CI.
create temporary table journal_fixture as select
  gen_random_uuid() as tenant_a, gen_random_uuid() as tenant_b,
  gen_random_uuid() as owner_a, gen_random_uuid() as owner_b,
  gen_random_uuid() as reader_a, gen_random_uuid() as admin_a,
  gen_random_uuid() as person_a, gen_random_uuid() as person_b;
grant select on journal_fixture to authenticated, anon;
insert into auth.users(id, email)
select owner_a, 'journal-owner-a@example.invalid' from journal_fixture union all
select owner_b, 'journal-owner-b@example.invalid' from journal_fixture union all
select reader_a, 'journal-reader-a@example.invalid' from journal_fixture union all
select admin_a, 'journal-admin-a@example.invalid' from journal_fixture;
insert into public.tenants(id, name)
select tenant_a, 'Journal fictitious A' from journal_fixture union all
select tenant_b, 'Journal fictitious B' from journal_fixture;
insert into public.tenant_users(tenant_id, user_id, role_id)
select tenant_a, owner_a, (select id from public.roles where slug='owner') from journal_fixture union all
select tenant_b, owner_b, (select id from public.roles where slug='owner') from journal_fixture union all
select tenant_a, reader_a, (select id from public.roles where slug='reader') from journal_fixture union all
select tenant_a, admin_a, (select id from public.roles where slug='admin') from journal_fixture;
insert into public.people(id, tenant_id, display_name)
select person_a, tenant_a, 'Fictitious journal person A' from journal_fixture union all
select person_b, tenant_b, 'Fictitious journal person B' from journal_fixture;

create function pg_temp.assert_true(ok boolean, label text) returns void
language plpgsql as $$ begin
  if ok is distinct from true then raise exception 'Journal assertion failed: %', label; end if;
end $$;
create function pg_temp.assert_rejected(statement text, label text, expected_code text default '42501') returns void
language plpgsql as $$ begin
  begin
    execute statement;
  exception when others then
    if sqlstate = expected_code then return; end if;
    raise;
  end;
  raise exception 'Expected rejection: %', label;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', owner_a::text, true) from journal_fixture;
insert into public.brevo_contact_sync_attempts(tenant_id,user_id,person_id)
select tenant_a,owner_a,person_a from journal_fixture;
select pg_temp.assert_true((select count(*)=1 from public.brevo_contact_sync_attempts), 'owner reads own tenant');
select pg_temp.assert_rejected('insert into public.brevo_contact_sync_attempts(tenant_id,user_id,person_id) select tenant_a,owner_a,person_a from journal_fixture', 'pending blocks another attempt', '23505');
select pg_temp.assert_rejected('insert into public.brevo_contact_sync_attempts(tenant_id,user_id,person_id) select tenant_a,owner_a,person_b from journal_fixture', 'foreign person');
select pg_temp.assert_rejected('insert into public.brevo_contact_sync_attempts(tenant_id,user_id,person_id) select tenant_b,owner_a,person_b from journal_fixture', 'foreign tenant');
select pg_temp.assert_rejected('insert into public.brevo_contact_sync_attempts(tenant_id,user_id,person_id) select tenant_a,reader_a,person_a from journal_fixture', 'forged actor');
select pg_temp.assert_rejected('update public.brevo_contact_sync_attempts set person_id=gen_random_uuid()', 'identity cannot change');
select pg_temp.assert_rejected('insert into public.brevo_contact_sync_attempts(tenant_id,user_id,person_id,status) select tenant_a,owner_a,person_a,''created'' from journal_fixture', 'terminal insert forbidden');
select pg_temp.assert_rejected('update public.brevo_contact_sync_attempts set status=''created''', 'success requires provider id', '23514');
select pg_temp.assert_rejected('update public.brevo_contact_sync_attempts set status=''failed'', result_code=''secret or contact data''', 'arbitrary details forbidden', '23514');

select set_config('request.jwt.claim.sub', admin_a::text, true) from journal_fixture;
select pg_temp.assert_true((select count(*)=1 from public.brevo_contact_sync_attempts), 'admin reads tenant history');
with changed as (update public.brevo_contact_sync_attempts set status='failed',result_code='provider_rejected' returning id)
select pg_temp.assert_true((select count(*)=0 from changed), 'different admin cannot finish actor attempt');

select set_config('request.jwt.claim.sub', owner_a::text, true) from journal_fixture;
update public.brevo_contact_sync_attempts set status='created',provider_contact_id=123;
select pg_temp.assert_true((select finished_at is not null and status='created' from public.brevo_contact_sync_attempts), 'completion timestamp generated');
with changed as (update public.brevo_contact_sync_attempts set status='suppressed',provider_contact_id=123 returning id)
select pg_temp.assert_true((select count(*)=0 from changed), 'terminal result immutable');
select pg_temp.assert_rejected('delete from public.brevo_contact_sync_attempts', 'history deletion forbidden');
select set_config('request.jwt.claim.sub', admin_a::text, true) from journal_fixture;
insert into public.brevo_contact_sync_attempts(tenant_id,user_id,person_id)
select tenant_a,admin_a,person_a from journal_fixture;
update public.brevo_contact_sync_attempts set status='failed',result_code='provider_rejected' where status='pending';
select pg_temp.assert_true((select count(*)=1 from public.brevo_contact_sync_attempts where status='failed'), 'admin starts and finishes own attempt');
select set_config('request.jwt.claim.sub', owner_a::text, true) from journal_fixture;
insert into public.brevo_contact_sync_attempts(tenant_id,user_id,person_id)
select tenant_a,owner_a,person_a from journal_fixture;
update public.brevo_contact_sync_attempts set status='write_outcome_unknown',result_code='reconcile_before_retry' where status='pending';
select pg_temp.assert_rejected('insert into public.brevo_contact_sync_attempts(tenant_id,user_id,person_id) select tenant_a,owner_a,person_a from journal_fixture', 'uncertain outcome blocks retry', '23505');

select set_config('request.jwt.claim.sub', owner_b::text, true) from journal_fixture;
select pg_temp.assert_true((select count(*)=0 from public.brevo_contact_sync_attempts), 'tenant B cannot read A');
with changed as (update public.brevo_contact_sync_attempts set status='failed',result_code='provider_rejected' returning id)
select pg_temp.assert_true((select count(*)=0 from changed), 'tenant B cannot update A');
insert into public.brevo_contact_sync_attempts(tenant_id,user_id,person_id)
select tenant_b,owner_b,person_b from journal_fixture;
reset role;
update public.tenant_users set status='suspended' where user_id=(select owner_b from journal_fixture);
set local role authenticated;
with changed as (update public.brevo_contact_sync_attempts set status='failed',result_code='provider_rejected' returning id)
select pg_temp.assert_true((select count(*)=0 from changed), 'revoked membership cannot finish');

select set_config('request.jwt.claim.sub', reader_a::text, true) from journal_fixture;
select pg_temp.assert_true((select count(*)=0 from public.brevo_contact_sync_attempts), 'reader cannot read journal');
select pg_temp.assert_rejected('insert into public.brevo_contact_sync_attempts(tenant_id,user_id,person_id) select tenant_a,reader_a,person_a from journal_fixture', 'reader cannot start');

set local role anon;
select pg_temp.assert_rejected('select * from public.brevo_contact_sync_attempts', 'anon cannot read');
select pg_temp.assert_rejected('insert into public.brevo_contact_sync_attempts(tenant_id,user_id,person_id) select tenant_a,owner_a,person_a from journal_fixture', 'anon cannot start');
select pg_temp.assert_rejected('update public.brevo_contact_sync_attempts set status=''failed''', 'anon cannot update');
select pg_temp.assert_rejected('delete from public.brevo_contact_sync_attempts', 'anon cannot delete');
reset role;
rollback;
\echo Brevo contact journal local SQL checks passed: RLS, actor binding, immutable results and unresolved lock.
