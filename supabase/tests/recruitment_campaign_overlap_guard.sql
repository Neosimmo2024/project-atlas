-- Transactional integration test. No provider call; all fixtures roll back.
begin;
do $$
declare
  v_project public.projects;
  v_person public.people;
  v_owner uuid;
  v_alias uuid := gen_random_uuid();
  v_plain uuid := gen_random_uuid();
  v_duplicate uuid := gen_random_uuid();
  v_seq uuid := gen_random_uuid();
  v_legacy uuid := gen_random_uuid();
  v_step uuid := gen_random_uuid();
  v_plain_step uuid := gen_random_uuid();
  v_claimed uuid[];
  v_reason text;
  v_blocked boolean;
  v_count integer;
begin
  select * into strict v_project from public.projects
    where metadata ? 'lyon_development' and status = 'open' and archived_at is null order by id limit 1;
  select * into strict v_person from public.people
    where id::text = v_project.metadata->'recruitment_email_campaign'->'recipient_ids'->>0;
  select id into strict v_owner from auth.users order by created_at limit 1;

  select count(*) into v_count from public.people p
    where p.tenant_id = v_project.tenant_id
      and v_project.metadata->'lyon_development'->'person_ids' ? p.id::text
      and public.recruitment_campaign_block_reason(p.tenant_id,p.id,coalesce(p.primary_email,'missing@example.test'),null,null) = 'TARGETED_CAMPAIGN_RESERVED';
  assert v_count = jsonb_array_length(v_project.metadata->'lyon_development'->'person_ids'), 'All Lyon profiles must be reserved';
  assert public.recruitment_campaign_block_reason(v_person.tenant_id,v_person.id,v_person.primary_email,v_project.id::text,null) = 'TARGETED_CAMPAIGN_NOT_AUTHORIZED', 'Draft launch must remain blocked';
  assert not has_function_privilege('anon','public.recruitment_campaign_block_reason(uuid,uuid,text,text,uuid)','EXECUTE'), 'No anon access';
  assert not has_function_privilege('authenticated','public.recruitment_campaign_block_reason(uuid,uuid,text,text,uuid)','EXECUTE'), 'No user RPC exposing cross-person data';
  assert has_function_privilege('service_role','public.recruitment_campaign_block_reason(uuid,uuid,text,text,uuid)','EXECUTE'), 'Internal service access';

  insert into public.people (id,tenant_id,display_name,primary_email,contact_allowed)
    values (v_alias,v_person.tenant_id,'Overlap test alias',' ' || upper(v_person.primary_email) || ' ',true),
      (v_plain,v_person.tenant_id,'Overlap test normal',v_plain::text || '@example.test',true),
      (v_duplicate,v_person.tenant_id,'Overlap test duplicate',' ' || upper(v_plain::text || '@example.test') || ' ',true);
  assert public.recruitment_campaign_block_reason(v_person.tenant_id,v_alias,'  ' || upper(v_person.primary_email) || '  ',null,null) = 'TARGETED_CAMPAIGN_RESERVED', 'Case and whitespace alias must be reserved';
  assert public.recruitment_campaign_block_reason(v_person.tenant_id,v_plain,v_plain::text || '@example.test',null,null) is null, 'Unrelated national contact remains available';
  assert public.recruitment_campaign_block_reason(gen_random_uuid(),v_alias,v_person.primary_email,null,null) = 'PERSON_NOT_FOUND', 'Tenant isolation';

  v_blocked := false;
  begin
    insert into public.recruitment_email_sequences (tenant_id,person_id,email,created_by,updated_by)
      values (v_person.tenant_id,v_alias,v_person.primary_email,v_owner,v_owner);
  exception when sqlstate 'P0001' then
    if sqlerrm not like 'CAMPAIGN_OVERLAP_BLOCKED:%' then raise; end if;
    v_blocked := true;
  end;
  assert v_blocked, 'Initial claim trigger must block a national alias before queue creation';

  insert into public.recruitment_email_sequences (id,tenant_id,person_id,email,created_by,updated_by)
    values (v_seq,v_person.tenant_id,v_plain,v_plain::text || '@example.test',v_owner,v_owner);
  perform set_config('request.jwt.claim.sub',v_owner::text,true);
  perform public.claim_initial_recruitment_email(v_plain);
  assert (select count(*) from public.recruitment_email_sequences where tenant_id=v_person.tenant_id and person_id=v_plain) = 1, 'Same-person pending replay keeps one sequence';
  v_blocked := false;
  begin
    insert into public.recruitment_email_sequences (tenant_id,person_id,email,created_by,updated_by)
      values (v_person.tenant_id,v_duplicate,upper(v_plain::text || '@example.test'),v_owner,v_owner);
  exception when sqlstate 'P0001' then
    if sqlerrm not like 'CAMPAIGN_OVERLAP_BLOCKED: OTHER_EMAIL_SEQUENCE%' then raise; end if;
    v_blocked := true;
  end;
  assert v_blocked, 'Two national aliases cannot claim the same mailbox';

  -- Legacy queued national follow-up for a reserved mailbox must never be returned.
  insert into public.recruitment_email_sequences (id,tenant_id,person_id,email,status,lifecycle_status,sent_at,created_by,updated_by)
    values (v_legacy,v_person.tenant_id,v_alias,v_person.primary_email,'sent','scheduled',now()-interval '20 days',v_owner,v_owner);
  insert into public.recruitment_email_sequence_steps (id,tenant_id,sequence_id,person_id,step_index,step_key,status,scheduled_at,idempotency_key)
    values (v_step,v_person.tenant_id,v_legacy,v_alias,1,'follow_up_1','scheduled',now()-interval '1 day',v_step::text);
  update public.recruitment_email_sequences set status='sent',sent_at=now()-interval '20 days',lifecycle_status='scheduled' where id=v_seq;
  insert into public.recruitment_email_sequence_steps (id,tenant_id,sequence_id,person_id,step_index,step_key,status,scheduled_at,idempotency_key)
    values (v_plain_step,v_person.tenant_id,v_seq,v_plain,1,'follow_up_1','scheduled',now()-interval '1 day',v_plain_step::text);
  select array_agg(id) into v_claimed from public.claim_due_recruitment_email_steps(100);
  assert not coalesce(v_step = any(v_claimed),false), 'Blocked follow-up must not reach the provider worker';
  assert coalesce(v_plain_step = any(v_claimed),false), 'Unrelated follow-up still works in the same batch';
  select last_error into v_reason from public.recruitment_email_sequence_steps where id=v_step;
  assert v_reason = 'CAMPAIGN_OVERLAP_BLOCKED: TARGETED_CAMPAIGN_RESERVED', 'Block reason must be recorded';

  -- Stopping/completing a sent sequence does not erase historical duplicate evidence.
  update public.recruitment_email_sequences set status='stopped',lifecycle_status='stopped' where id=v_seq;
  assert public.recruitment_campaign_block_reason(v_person.tenant_id,v_duplicate,v_plain::text || '@example.test',null,null) = 'OTHER_EMAIL_SEQUENCE', 'Historical send remains protected';

  select * into strict v_person from public.people where id::text = v_project.metadata->'recruitment_email_campaign'->'recipient_ids'->>1;
  update public.projects set metadata=jsonb_set(metadata,'{recruitment_email_campaign,launch_enabled}','true') where id=v_project.id;
  assert public.recruitment_campaign_block_reason(v_person.tenant_id,v_person.id,v_person.primary_email,v_project.id::text,null) is null, 'Explicitly authorized targeted campaign keeps its own recipients';
end;
$$;
select 'PASS: reservations, aliases, initial claims, queued follow-ups, unrelated batch, history, tenant isolation, privileges and explicit launch; no email sent; fixtures rolled back' as result;
rollback;
