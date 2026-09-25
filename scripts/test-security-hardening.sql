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


select pg_temp.assert_true(not exists (
  select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
  cross join (values ('anon'), ('authenticated')) as roles(role_name)
  where n.nspname='public' and c.relkind='r'
    and (has_table_privilege(role_name,c.oid,'TRUNCATE')
      or has_table_privilege(role_name,c.oid,'REFERENCES')
      or has_table_privilege(role_name,c.oid,'TRIGGER'))
), 'no API structural/destructive grants');
select pg_temp.assert_true(not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prosecdef
    and has_function_privilege('anon',p.oid,'execute')
    and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e')
), 'no anonymous privileged application RPC');
set local role authenticated;
select set_config('request.jwt.claim.sub', owner_a::text, true) from journal_fixture;
update public.people set display_name='Audit trigger verified' where id=(select person_a from journal_fixture);
select pg_temp.assert_true(exists(select 1 from public.audit_log
  where record_id=(select person_a from journal_fixture) and action='update' and user_id=auth.uid()),
  'legitimate trigger still records authenticated mutation');
select pg_temp.assert_rejected('insert into public.audit_log(tenant_id,user_id,table_name,record_id,action)
  select tenant_a,owner_b,''people'',person_a,''update'' from journal_fixture', 'cannot forge audit actor');
select set_config('request.jwt.claim.sub', reader_a::text, true) from journal_fixture;
select pg_temp.assert_rejected('insert into public.audit_log(tenant_id,user_id,table_name,record_id,action)
  select tenant_a,owner_a,''people'',person_a,''update'' from journal_fixture', 'reader cannot forge audit');
reset role;
insert into public.tasks(tenant_id,person_id,title,metadata)
select tenant_a,person_a,'Fictitious reply',
  '{"source":"recruitment_candidate_reply","inbound_message_id":"<security-test@example.invalid>"}'::jsonb from journal_fixture;
select pg_temp.assert_rejected('insert into public.tasks(tenant_id,person_id,title,metadata)
  select tenant_a,person_a,''Duplicate reply'',
  ''{"source":"recruitment_candidate_reply","inbound_message_id":"<security-test@example.invalid>"}''::jsonb
  from journal_fixture', 'database rejects duplicate reply task', '23505');
insert into public.tasks(tenant_id,person_id,title,metadata)
select tenant_b,person_b,'Other tenant reply',
  '{"source":"recruitment_candidate_reply","inbound_message_id":"<security-test@example.invalid>"}'::jsonb from journal_fixture;
set local role authenticated;
select set_config('request.jwt.claim.sub', owner_b::text, true) from journal_fixture;
select pg_temp.assert_true((select count(*)=0 from public.tasks where tenant_id=(select tenant_a from journal_fixture)),
  'cross-tenant task isolation preserved');
reset role;
rollback;
\echo Security hardening SQL checks passed.
