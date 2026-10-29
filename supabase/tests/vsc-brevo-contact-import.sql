-- Synthetic fixtures only; all writes rolled back, no provider accessed.
\set ON_ERROR_STOP on
begin;
insert into public.tenants(id,name) values ('24000000-0000-0000-0000-000000000001','Import VSC fixture'),('24000000-0000-0000-0000-000000000002','Other import fixture');
insert into auth.users(id,email) values ('14000000-0000-0000-0000-000000000001','import-admin@fixture.invalid'),('14000000-0000-0000-0000-000000000002','import-other@fixture.invalid');
insert into public.tenant_users(tenant_id,user_id,role_id) select '24000000-0000-0000-0000-000000000001','14000000-0000-0000-0000-000000000001',id from public.roles where slug='owner';
insert into public.tenant_users(tenant_id,user_id,role_id) select '24000000-0000-0000-0000-000000000002','14000000-0000-0000-0000-000000000002',id from public.roles where slug='owner';
insert into public.people(id,tenant_id,display_name,primary_email,primary_phone,contact_allowed) values
('34000000-0000-0000-0000-000000000009','24000000-0000-0000-0000-000000000002','Foreign untouched','shop@fixture.invalid','+33612345678',false),
('34000000-0000-0000-0000-000000000008','24000000-0000-0000-0000-000000000001','Existing refusal','refused@fixture.invalid',null,false);
set local role service_role;
do $$
declare
 t uuid:='24000000-0000-0000-0000-000000000001'; actor uuid:='14000000-0000-0000-0000-000000000001';
 g jsonb:='{"person_id":"34000000-0000-0000-0000-000000000001","source_ids":[1],"display_name":"Shop fixture","email":"shop@fixture.invalid","phone":"+33612345678","email_blocked":false,"sms_blocked":true,"do_not_contact":false,"source_lists":[4],"identity_snapshot":{"emails":["shop@fixture.invalid"],"phones":["+33612345678"]},"source_records":[{"source_id":1,"email_blocked":false,"sms_blocked":true}],"conflict":false}'::jsonb;
 r jsonb; p uuid; v text;
