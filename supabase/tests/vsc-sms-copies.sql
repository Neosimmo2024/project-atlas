-- Synthetic immutable copy fixtures; always rolled back.
\set ON_ERROR_STOP on
begin;
insert into auth.users(id) values ('11000000-0000-0000-0000-000000000001');
insert into public.tenants(id,name) values ('22000000-0000-0000-0000-000000000001','SMS fixture'),('22000000-0000-0000-0000-000000000002','Other SMS fixture');
insert into public.tenant_users(tenant_id,user_id,role_id)
select '22000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001',id from public.roles where slug='owner';
set local role service_role;
insert into public.vsc_sms_copy_drafts(tenant_id,id,name,start_date,has_email,messages)
select t,'44000000-0000-0000-0000-000000000001','Copy fixture','2026-10-29',false,'[{"stepKey":"sms-reminder","text":"TEST"},{"stepKey":"sms-initial","text":"TEST"},{"stepKey":"sms-followup-1","text":"TEST"},{"stepKey":"sms-followup-2","text":"TEST"},{"stepKey":"sms-followup-3","text":"TEST"}]'::jsonb
from unnest(array['22000000-0000-0000-0000-000000000001','22000000-0000-0000-0000-000000000002']::uuid[]) t;
do $$ begin
  if has_table_privilege('service_role','public.vsc_sms_copy_drafts','UPDATE') or has_table_privilege('service_role','public.vsc_sms_copy_drafts','DELETE') then raise exception 'Copies mutable by service'; end if;
  if has_table_privilege('authenticated','public.vsc_sms_copy_drafts','INSERT') or has_table_privilege('anon','public.vsc_sms_copy_drafts','SELECT') then raise exception 'Copies exposed'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','11000000-0000-0000-0000-000000000001',true);
set local role authenticated;
do $$ begin
  if (select count(*) from public.vsc_sms_copy_drafts) <> 1 then raise exception 'SMS copy RLS isolation failure'; end if;
end $$;
reset role;
update public.tenant_users set status='suspended' where user_id='11000000-0000-0000-0000-000000000001';
set local role authenticated;
do $$ begin
  if exists(select 1 from public.vsc_sms_copy_drafts) then raise exception 'Suspended user can read SMS copies'; end if;
end $$;
reset role;
update public.tenant_users set status='active',role_id=(select id from public.roles where slug='reader') where user_id='11000000-0000-0000-0000-000000000001';
set local role authenticated;
do $$ begin
  if exists(select 1 from public.vsc_sms_copy_drafts) then raise exception 'Non-admin can read SMS copies'; end if;
end $$;
rollback;
