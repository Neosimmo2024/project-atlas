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
-- Pending rows cannot be closed, even with an apparently matching observation.
set local role service_role;
select pg_temp.assert_rejected('update public.roles set slug=slug', 'server cannot change role authority');
select pg_temp.assert_rejected('update public.brevo_contact_sync_attempts set status=status', 'server cannot rewrite outcomes');
select public.record_brevo_contact_check(tenant_a, owner_a, (select id from check_fixture), 'pending', 'linked_contact_observed_review_required') from journal_fixture;
select pg_temp.assert_rejected('select public.close_brevo_contact_review(tenant_a,owner_a,(select id from check_fixture),(select id from public.brevo_contact_checks limit 1)) from journal_fixture', 'pending writer is protected', 'P0001');
reset role;
update public.brevo_contact_sync_attempts set status='write_outcome_unknown', result_code='reconcile_before_retry' where id=(select id from check_fixture);
set local role service_role;
-- A check from the previous pending state is not usable.
select pg_temp.assert_rejected('select public.close_brevo_contact_review(tenant_a,owner_a,(select id from check_fixture),(select id from public.brevo_contact_checks limit 1)) from journal_fixture', 'stale state rejected', 'P0001');
select public.record_brevo_contact_check(tenant_a, owner_a, (select id from check_fixture), 'write_outcome_unknown', 'outcome_unresolved') from journal_fixture;
select pg_temp.assert_rejected('select public.close_brevo_contact_review(tenant_a,owner_a,(select id from check_fixture),(select id from public.brevo_contact_checks order by recorded_at desc,id desc limit 1)) from journal_fixture', 'absence is not closure evidence', 'P0001');
select public.record_brevo_contact_check(tenant_a, owner_a, (select id from check_fixture), 'write_outcome_unknown', 'linked_contact_observed_review_required') from journal_fixture;
reset role;
-- Age manipulation is fixture setup by database owner, not an application privilege.
update public.brevo_contact_checks set recorded_at=clock_timestamp()-interval '10 minutes'
where outcome='linked_contact_observed_review_required' and attempt_status='write_outcome_unknown';
set local role service_role;
select pg_temp.assert_rejected('select public.close_brevo_contact_review(tenant_a,owner_a,(select id from check_fixture),(select id from public.brevo_contact_checks where attempt_status=''write_outcome_unknown'' and outcome=''linked_contact_observed_review_required'' limit 1)) from journal_fixture', 'old evidence rejected', 'P0001');
select public.record_brevo_contact_check(tenant_a, owner_a, (select id from check_fixture), 'write_outcome_unknown', 'linked_contact_observed_review_required') from journal_fixture;
select public.record_brevo_contact_check(tenant_a, owner_a, (select id from check_fixture), 'write_outcome_unknown', 'source_changed') from journal_fixture;
select pg_temp.assert_rejected('select public.close_brevo_contact_review(tenant_a,owner_a,(select id from check_fixture),(select id from public.brevo_contact_checks where outcome=''linked_contact_observed_review_required'' order by recorded_at desc,id desc limit 1)) from journal_fixture', 'superseded evidence rejected', 'P0001');
reset role;
update public.brevo_contact_checks set recorded_at=clock_timestamp()-interval '1 minute';
set local role service_role;
select public.record_brevo_contact_check(tenant_a, owner_a, (select id from check_fixture), 'write_outcome_unknown', 'suppression_observed_review_required') from journal_fixture;
select pg_temp.assert_rejected('select public.close_brevo_contact_review(tenant_a,admin_a,(select id from check_fixture),(select id from public.brevo_contact_checks order by recorded_at desc,id desc limit 1)) from journal_fixture', 'another actors check rejected', 'P0001');
select pg_temp.assert_rejected('select public.close_brevo_contact_review(tenant_a,reader_a,(select id from check_fixture),(select id from public.brevo_contact_checks order by recorded_at desc,id desc limit 1)) from journal_fixture', 'reader actor denied', 'P0001');
select pg_temp.assert_rejected('select public.close_brevo_contact_review(tenant_b,owner_b,(select id from check_fixture),(select id from public.brevo_contact_checks order by recorded_at desc,id desc limit 1)) from journal_fixture', 'foreign tenant denied', 'P0001');
select public.close_brevo_contact_review(tenant_a,owner_a,(select id from check_fixture),(select id from public.brevo_contact_checks order by recorded_at desc,id desc limit 1)) from journal_fixture;
select pg_temp.assert_true((select count(*)=1 and bool_and(decision='suppression_observed_keep_blocked') from public.brevo_contact_reviews), 'one conservative review recorded');
select pg_temp.assert_true((select public.close_brevo_contact_review(tenant_a,owner_a,(select id from check_fixture),(select check_id from public.brevo_contact_reviews))=(select id from public.brevo_contact_reviews) from journal_fixture), 'repeat returns same review');
select pg_temp.assert_true((select count(*)=1 from public.brevo_contact_reviews), 'repeat never duplicates review');
select pg_temp.assert_true((select status='write_outcome_unknown' and result_code='reconcile_before_retry' and provider_contact_id is null from public.brevo_contact_sync_attempts where id=(select id from check_fixture)), 'historical uncertainty preserved');
select pg_temp.assert_rejected('update public.brevo_contact_reviews set decision=''linked_observed_keep_blocked''', 'server cannot rewrite decision');
select pg_temp.assert_rejected('delete from public.brevo_contact_reviews', 'server cannot erase review');
reset role;
update public.tenant_users set status='suspended' where user_id=(select owner_a from journal_fixture);
set local role service_role;
select pg_temp.assert_rejected('select public.close_brevo_contact_review(tenant_a,owner_a,(select id from check_fixture),(select check_id from public.brevo_contact_reviews)) from journal_fixture', 'idempotent repeat still checks revoked actor', 'P0001');
reset role;
update public.tenant_users set status='active' where user_id=(select owner_a from journal_fixture);
set local role authenticated;
select set_config('request.jwt.claim.sub', owner_a::text, true) from journal_fixture;
select pg_temp.assert_true((select count(*)=1 from public.brevo_contact_reviews), 'owner reads review');
select pg_temp.assert_rejected('insert into public.brevo_contact_sync_attempts(tenant_id,user_id,person_id) select tenant_a,owner_a,person_a from journal_fixture', 'closed review never releases retry lock', '23505');
select pg_temp.assert_rejected('select public.close_brevo_contact_review(tenant_a,owner_a,(select id from check_fixture),(select check_id from public.brevo_contact_reviews)) from journal_fixture', 'client cannot call RPC');
select pg_temp.assert_rejected('insert into public.brevo_contact_reviews(tenant_id,attempt_id,check_id,user_id,decision) select tenant_id,attempt_id,check_id,user_id,decision from public.brevo_contact_reviews', 'client cannot forge review');
select pg_temp.assert_rejected('update public.brevo_contact_reviews set decision=''linked_observed_keep_blocked''', 'client cannot edit review');
select pg_temp.assert_rejected('delete from public.brevo_contact_reviews', 'client cannot delete review');
select set_config('request.jwt.claim.sub', owner_b::text, true) from journal_fixture;
select pg_temp.assert_true((select count(*)=0 from public.brevo_contact_reviews), 'foreign tenant cannot read review');
select set_config('request.jwt.claim.sub', reader_a::text, true) from journal_fixture;
select pg_temp.assert_true((select count(*)=0 from public.brevo_contact_reviews), 'reader cannot read review');
set local role anon;
select pg_temp.assert_rejected('select * from public.brevo_contact_reviews', 'anon cannot read review');
select pg_temp.assert_rejected('select public.close_brevo_contact_review(null,null,null,null)', 'anon cannot call RPC');
reset role;
rollback;
\echo Brevo reviews passed: fresh evidence, immutable closure, tenant isolation, no retry unlock.