begin
 foreach v in array array['06 12 34 56 78','33612345678','0033612345678','+33612345678'] loop
  if public.vsc_import_normalize_phone(v) is distinct from '+33612345678' then raise exception 'Phone normalization failed'; end if;
 end loop;
 foreach v in array array['+33(0)612345678','+3361234567','0612345678/0712345678','invalid'] loop
  if public.vsc_import_normalize_phone(v) is not null then raise exception 'Ambiguous phone accepted'; end if;
 end loop;
 if public.vsc_import_normalize_phone('33988460814') is distinct from '+33988460814' then raise exception 'Landline lost'; end if;
 begin
  perform public.vsc_import_brevo_contacts(t,'14000000-0000-0000-0000-000000000002',jsonb_build_array(g));
  raise exception 'Unauthorized actor accepted';
 exception when raise_exception then if sqlerrm='Unauthorized actor accepted' then raise; end if; end;
 r:=public.vsc_import_brevo_contacts(t,actor,jsonb_build_array(g));
 if (r->>'created')::int<>1 then raise exception 'Create failed: %',r; end if;
 p:=(g->>'person_id')::uuid;
 if not exists(select 1 from public.people where tenant_id=t and id=p and contact_allowed and not do_not_contact) then raise exception 'New email permission incorrect'; end if;
 if not exists(select 1 from public.vsc_contact_suppressions where tenant_id=t and person_id=p and channel='sms') then raise exception 'SMS exclusion lost'; end if;
 if not exists(select 1 from public.vsc_brevo_contact_links where tenant_id=t and provider_id=1 and source_status_snapshot->>'sms_blocked'='true') then raise exception 'Source provenance lost'; end if;
 r:=public.vsc_import_brevo_contacts(t,actor,jsonb_build_array(g));
 if (r->>'created')::int<>0 or (r->>'matched')::int<>1 then raise exception 'Retry duplicated'; end if;
 -- Changing provider status never removes a previous opposition.
 g:=jsonb_set(g,'{sms_blocked}','false');
 perform public.vsc_import_brevo_contacts(t,actor,jsonb_build_array(g));
 if not exists(select 1 from public.vsc_contact_suppressions where tenant_id=t and person_id=p and channel='sms') or not exists(select 1 from public.vsc_brevo_contact_links where tenant_id=t and provider_id=1 and sms_blocked) then raise exception 'Opposition reactivated'; end if;
 -- Global source opposition cancels queued work only in the same tenant.
 insert into public.vsc_campaigns(id,tenant_id,name) values('44000000-0000-0000-0000-000000000001',t,'Cancellation fixture');
 insert into public.vsc_campaign_deliveries(tenant_id,campaign_id,person_id,channel,step_key,scheduled_at) values(t,'44000000-0000-0000-0000-000000000001',p,'email','offer',now());
 g:=jsonb_set(g,'{do_not_contact}','true');r:=public.vsc_import_brevo_contacts(t,actor,jsonb_build_array(g));
 if (r->>'cancelled')::int<>1 or not exists(select 1 from public.people where tenant_id=t and id=p and do_not_contact) then raise exception 'Global stop/cancellation failed'; end if;
 g:=jsonb_set(g,'{do_not_contact}','false');perform public.vsc_import_brevo_contacts(t,actor,jsonb_build_array(g));
 if not exists(select 1 from public.people where tenant_id=t and id=p and do_not_contact) then raise exception 'Global stop removed'; end if;
 -- Existing Atlas refused permission is never lifted by provider subscription.
 g:=g||'{"source_ids":[2],"person_id":"34000000-0000-0000-0000-000000000002","email":"refused@fixture.invalid","phone":null,"identity_snapshot":{"emails":["refused@fixture.invalid"],"phones":[]},"source_records":[{"source_id":2}]}'::jsonb;
 r:=public.vsc_import_brevo_contacts(t,actor,jsonb_build_array(g));
 if (r->>'matched')::int<>1 or exists(select 1 from public.people where tenant_id=t and primary_email='refused@fixture.invalid' and contact_allowed) then raise exception 'Existing refusal lifted'; end if;
 -- Conflicts and empty coordinates are staged, without empty/contradictory person creation.
 g:=g||'{"source_ids":[3],"conflict":true,"identity_snapshot":{"emails":["a@fixture.invalid","b@fixture.invalid"],"phones":[]},"email":null,"source_records":[{"source_id":3}]}'::jsonb;
 r:=public.vsc_import_brevo_contacts(t,actor,jsonb_build_array(g));if (r->>'conflicts')::int<>1 then raise exception 'Conflict not staged'; end if;
 g:=g||'{"source_ids":[4],"conflict":false,"identity_snapshot":{"emails":[],"phones":[]},"source_records":[{"source_id":4}]}'::jsonb;
 r:=public.vsc_import_brevo_contacts(t,actor,jsonb_build_array(g));if (r->>'withoutCoordinates')::int<>1 then raise exception 'Empty source not staged'; end if;
 if (select count(*) from public.people where tenant_id=t)<>2 then raise exception 'Unexpected person created'; end if;
 if not exists(select 1 from public.people where tenant_id='24000000-0000-0000-0000-000000000002' and not contact_allowed and not do_not_contact and primary_phone='+33612345678') then raise exception 'Foreign person mutated'; end if;
 if exists(select 1 from public.vsc_contact_suppressions where tenant_id='24000000-0000-0000-0000-000000000002') then raise exception 'Foreign suppression created'; end if;
 if (select count(*) from public.vsc_campaigns where tenant_id=t)<>1 or (select count(*) from public.vsc_campaign_deliveries where tenant_id=t)<>1 then raise exception 'Import created campaign/delivery'; end if;
end $$;
reset role;
do $$ begin
 if has_function_privilege('authenticated','public.vsc_import_brevo_contacts(uuid,uuid,jsonb)','EXECUTE') or has_function_privilege('anon','public.vsc_import_brevo_contacts(uuid,uuid,jsonb)','EXECUTE') then raise exception 'Import RPC exposed'; end if;
 if has_table_privilege('authenticated','public.vsc_brevo_contact_links','INSERT') or has_table_privilege('service_role','public.vsc_brevo_contact_links','DELETE') then raise exception 'Excessive grants'; end if;
 if exists(select 1 from pg_proc where proname in ('vsc_import_brevo_contacts','vsc_import_normalize_phone') and prosecdef) then raise exception 'Definer function forbidden'; end if;
 if not exists(select 1 from pg_class where oid='public.vsc_brevo_contact_links'::regclass and relrowsecurity) then raise exception 'RLS missing'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','14000000-0000-0000-0000-000000000001',true);
do $$ begin if (select count(*) from public.vsc_brevo_contact_links)<>4 then raise exception 'Owner read policy failed'; end if; end $$;
select set_config('request.jwt.claim.sub','14000000-0000-0000-0000-000000000002',true);
do $$ begin if exists(select 1 from public.vsc_brevo_contact_links) then raise exception 'Foreign owner sees source identities'; end if; end $$;
reset role;
rollback;
