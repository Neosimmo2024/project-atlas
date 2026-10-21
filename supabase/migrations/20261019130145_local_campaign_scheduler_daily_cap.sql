-- Keep campaign overlap and contact restrictions; cap local new contacts at 40/day.
CREATE OR REPLACE FUNCTION public.claim_due_recruitment_email_steps(p_limit integer DEFAULT 25)
 RETURNS SETOF recruitment_email_sequence_steps
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_step public.recruitment_email_sequence_steps;
  v_claimed public.recruitment_email_sequence_steps;
  v_sequence public.recruitment_email_sequences;
  v_person public.people;
  v_attempt_number integer;
  v_guard_reason text;
  v_local_used integer;
  v_paris_now timestamp := now() at time zone 'Europe/Paris';
begin
  for v_step in
    select s.* from public.recruitment_email_sequence_steps s
    where s.status = 'scheduled' and s.scheduled_at <= now()
    order by s.scheduled_at, s.id
    for update of s skip locked
    limit least(greatest(coalesce(p_limit, 25), 1), 100)
  loop
    select * into v_sequence from public.recruitment_email_sequences where id = v_step.sequence_id for update;
    if v_sequence.id is null or v_sequence.status = 'stopped'
       or v_sequence.lifecycle_status in ('stopped', 'completed') then
      update public.recruitment_email_sequence_steps
      set status = 'cancelled', last_error = 'Séquence non exécutable' where id = v_step.id;
      continue;
    end if;

    select * into v_person from public.people where id = v_sequence.person_id;
    if v_person.id is null or not v_person.contact_allowed or v_person.do_not_contact then
      update public.recruitment_email_sequence_steps
      set status = 'cancelled', last_error = 'Contact interdit avant exécution' where id = v_step.id;
      update public.recruitment_email_sequences
      set status = 'stopped', lifecycle_status = 'stopped', next_action_at = null,
          stopped_at = coalesce(stopped_at, now()), stop_reason = 'contact_not_allowed'
      where id = v_sequence.id;
      continue;
    end if;

    v_guard_reason := public.recruitment_campaign_block_reason(
      v_sequence.tenant_id, v_sequence.person_id, v_sequence.email,
      v_sequence.campaign_snapshot->>'project_id', v_sequence.id);
    if v_guard_reason is not null then
      update public.recruitment_email_sequence_steps
      set status = 'error', last_error = 'CAMPAIGN_OVERLAP_BLOCKED: ' || v_guard_reason
      where id = v_step.id;
      update public.recruitment_email_sequences
      set lifecycle_status = 'error', next_action_at = null,
          last_error = 'CAMPAIGN_OVERLAP_BLOCKED: ' || v_guard_reason
      where id = v_sequence.id;
      continue;
    end if;

    -- Reserve capacity with the claim across concurrent workers and in-flight sends.
    if v_step.step_index = 0 and v_sequence.campaign_snapshot->>'key' = 'saint-maur-local-20261016' then
      if extract(isodow from v_paris_now) = 7 or v_paris_now::time < time '09:30' then continue; end if;
      perform pg_advisory_xact_lock(hashtextextended('atlas-local-initial:' || v_sequence.tenant_id::text, 0));
      select count(distinct st.person_id) into v_local_used
      from public.recruitment_email_sequence_steps st
      join public.recruitment_email_sequences seq on seq.id = st.sequence_id
      where seq.tenant_id = v_sequence.tenant_id
        and seq.campaign_snapshot->>'key' = 'saint-maur-local-20261016'
        and st.step_index = 0
        and (
          (st.sent_at at time zone 'Europe/Paris')::date = v_paris_now::date
          or (st.status = 'processing' and (st.claimed_at at time zone 'Europe/Paris')::date = v_paris_now::date)
          or exists (
            select 1 from public.recruitment_email_sequence_attempts a
            where a.step_id = st.id and (a.claimed_at at time zone 'Europe/Paris')::date = v_paris_now::date
              and a.status in ('processing','sent')
          )
        );
      if v_local_used >= 40 then continue; end if;
    end if;

    update public.recruitment_email_sequence_steps
    set status = 'processing', claimed_at = now(), last_error = null
    where id = v_step.id returning * into v_claimed;

    select coalesce(max(attempt_number), 0) + 1 into v_attempt_number
    from public.recruitment_email_sequence_attempts where step_id = v_step.id;

    insert into public.recruitment_email_sequence_attempts (
      tenant_id, sequence_id, step_id, person_id, attempt_number, status,
      claimed_at, idempotency_key
    ) values (
      v_step.tenant_id, v_step.sequence_id, v_step.id, v_step.person_id,
      v_attempt_number, 'processing', now(),
      'recruitment-email-attempt:' || v_step.id::text || ':' || v_attempt_number::text
    );

    update public.recruitment_email_sequences
    set lifecycle_status = 'running', current_step = v_step.step_index,
        next_action_at = null, last_attempt_at = now(), attempt_count = attempt_count + 1
    where id = v_sequence.id;

    return next v_claimed;
  end loop;
  return;
end;
$function$;

revoke all on function public.claim_due_recruitment_email_steps(integer) from public,anon,authenticated;
grant execute on function public.claim_due_recruitment_email_steps(integer) to service_role;

