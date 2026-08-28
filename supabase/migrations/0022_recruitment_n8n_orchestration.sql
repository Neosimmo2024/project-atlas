-- Lot 9B — Recruitment follow-up orchestration primitives.
-- Atlas remains the source of truth. n8n only triggers server-side workers.

create or replace function public.prepare_recruitment_email_follow_ups(p_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sequence public.recruitment_email_sequences;
  v_person public.people;
  v_step_1 public.recruitment_email_sequence_steps;
  v_step_2 public.recruitment_email_sequence_steps;
  v_due_at timestamptz;
  v_scheduled_count integer := 0;
  v_stopped_count integer := 0;
begin
  for v_sequence in
    select s.*
    from public.recruitment_email_sequences s
    where s.status = 'sent'
      and s.sent_at is not null
      and s.lifecycle_status not in ('stopped', 'completed')
    order by s.sent_at, s.id
    for update skip locked
    limit least(greatest(coalesce(p_limit, 100), 1), 500)
  loop
    select * into v_person
    from public.people
    where id = v_sequence.person_id;

    if v_person.id is null or not v_person.contact_allowed or v_person.do_not_contact then
      update public.recruitment_email_sequences
      set status = 'stopped',
          lifecycle_status = 'stopped',
          next_action_at = null,
          stopped_at = coalesce(stopped_at, now()),
          stop_reason = 'contact_not_allowed'
      where id = v_sequence.id;

      update public.recruitment_email_sequence_steps
      set status = 'cancelled',
          last_error = coalesce(last_error, 'Contact interdit avant planification')
      where sequence_id = v_sequence.id
        and status in ('scheduled', 'processing');

      update public.recruitment_email_sequence_attempts
      set status = 'cancelled',
          completed_at = coalesce(completed_at, now()),
          error_message = coalesce(error_message, 'Contact interdit avant planification')
      where sequence_id = v_sequence.id
        and status = 'processing';

      insert into public.timeline_events (
        tenant_id, event_type, title, description, occurred_at, created_by,
        person_id, source_type, source_id, metadata, visibility, idempotency_key
      ) values (
        v_sequence.tenant_id,
        'recruitment_email_stopped',
        'Séquence email de recrutement arrêtée',
        'contact_not_allowed',
        now(),
        null,
        v_sequence.person_id,
        'person',
        v_sequence.person_id,
        jsonb_build_object('sequence_id', v_sequence.id, 'reason', 'contact_not_allowed', 'source', 'lot_9b_orchestrator'),
        'tenant',
        'recruitment_email_stopped:' || v_sequence.id::text
      ) on conflict (tenant_id, idempotency_key) do nothing;

      v_stopped_count := v_stopped_count + 1;
      continue;
    end if;

    select * into v_step_1
    from public.recruitment_email_sequence_steps
    where sequence_id = v_sequence.id and step_index = 1;

    if v_step_1.id is null then
      v_due_at := v_sequence.sent_at + interval '3 days';

      insert into public.recruitment_email_sequence_steps (
        tenant_id, sequence_id, person_id, step_index, step_key, status, scheduled_at,
        claimed_at, provider_message_id, sent_at, last_error, idempotency_key
      ) values (
        v_sequence.tenant_id,
        v_sequence.id,
        v_sequence.person_id,
        1,
        'follow_up_1',
        'scheduled',
        v_due_at,
        null,
        null,
        null,
        null,
        'recruitment-email-step:' || v_sequence.id::text || ':1'
      )
      on conflict (sequence_id, step_index) do nothing;

      update public.recruitment_email_sequences
      set lifecycle_status = 'scheduled',
          current_step = 1,
          next_action_at = v_due_at,
          completed_at = null,
          stop_reason = null
      where id = v_sequence.id;

      insert into public.timeline_events (
        tenant_id, event_type, title, description, occurred_at, created_by,
        person_id, source_type, source_id, metadata, visibility, idempotency_key
      ) values (
        v_sequence.tenant_id,
        'recruitment_email_queued',
        'Relance email de recrutement planifiée',
        'follow_up_1 — ' || v_due_at::text,
        now(),
        null,
        v_sequence.person_id,
        'person',
        v_sequence.person_id,
        jsonb_build_object('sequence_id', v_sequence.id, 'step_index', 1, 'scheduled_at', v_due_at, 'policy', 'J+3'),
        'tenant',
        'recruitment_email_scheduled:' || v_sequence.id::text || ':1'
      ) on conflict (tenant_id, idempotency_key) do nothing;

      v_scheduled_count := v_scheduled_count + 1;
      continue;
    end if;

    if v_step_1.status = 'sent' then
      select * into v_step_2
      from public.recruitment_email_sequence_steps
      where sequence_id = v_sequence.id and step_index = 2;

      if v_step_2.id is null then
        v_due_at := v_sequence.sent_at + interval '7 days';

        insert into public.recruitment_email_sequence_steps (
          tenant_id, sequence_id, person_id, step_index, step_key, status, scheduled_at,
          claimed_at, provider_message_id, sent_at, last_error, idempotency_key
        ) values (
          v_sequence.tenant_id,
          v_sequence.id,
          v_sequence.person_id,
          2,
          'follow_up_2',
          'scheduled',
          v_due_at,
          null,
          null,
          null,
          null,
          'recruitment-email-step:' || v_sequence.id::text || ':2'
        )
        on conflict (sequence_id, step_index) do nothing;

        update public.recruitment_email_sequences
        set lifecycle_status = 'scheduled',
            current_step = 2,
            next_action_at = v_due_at,
            completed_at = null,
            stop_reason = null
        where id = v_sequence.id;

        insert into public.timeline_events (
          tenant_id, event_type, title, description, occurred_at, created_by,
          person_id, source_type, source_id, metadata, visibility, idempotency_key
        ) values (
          v_sequence.tenant_id,
          'recruitment_email_queued',
          'Relance email de recrutement planifiée',
          'follow_up_2 — ' || v_due_at::text,
          now(),
          null,
          v_sequence.person_id,
          'person',
          v_sequence.person_id,
          jsonb_build_object('sequence_id', v_sequence.id, 'step_index', 2, 'scheduled_at', v_due_at, 'policy', 'J+7'),
          'tenant',
          'recruitment_email_scheduled:' || v_sequence.id::text || ':2'
        ) on conflict (tenant_id, idempotency_key) do nothing;

        v_scheduled_count := v_scheduled_count + 1;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'scheduled_count', v_scheduled_count,
    'stopped_count', v_stopped_count
  );
