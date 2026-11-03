begin;
do $$
declare tenant uuid; project uuid; person uuid; campaign uuid; recipient uuid; message uuid; claimed_count int;
begin
 select tenant_id,id into tenant,project from public.projects where id='df6dce4c-f4dd-41b3-b1e2-1e9fd924c4dc';
 if tenant is null then raise exception 'LFI project missing'; end if;
 insert into public.people(tenant_id,display_name,primary_email,postal_code,contact_allowed,status)
 values(tenant,'LFI transaction-only test',gen_random_uuid()::text||'@example.invalid','94100',true,'qualified') returning id into person;
 insert into public.lfi_campaigns(tenant_id,project_id) values(tenant,project) returning id into campaign;
 insert into public.lfi_recipients(tenant_id,campaign_id,person_id,email,unsubscribe_token)
 select tenant,campaign,person,primary_email,repeat('a',64) from public.people where id=person returning id into recipient;
 insert into public.lfi_outbox(tenant_id,recipient_id,step,due_at,subject,body_text,message_id)
 values(tenant,recipient,1,now(),'Test only','No mail sent',gen_random_uuid()::text) returning id into message;
 select count(*) into claimed_count from public.lfi_claim_next(tenant,project);
 if claimed_count<>0 then raise exception 'Draft campaign must block sends'; end if;
 update public.lfi_campaigns set status='active' where id=campaign;
 select count(*) into claimed_count from public.lfi_claim_next(tenant,project);
 if claimed_count<>0 then raise exception 'Missing mailbox check must block'; end if;
 update public.lfi_campaigns set mailbox_checked_at=now() where id=campaign;
 update public.people set status='rejected' where id=person;
 select count(*) into claimed_count from public.lfi_claim_next(tenant,project);
 if claimed_count<>0 then raise exception 'Rejected contact must block'; end if;
 update public.people set status='qualified' where id=person;
 select count(*) into claimed_count from public.lfi_claim_next(tenant,project);
 if claimed_count<>1 then raise exception 'Eligible recipient should claim exactly once'; end if;
 select count(*) into claimed_count from public.lfi_claim_next(tenant,project);
 if claimed_count<>0 then raise exception 'No duplicate claim'; end if;
 insert into public.lfi_outbox(tenant_id,recipient_id,step,due_at,subject,body_text,message_id)
 values(tenant,recipient,2,now(),'Follow-up','No mail sent',gen_random_uuid()::text);
 perform public.lfi_stop_recipient(tenant,(select email from public.lfi_recipients where id=recipient),'unsubscribed');
 if exists(select 1 from public.lfi_outbox where recipient_id=recipient and status='queued') then raise exception 'Unsubscribe must cancel queued followups'; end if;
 if not exists(select 1 from public.lfi_outbox where id=message and status='claimed') then raise exception 'An ambiguous claim must not be requeued'; end if;
 if has_table_privilege('anon','public.lfi_outbox','SELECT') or has_function_privilege('authenticated','public.lfi_claim_next(uuid,uuid)','EXECUTE') then raise exception 'Server-only grants violated'; end if;
end $$;
rollback;
select 'LFI queue checks passed; all test records rolled back' as result;
