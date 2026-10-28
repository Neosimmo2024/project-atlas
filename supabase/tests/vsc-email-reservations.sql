-- Disposable fixtures; no provider calls. Entire test is rolled back.
\set ON_ERROR_STOP on
begin;
insert into auth.users(id) values ('11000000-0000-0000-0000-000000000001');
insert into public.tenants(id,name) values ('22000000-0000-0000-0000-000000000001','VSC reservation fixture');
insert into public.people(id,tenant_id,display_name,primary_email,contact_allowed,do_not_contact)
values('32000000-0000-0000-0000-000000000001','22000000-0000-0000-0000-000000000001','Reservation fixture','reservation@fixture.invalid',true,false);
insert into public.vsc_campaigns(id,tenant_id,name,state,approved_by,approved_at,enabled_at,email_content)
values('42000000-0000-0000-0000-000000000001','22000000-0000-0000-0000-000000000001','Reservation fixture','active','11000000-0000-0000-0000-000000000001',now(),now(),
jsonb_build_object('version',1,'messages',jsonb_build_array(
jsonb_build_object('stepKey','offer','subject','Fixture email','text','TEST only'),
jsonb_build_object('stepKey','consideration','subject','Fixture email','text','TEST only'),
jsonb_build_object('stepKey','last-chance','subject','Fixture email','text','TEST only'))));
insert into public.vsc_campaign_deliveries(id,tenant_id,campaign_id,person_id,channel,step_key,scheduled_at,status)
values('52000000-0000-0000-0000-000000000001','22000000-0000-0000-0000-000000000001','42000000-0000-0000-0000-000000000001','32000000-0000-0000-0000-000000000001','email','offer',now()-interval '1 minute','scheduled'),
('52000000-0000-0000-0000-000000000002','22000000-0000-0000-0000-000000000001','42000000-0000-0000-0000-000000000001','32000000-0000-0000-0000-000000000001','email','consideration',now()-interval '1 minute','scheduled'),
('52000000-0000-0000-0000-000000000003','22000000-0000-0000-0000-000000000001','42000000-0000-0000-0000-000000000001','32000000-0000-0000-0000-000000000001','email','last-chance',now()-interval '1 minute','scheduled');
set local role service_role;
do $$
declare reservation jsonb; payload jsonb; token uuid; old_token uuid; rejected boolean := false;
begin
  if public.vsc_reserve_email_delivery('22000000-0000-0000-0000-000000000002','52000000-0000-0000-0000-000000000001') is not null then raise exception 'Foreign tenant reserved delivery'; end if;
  if (current_timestamp at time zone 'Europe/Paris')::date>date '2026-11-30' then
    if public.vsc_reserve_email_delivery('22000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000001') is not null then raise exception 'Expired offer reserved'; end if;
    return;
  end if;
  reservation := public.vsc_reserve_email_delivery('22000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000001');
  if reservation is null then raise exception 'Eligible reservation missing'; end if;
  token := (reservation->>'claimToken')::uuid;
  if public.vsc_reserve_email_delivery('22000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000001') is not null then raise exception 'Duplicate reservation'; end if;
  if public.vsc_begin_email_dispatch('22000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000001','62000000-0000-0000-0000-000000000001') is not null then raise exception 'Wrong token accepted'; end if;
  payload := public.vsc_begin_email_dispatch('22000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000001',token);
  if payload is null then raise exception 'Eligible start missing'; end if;
  if public.vsc_begin_email_dispatch('22000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000001',token) is not null then raise exception 'Second start accepted'; end if;
  if public.vsc_release_email_reservation('22000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000001',token) then raise exception 'Started dispatch released'; end if;
  perform public.vsc_record_email_dispatch_result('22000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000001',token,'sent',payload->>'messageId');
  perform public.vsc_record_email_dispatch_result('22000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000001',token,'sent',payload->>'messageId');
  if not exists(select 1 from public.vsc_campaign_deliveries where id='52000000-0000-0000-0000-000000000001' and status='sent' and provider_message_id=payload->>'messageId' and sent_at is not null) then raise exception 'Sent result not persisted'; end if;

  reservation := public.vsc_reserve_email_delivery('22000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000002'); token := (reservation->>'claimToken')::uuid;
  if not public.vsc_release_email_reservation('22000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000002',token) then raise exception 'Unstarted reservation not released'; end if;
  old_token := token;
  reservation := public.vsc_reserve_email_delivery('22000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000002'); token := (reservation->>'claimToken')::uuid;
  if token is null or token=old_token then raise exception 'Reservation token reused'; end if;
  if public.vsc_begin_email_dispatch('22000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000002',old_token) is not null then raise exception 'Old token accepted'; end if;
  perform public.vsc_begin_email_dispatch('22000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000002',token);
  perform public.vsc_record_email_dispatch_result('22000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000002',token,'unknown');
  if public.vsc_release_email_reservation('22000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000002',token) then raise exception 'Unknown result released'; end if;
  begin
    perform public.vsc_record_email_dispatch_result('22000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000002',token,'rejected');
  exception when raise_exception then rejected := true; end;
  if not rejected then raise exception 'Unknown result reset without review'; end if;

  reservation := public.vsc_reserve_email_delivery('22000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000003'); token := (reservation->>'claimToken')::uuid;
  update public.people set contact_allowed=false where id='32000000-0000-0000-0000-000000000001' and tenant_id='22000000-0000-0000-0000-000000000001';
  if public.vsc_begin_email_dispatch('22000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000003',token) is not null then raise exception 'Revoked contact started'; end if;
  if not exists(select 1 from public.vsc_campaign_deliveries where id='52000000-0000-0000-0000-000000000003' and status='cancelled') then raise exception 'Revoked attempt not cancelled'; end if;
end $$;
reset role;
do $$
declare signature text;
begin
  if has_column_privilege('authenticated','public.vsc_campaign_deliveries','claim_token','SELECT')
    or has_column_privilege('authenticated','public.vsc_campaign_deliveries','dispatch_payload','SELECT')
    or not has_column_privilege('authenticated','public.vsc_campaign_deliveries','status','SELECT')
  then raise exception 'Reservation credentials exposed or existing status access lost'; end if;
  foreach signature in array array['public.vsc_email_dispatch_payload(uuid,uuid)','public.vsc_reserve_email_delivery(uuid,uuid)','public.vsc_begin_email_dispatch(uuid,uuid,uuid)','public.vsc_release_email_reservation(uuid,uuid,uuid)','public.vsc_record_email_dispatch_result(uuid,uuid,uuid,text,text)'] loop
    if has_function_privilege('anon',signature,'EXECUTE') or has_function_privilege('authenticated',signature,'EXECUTE') or not has_function_privilege('service_role',signature,'EXECUTE') then raise exception 'Invalid reservation RPC grants: %',signature; end if;
  end loop;
end $$;
rollback;
