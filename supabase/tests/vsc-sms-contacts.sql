-- Synthetic mobile eligibility only. Every change is rolled back.
\set ON_ERROR_STOP on
begin;
insert into public.tenants(id,name) values ('23000000-0000-0000-0000-000000000001','VSC mobile fixture'),('23000000-0000-0000-0000-000000000002','Other mobile fixture');
insert into public.people(id,tenant_id,display_name,primary_phone,primary_email,contact_allowed,do_not_contact)
select ('33000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'23000000-0000-0000-0000-000000000001','Mobile fixture '||n,phone,email,allowed,blocked
from (values
(1,'06 12 34 56 78','eligible@fixture.invalid',true,false),
(2,'+33612345678',null,true,false),
(3,'01 12 34 56 78',null,true,false),
(4,'06 12 34 56 79',null,false,false),
(5,'07 12 34 56 78',null,true,false),
(6,'0033712345678',null,false,false),
(7,'07 12 34 56 77','emailstop@fixture.invalid',true,false),
(8,'07 12 34 56 76',null,false,true),
(9,'+33712345676',null,true,false),
(10,'07 12 34 56 75',null,true,false),
(11,'+33712345675',null,false,false)) as v(n,phone,email,allowed,blocked);
insert into public.people(id,tenant_id,display_name,primary_phone,contact_allowed) values
('33000000-0000-0000-0000-000000000012','23000000-0000-0000-0000-000000000002','Foreign same mobile','0612345678',true);
insert into public.vsc_contact_suppressions(tenant_id,person_id,channel) values
('23000000-0000-0000-0000-000000000001','33000000-0000-0000-0000-000000000006','sms'),
('23000000-0000-0000-0000-000000000001','33000000-0000-0000-0000-000000000007','email'),
('23000000-0000-0000-0000-000000000002','33000000-0000-0000-0000-000000000012','all');
insert into public.vsc_campaigns(id,tenant_id,name) values ('43000000-0000-0000-0000-000000000001','23000000-0000-0000-0000-000000000001','Reply fixture');
insert into public.vsc_inbound_replies(tenant_id,campaign_id,person_id,provider_message_id,received_at) values
('23000000-0000-0000-0000-000000000001','43000000-0000-0000-0000-000000000001','33000000-0000-0000-0000-000000000011','<mobile-reply@fixture.invalid>',now());
set local role service_role;
do $$
declare phone text;
begin
  foreach phone in array array['06 12 34 56 78','+33 6 12 34 56 78','0033-6-12-34-56-78','(06)12.34.56.78'] loop
    if public.vsc_normalize_fr_mobile(phone) is distinct from '+33612345678' then raise exception 'Mobile normalization failure: %',phone; end if;
  end loop;
  foreach phone in array array['0112345678','+32612345678','061234567','06123456789','0612345678 ext 2','0612345678/0712345678','+33(0)612345678',''] loop
    if public.vsc_normalize_fr_mobile(phone) is not null then raise exception 'Ambiguous mobile accepted'; end if;
  end loop;
  if (select count(*) from public.vsc_sms_draft_contacts('23000000-0000-0000-0000-000000000001'))<>2 then raise exception 'Eligibility/deduplication failure'; end if;
  if not exists(select 1 from public.vsc_sms_draft_contacts('23000000-0000-0000-0000-000000000001') where id='33000000-0000-0000-0000-000000000001' and mobile='+33612345678' and has_email) then raise exception 'Email/mobile preference failure'; end if;
  if not exists(select 1 from public.vsc_sms_draft_contacts('23000000-0000-0000-0000-000000000001') where id='33000000-0000-0000-0000-000000000007' and not has_email) then raise exception 'Email opposition incorrectly excludes SMS'; end if;
  if exists(select 1 from public.vsc_sms_draft_contacts('23000000-0000-0000-0000-000000000002')) then raise exception 'Foreign suppression failure'; end if;
end $$;
reset role;
do $$ begin
  if has_function_privilege('authenticated','public.vsc_sms_draft_contacts(uuid)','EXECUTE') or has_function_privilege('anon','public.vsc_sms_draft_contacts(uuid)','EXECUTE')
    or has_function_privilege('authenticated','public.vsc_normalize_fr_mobile(text)','EXECUTE') then raise exception 'Mobile RPC exposed'; end if;
  if exists(select 1 from pg_proc where proname in ('vsc_sms_draft_contacts','vsc_normalize_fr_mobile') and prosecdef) then raise exception 'Definer function not allowed'; end if;
end $$;
rollback;
