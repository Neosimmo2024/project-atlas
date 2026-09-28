\set ON_ERROR_STOP on
begin;
-- Match hosted least-privilege permissions, then apply the canonical fix.
revoke all on public.brevo_contact_sync_attempts from service_role;
revoke update on public.roles from service_role;
\ir ../supabase/migrations/20260928120500_brevo_contact_service_lock_grants.sql
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

grant select on journal_fixture to service_role;
insert into public.brevo_contact_sync_attempts(tenant_id,user_id,person_id)
select tenant_a,owner_a,person_a from journal_fixture;
create temporary table check_fixture as select id from public.brevo_contact_sync_attempts
where tenant_id=(select tenant_a from journal_fixture);
grant select on check_fixture to service_role, authenticated, anon;
set local role service_role;
select pg_temp.assert_rejected('update public.roles set slug=slug', 'server cannot change role authority');
select pg_temp.assert_rejected('update public.brevo_contact_sync_attempts set status=status', 'server cannot rewrite outcomes');
select public.record_brevo_contact_check(tenant_a, owner_a, (select id from check_fixture), 'pending', 'outcome_unresolved') from journal_fixture;
select public.record_brevo_contact_check(tenant_a, admin_a, (select id from check_fixture), 'pending', 'linked_contact_observed_review_required') from journal_fixture;
select pg_temp.assert_true((select count(*)=2 from public.brevo_contact_checks), 'two observations retained');
select pg_temp.assert_true((select status='pending' and finished_at is null from public.brevo_contact_sync_attempts where id=(select id from check_fixture)), 'observation never closes attempt');
select pg_temp.assert_rejected('select public.record_brevo_contact_check(tenant_a, reader_a, (select id from check_fixture), ''pending'', ''outcome_unresolved'') from journal_fixture', 'reader actor denied', 'P0001');
select pg_temp.assert_rejected('select public.record_brevo_contact_check(tenant_b, owner_b, (select id from check_fixture), ''pending'', ''outcome_unresolved'') from journal_fixture', 'foreign attempt denied', 'P0001');
select pg_temp.assert_rejected('select public.record_brevo_contact_check(tenant_a, owner_a, (select id from check_fixture), ''write_outcome_unknown'', ''outcome_unresolved'') from journal_fixture', 'stale state denied', 'P0001');
select pg_temp.assert_rejected('select public.record_brevo_contact_check(tenant_a, owner_a, (select id from check_fixture), ''pending'', ''personal information'') from journal_fixture', 'free text denied', '23514');
select pg_temp.assert_rejected('update public.brevo_contact_checks set outcome=''verification_failed''', 'server cannot edit history');
select pg_temp.assert_rejected('delete from public.brevo_contact_checks', 'server cannot erase history');
reset role;
update public.tenant_users set status='suspended' where user_id=(select admin_a from journal_fixture);
set local role service_role;
select pg_temp.assert_rejected('select public.record_brevo_contact_check(tenant_a, admin_a, (select id from check_fixture), ''pending'', ''outcome_unresolved'') from journal_fixture', 'revoked actor denied', 'P0001');
set local role authenticated;
select set_config('request.jwt.claim.sub', owner_a::text, true) from journal_fixture;
select pg_temp.assert_true((select count(*)=2 from public.brevo_contact_checks), 'owner reads audit');
select pg_temp.assert_rejected('select public.record_brevo_contact_check(tenant_a, owner_a, (select id from check_fixture), ''pending'', ''outcome_unresolved'') from journal_fixture', 'client cannot call server RPC');
select pg_temp.assert_rejected('insert into public.brevo_contact_checks(tenant_id,attempt_id,user_id,attempt_status,outcome) select tenant_a,(select id from check_fixture),owner_a,''pending'',''outcome_unresolved'' from journal_fixture', 'client cannot forge audit');
select pg_temp.assert_rejected('update public.brevo_contact_checks set outcome=''verification_failed''', 'client cannot edit history');
select pg_temp.assert_rejected('delete from public.brevo_contact_checks', 'client cannot delete history');
select pg_temp.assert_rejected('insert into public.brevo_contact_sync_attempts(tenant_id,user_id,person_id) select tenant_a,owner_a,person_a from journal_fixture', 'observed contact does not release pending lock', '23505');
update public.brevo_contact_sync_attempts set status='write_outcome_unknown', result_code='reconcile_before_retry' where id=(select id from check_fixture);
set local role service_role;
select public.record_brevo_contact_check(tenant_a, owner_a, (select id from check_fixture), 'write_outcome_unknown', 'suppression_observed_review_required') from journal_fixture;
set local role authenticated;
select pg_temp.assert_rejected('insert into public.brevo_contact_sync_attempts(tenant_id,user_id,person_id) select tenant_a,owner_a,person_a from journal_fixture', 'observed suppression does not release uncertain lock', '23505');
select set_config('request.jwt.claim.sub', owner_b::text, true) from journal_fixture;
select pg_temp.assert_true((select count(*)=0 from public.brevo_contact_checks), 'other tenant cannot read audit');
select set_config('request.jwt.claim.sub', reader_a::text, true) from journal_fixture;
select pg_temp.assert_true((select count(*)=0 from public.brevo_contact_checks), 'reader cannot read audit');
set local role anon;
select pg_temp.assert_rejected('select * from public.brevo_contact_checks', 'anon cannot read audit');
select pg_temp.assert_rejected('select public.record_brevo_contact_check(tenant_a, owner_a, (select id from check_fixture), ''pending'', ''outcome_unresolved'') from journal_fixture', 'anon cannot call RPC');
reset role;
rollback;
\echo Brevo checks passed: append-only audit, actor and tenant isolation, unchanged locks.