end;
$$;

create or replace function public.stop_recruitment_email_sequence_worker(
  p_sequence_id uuid,
  p_reason text default 'automation_stop'
)
returns public.recruitment_email_sequences
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sequence public.recruitment_email_sequences;
  v_reason text := left(coalesce(nullif(trim(p_reason), ''), 'automation_stop'), 120);
begin
  select * into v_sequence
  from public.recruitment_email_sequences
  where id = p_sequence_id
  for update;

  if v_sequence.id is null then
    raise exception 'SEQUENCE_NOT_FOUND' using errcode = '22023';
  end if;

  if v_sequence.lifecycle_status = 'stopped' then
    return v_sequence;
  end if;

  update public.recruitment_email_sequences
  set status = 'stopped',
      lifecycle_status = 'stopped',
      next_action_at = null,
      stopped_at = coalesce(stopped_at, now()),
      stop_reason = v_reason
  where id = v_sequence.id
  returning * into v_sequence;

  update public.recruitment_email_sequence_steps
  set status = 'cancelled',
      last_error = coalesce(last_error, 'Séquence arrêtée: ' || v_reason)
  where sequence_id = v_sequence.id
    and status in ('scheduled', 'processing');

  update public.recruitment_email_sequence_attempts
  set status = 'cancelled',
      completed_at = coalesce(completed_at, now()),
      error_message = coalesce(error_message, 'Séquence arrêtée: ' || v_reason)
  where sequence_id = v_sequence.id
    and status = 'processing';

  insert into public.timeline_events (
    tenant_id, event_type, title, description, occurred_at, created_by,
    person_id, source_type, source_id, metadata, visibility, idempotency_key
  ) values (
    v_sequence.tenant_id,
    'recruitment_email_stopped',
    'Séquence email de recrutement arrêtée',
    v_reason,
    now(),
    null,
    v_sequence.person_id,
    'person',
    v_sequence.person_id,
    jsonb_build_object('sequence_id', v_sequence.id, 'reason', v_reason, 'source', 'lot_9b_worker'),
    'tenant',
    'recruitment_email_stopped:' || v_sequence.id::text
  ) on conflict (tenant_id, idempotency_key) do nothing;

  return v_sequence;
end;
$$;

revoke all on function public.prepare_recruitment_email_follow_ups(integer) from public, anon, authenticated;
revoke all on function public.stop_recruitment_email_sequence_worker(uuid, text) from public, anon, authenticated;

grant execute on function public.prepare_recruitment_email_follow_ups(integer) to service_role;
grant execute on function public.stop_recruitment_email_sequence_worker(uuid, text) to service_role;
