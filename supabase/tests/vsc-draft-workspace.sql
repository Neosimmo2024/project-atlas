-- Synthetic draft preparation, transactionally rolled back.
\set ON_ERROR_STOP on
begin;
insert into public.tenants(id,name) values
('21000000-0000-0000-0000-000000000001','VSC draft fixture'),('21000000-0000-0000-0000-000000000002','Other draft fixture');
insert into public.people(id,tenant_id,display_name,primary_email,contact_allowed,do_not_contact) values
('31000000-0000-0000-0000-000000000001','21000000-0000-0000-0000-000000000001','Eligible fixture','eligible@fixture.invalid',true,false),
('31000000-0000-0000-0000-000000000002','21000000-0000-0000-0000-000000000001','Forbidden fixture','forbidden@fixture.invalid',false,false),
('31000000-0000-0000-0000-000000000003','21000000-0000-0000-0000-000000000002','Foreign fixture','foreign@fixture.invalid',true,false),
('31000000-0000-0000-0000-000000000004','21000000-0000-0000-0000-000000000001','Suppressed fixture','suppressed@fixture.invalid',true,false);
insert into public.vsc_contact_suppressions(tenant_id,person_id,channel) values
('21000000-0000-0000-0000-000000000001','31000000-0000-0000-0000-000000000004','email');
set local role service_role;
do $$
declare result jsonb; rejected boolean := false;
begin
  if (select count(*) from public.vsc_email_draft_contacts('21000000-0000-0000-0000-000000000001')) <> 1 then raise exception 'Eligibility isolation failure'; end if;
  result := public.vsc_create_email_draft('21000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000001','Atomic fixture','2026-10-28',array['31000000-0000-0000-0000-000000000001']::uuid[]);
  if (result->>'submitted')::integer <> 2 or (result->>'reused')::boolean then raise exception 'Initial draft failed'; end if;
  result := public.vsc_create_email_draft('21000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000001','Atomic fixture','2026-10-28',array['31000000-0000-0000-0000-000000000001']::uuid[]);
  if not (result->>'reused')::boolean then raise exception 'Retry duplicated the draft'; end if;
  if (select count(*) from public.vsc_campaign_deliveries where campaign_id='41000000-0000-0000-0000-000000000001' and status='draft' and channel='email') <> 2 then raise exception 'Delivery count/status failure'; end if;
  if exists(select 1 from public.vsc_campaigns where id='41000000-0000-0000-0000-000000000001' and (state<>'draft' or approved_at is not null or enabled_at is not null)) then raise exception 'Draft was approved/enabled'; end if;
  begin
    perform public.vsc_create_email_draft('21000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000002','Foreign fixture','2026-10-28',array['31000000-0000-0000-0000-000000000001','31000000-0000-0000-0000-000000000003']::uuid[]);
  exception when raise_exception then rejected := true; end;
  if not rejected or exists(select 1 from public.vsc_campaigns where id='41000000-0000-0000-0000-000000000002') then raise exception 'Failed draft not rolled back'; end if;
  rejected := false;
  begin
    perform public.vsc_create_email_draft('21000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000001','Atomic fixture','2026-10-29',array['31000000-0000-0000-0000-000000000001']::uuid[]);
  exception when raise_exception then rejected := true; end;
  if not rejected then raise exception 'Existing request contents overwritten'; end if;
end $$;
do $$
declare copy jsonb; rejected boolean := false;
begin
  copy := jsonb_build_object('version',1,'messages',jsonb_build_array(
    jsonb_build_object('stepKey','offer','subject','TEST offer','text','TEST copy'),
    jsonb_build_object('stepKey','consideration','subject','TEST followup','text','TEST copy'),
    jsonb_build_object('stepKey','last-chance','subject','TEST final','text','TEST copy')));
  perform public.vsc_create_email_draft_with_content('21000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000001','Atomic fixture','2026-10-28',array['31000000-0000-0000-0000-000000000001']::uuid[],copy);
  if (select email_content from public.vsc_campaigns where id='41000000-0000-0000-0000-000000000001') is distinct from copy then raise exception 'Copy not persisted'; end if;
  begin
    perform public.vsc_create_email_draft_with_content('21000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000001','Atomic fixture','2026-10-28',array['31000000-0000-0000-0000-000000000001']::uuid[],jsonb_set(copy,'{messages,0,subject}','"Changed"'::jsonb));
  exception when raise_exception then rejected := true; end;
  if not rejected then raise exception 'Saved copy overwritten'; end if;
  rejected := false;
  begin
    perform public.vsc_create_email_draft_with_content('21000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000003','Invalid copy fixture','2026-10-28',array['31000000-0000-0000-0000-000000000001']::uuid[],'{}'::jsonb);
  exception when raise_exception then rejected := true; end;
  if not rejected or exists(select 1 from public.vsc_campaigns where id='41000000-0000-0000-0000-000000000003') then raise exception 'Invalid copy created a campaign'; end if;
end $$;
reset role;
do $$ begin
  if has_function_privilege('anon','public.vsc_create_email_draft(uuid,uuid,text,date,uuid[])','EXECUTE')
    or has_function_privilege('authenticated','public.vsc_create_email_draft(uuid,uuid,text,date,uuid[])','EXECUTE')
    or has_function_privilege('anon','public.vsc_email_draft_contacts(uuid,uuid[])','EXECUTE')
    or has_function_privilege('authenticated','public.vsc_email_draft_contacts(uuid,uuid[])','EXECUTE')
    or has_function_privilege('anon','public.vsc_create_email_draft_with_content(uuid,uuid,text,date,uuid[],jsonb)','EXECUTE')
    or has_function_privilege('authenticated','public.vsc_create_email_draft_with_content(uuid,uuid,text,date,uuid[],jsonb)','EXECUTE')
  then raise exception 'Draft RPC exposed'; end if;
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('vsc_create_email_draft','vsc_email_draft_contacts','vsc_create_email_draft_with_content') and p.prosecdef) then raise exception 'Definer privileges not allowed'; end if;
end $$;
rollback;
