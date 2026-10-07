\set ON_ERROR_STOP on
begin;
-- Fictitious transactional fixtures; all changes are rolled back.
create temporary table search_fixture as select gen_random_uuid() tenant_a, gen_random_uuid() tenant_b,
  gen_random_uuid() reader_a, gen_random_uuid() no_tenant, gen_random_uuid() person_a, gen_random_uuid() person_b,
  gen_random_uuid() organization_a;
grant select on search_fixture to authenticated;
insert into auth.users(id,email) select reader_a,'search-reader@example.invalid' from search_fixture union all
  select no_tenant,'search-no-tenant@example.invalid' from search_fixture;
insert into public.tenants(id,name) select tenant_a,'Search fixture A' from search_fixture union all select tenant_b,'Search fixture B' from search_fixture;
insert into public.tenant_users(tenant_id,user_id,role_id) select tenant_a,reader_a,(select id from public.roles where slug='reader') from search_fixture;
insert into public.people(tenant_id,display_name,city,updated_at)
  select tenant_a,'Recent filler ' || n,'Paris',now() from search_fixture cross join generate_series(1,600) n;
insert into public.people(id,tenant_id,display_name,city,primary_phone,updated_at)
  select person_a,tenant_a,'Élodie 100%_\\ Lyon','Écully','0123456789','2020-01-01'::timestamptz from search_fixture union all
  select person_b,tenant_b,'Élodie hidden','Écully',null,'2020-01-01'::timestamptz from search_fixture;
insert into public.organizations(id,tenant_id,name,city) select organization_a,tenant_a,'Old Élodie agency','Lyon' from search_fixture;
insert into public.relationships(tenant_id,person_id,organization_id,relationship_type)
  select tenant_a,person_a,organization_a,'partnership' from search_fixture;
insert into public.talent_qualifications(tenant_id,person_id,state,updated_by,updated_by_label)
  select tenant_a,person_a,'draft',reader_a,'Fictitious reader' from search_fixture;
create function pg_temp.assert_search(ok boolean,label text) returns void language plpgsql as $$
  begin if ok is distinct from true then raise exception 'Search assertion failed: %',label; end if; end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub',reader_a::text,true) from search_fixture;
select pg_temp.assert_search((public.atlas_search_people(tenant_a,'elodie')->>'total')::int=1,'accent-insensitive search across old rows') from search_fixture;
select pg_temp.assert_search((public.atlas_search_people(tenant_a,'ecully')->>'total')::int=1,'accent-insensitive city') from search_fixture;
select pg_temp.assert_search((public.atlas_search_people(tenant_a,'%')->>'total')::int=1,'literal percent') from search_fixture;
select pg_temp.assert_search((public.atlas_search_people(tenant_a,'_')->>'total')::int=1,'literal underscore') from search_fixture;
select pg_temp.assert_search((public.atlas_search_people(tenant_a,chr(92))->>'total')::int=1,'literal backslash') from search_fixture;
select pg_temp.assert_search((public.atlas_search_people(tenant_a,'0123456789')->>'total')::int=1,'phone match') from search_fixture;
select pg_temp.assert_search((public.atlas_search_people(tenant_a,'',p_qualification_state=>'draft')->>'total')::int=1,'qualification filter before pagination') from search_fixture;
select pg_temp.assert_search((public.atlas_search_people(tenant_a,'',p_qualification_state=>'none')->>'total')::int=600,'unqualified count beyond API row cap') from search_fixture;
select pg_temp.assert_search(jsonb_array_length(public.atlas_search_people(tenant_a,'elodie',p_page=>2)->'people')=0
  and (public.atlas_search_people(tenant_a,'elodie',p_page=>2)->>'total')::int=1,'empty page retains count') from search_fixture;
select pg_temp.assert_search(exists(select 1 from public.atlas_global_search(tenant_a,'elodie') where category='people' and row_data->>'id'=person_a::text),'global search finds matching contact older than 600 newer rows') from search_fixture;
select pg_temp.assert_search(exists(select 1 from public.atlas_global_search(tenant_a,'elodie') where category='relationships'),'joined relationship search') from search_fixture;
select pg_temp.assert_search((public.atlas_search_people(tenant_b,'elodie')->>'total')::int=0
  and not exists(select 1 from public.atlas_global_search(tenant_b,'elodie')),'cannot search another tenant') from search_fixture;
select pg_temp.assert_search(not has_function_privilege('anon','public.atlas_global_search(uuid,text)','EXECUTE'),'no anonymous RPC access');
select set_config('request.jwt.claim.sub',no_tenant::text,true) from search_fixture;
select pg_temp.assert_search((public.atlas_search_people(tenant_a,'elodie')->>'total')::int=0
  and not exists(select 1 from public.atlas_global_search(tenant_a,'elodie')),'user without membership sees no results') from search_fixture;
rollback;
