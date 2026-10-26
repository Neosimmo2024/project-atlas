\set ON_ERROR_STOP on
-- Usage: psql -v tenant_id=... -v member_id=... -v other_tenant_id=... -v single_tenant_member_id=... -f scripts/validate-people-search-performance.sql
-- Read-only assertions on existing data. No fixtures or outbound operations.
begin;
-- Budget covers several RPCs in one assertion block, not a production timeout change.
set local statement_timeout='45s';
select set_config('request.jwt.claim.sub', :'member_id', true);
select set_config('atlas.test_tenant', :'tenant_id', true);
select set_config('atlas.test_other_tenant', :'other_tenant_id', true);
set local role authenticated;
do $$
declare t uuid:=current_setting('atlas.test_tenant')::uuid; a jsonb; b jsonb; q text; expected bigint;
begin
 a:=public.atlas_people_directory_affiliations(t);
 select count(*) into expected from public.people where tenant_id=t;
 if (a->>'total')::bigint<>expected then raise exception 'Incomplete directory'; end if;
 b:=public.atlas_people_directory_affiliations(t,p_page=>2);
 if (b->>'total')::bigint<>expected then raise exception 'Pagination count changed'; end if;
 if exists(select 1 from jsonb_array_elements(a->'people') x join jsonb_array_elements(b->'people') y on x->>'id'=y->>'id') then raise exception 'Pages overlap'; end if;
 foreach q in array array['Ringot','Cintrat','Nawel'] loop
  a:=public.atlas_people_directory_affiliations(t,q);
  if (a->>'total')::int=0 then raise exception 'Missing named directory result: %',q; end if;
  if not exists(select 1 from public.atlas_global_search(t,q) where category='people') then raise exception 'Missing global result: %',q; end if;
 end loop;
 if has_function_privilege('anon','public.atlas_global_search(uuid,text)','execute') or has_function_privilege('anon','public.atlas_people_directory_affiliations(uuid,text,text,text,text,text,integer,integer,text)','execute') then raise exception 'Anonymous access'; end if;
end $$;
select set_config('request.jwt.claim.sub', :'single_tenant_member_id',true);
do $$
declare t uuid:=current_setting('atlas.test_other_tenant')::uuid;
begin
 if public.is_tenant_member(t) then raise exception 'Test requires a nonmember of the other tenant'; end if;
 begin perform public.atlas_people_directory_affiliations(t); raise exception 'Cross-tenant directory access'; exception when insufficient_privilege then null; end;
 if exists(select 1 from public.atlas_global_search(t,'Ringot')) then raise exception 'Cross-tenant global access'; end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
do $$ begin
 if exists(select 1 from public.people) or exists(select 1 from public.organizations) or exists(select 1 from public.relationships) or exists(select 1 from public.projects) or exists(select 1 from public.tasks) or exists(select 1 from public.interactions) then raise exception 'Nonmember access'; end if;
end $$;
rollback;
