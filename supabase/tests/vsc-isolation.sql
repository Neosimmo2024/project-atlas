-- Synthetic fixtures only. The entire scenario is rolled back.
\set ON_ERROR_STOP on
begin;
insert into auth.users(id) values ('10000000-0000-0000-0000-000000000001'), ('10000000-0000-0000-0000-000000000002');
insert into public.tenants(id,name) values ('20000000-0000-0000-0000-000000000001','VSC synthetic'), ('20000000-0000-0000-0000-000000000002','NEOS synthetic');
insert into public.tenant_users(tenant_id,user_id,role_id)
select '20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',id from public.roles where slug='owner';
insert into public.tenant_users(tenant_id,user_id,role_id)
select '20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002',id from public.roles where slug='owner';
insert into public.people(id,tenant_id,display_name) values
('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','VSC fixture'),
('30000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','NEOS fixture');
insert into public.vsc_campaigns(id,tenant_id,name) values
('40000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','VSC fixture'),
('40000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','NEOS fixture');
insert into public.vsc_campaign_deliveries(tenant_id,campaign_id,person_id,channel,step_key,scheduled_at,status)
select '20000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','email',s,now(),s
from unnest(array['draft','scheduled','sent','claimed']) s;
insert into public.vsc_campaign_deliveries(tenant_id,campaign_id,person_id,channel,step_key,scheduled_at,status)
values ('20000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000002','email','scheduled',now(),'scheduled');
do $$ begin
  begin
    insert into public.vsc_campaign_deliveries(tenant_id,campaign_id,person_id,channel,step_key,scheduled_at)
    values ('20000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','email','cross-tenant',now());
    raise exception 'Cross-tenant campaign accepted';
  exception when foreign_key_violation then null; end;
  begin
    insert into public.vsc_campaign_deliveries(tenant_id,campaign_id,person_id,channel,step_key,scheduled_at)
    values ('20000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002','email','cross-person',now());
    raise exception 'Cross-tenant person accepted';
  exception when foreign_key_violation then null; end;
end $$;
set local role service_role;
do $$ begin
  if not public.vsc_record_verified_reply('20000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','<reply@fixture.invalid>',now()) then raise exception 'Reply not recorded'; end if;
  if public.vsc_record_verified_reply('20000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','<reply@fixture.invalid>',now()) then raise exception 'Duplicate not idempotent'; end if;
  if (select count(*) from public.vsc_campaign_deliveries where tenant_id='20000000-0000-0000-0000-000000000001' and status='cancelled') <> 2 then raise exception 'Pending work not cancelled'; end if;
  if (select count(*) from public.vsc_campaign_deliveries where tenant_id='20000000-0000-0000-0000-000000000002' and status='scheduled') <> 1 then raise exception 'Other tenant modified'; end if;
  if (select count(*) from public.vsc_campaign_deliveries where tenant_id='20000000-0000-0000-0000-000000000001' and status in ('sent','claimed')) <> 2 then raise exception 'Historical/in-flight work modified'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
set local role authenticated;
do $$ begin
  if (select count(*) from public.vsc_campaigns) <> 1 then raise exception 'Campaign RLS failure'; end if;
  if (select count(*) from public.vsc_campaign_deliveries) <> 4 then raise exception 'Delivery RLS failure'; end if;
  if (select count(*) from public.vsc_inbound_replies) <> 1 then raise exception 'Reply RLS failure'; end if;
  begin
    perform public.vsc_record_verified_reply('20000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','<forbidden@fixture.invalid>',now());
    raise exception 'Authenticated RPC call accepted';
  exception when insufficient_privilege then null; end;
  begin
    update public.vsc_campaigns set state='active';
    raise exception 'Authenticated activation accepted';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
update public.tenant_users set status='suspended' where user_id='10000000-0000-0000-0000-000000000001';
set local role authenticated;
do $$ begin
  if exists(select 1 from public.vsc_campaigns) or exists(select 1 from public.vsc_campaign_deliveries) or exists(select 1 from public.vsc_inbound_replies) then raise exception 'Suspended member retains access'; end if;
end $$;
reset role;
rollback;
