-- Avoid counting one scheduled initial send twice in the legacy initial-status triggers.
create or replace function public.materialize_initial_recruitment_email_step()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_step public.recruitment_email_sequence_steps;
begin
  -- The scheduled local worker already completed the step and its actual attempt.
  if new.campaign_snapshot->>'key' = 'saint-maur-local-20261016'
    and new.status in ('sent','error') and exists (
      select 1 from public.recruitment_email_sequence_steps s
      join public.recruitment_email_sequence_attempts a on a.step_id=s.id
      where s.sequence_id=new.id and s.step_index=0 and s.status=new.status
        and a.status=new.status and s.provider_message_id is not distinct from new.provider_message_id
    ) then return new; end if;
  if new.status is distinct from old.status and new.status in ('sent', 'error') then
    insert into public.recruitment_email_sequence_steps (
      tenant_id, sequence_id, person_id, step_index, step_key, status, scheduled_at,
      provider_message_id, sent_at, last_error, idempotency_key
    ) values (
      new.tenant_id, new.id, new.person_id, 0, 'initial', new.status,
      coalesce(old.created_at, new.created_at, now()), new.provider_message_id,
      new.sent_at, new.last_error, 'initial:' || new.id::text
    )
    on conflict (sequence_id, step_index) do update
      set status = excluded.status,
          provider_message_id = excluded.provider_message_id,
          sent_at = excluded.sent_at,
          last_error = excluded.last_error
    returning * into v_step;

    insert into public.recruitment_email_sequence_attempts (
      tenant_id, sequence_id, step_id, person_id, attempt_number, status,
      claimed_at, completed_at, provider_message_id, error_message, idempotency_key
    ) values (
      new.tenant_id, new.id, v_step.id, new.person_id,
      coalesce((select max(attempt_number) + 1 from public.recruitment_email_sequence_attempts where step_id = v_step.id), 1),
      new.status, now(), now(), new.provider_message_id, new.last_error,
      'initial-attempt:' || new.id::text || ':' || new.attempt_count::text
    ) on conflict (tenant_id, idempotency_key) do nothing;
  elsif new.status is distinct from old.status and new.status = 'stopped' then
    update public.recruitment_email_sequence_steps
    set status = 'cancelled', last_error = coalesce(last_error, 'Séquence arrêtée')
    where sequence_id = new.id and status in ('scheduled', 'processing');

    update public.recruitment_email_sequence_attempts
    set status = 'cancelled', completed_at = coalesce(completed_at, now()),
        error_message = coalesce(error_message, 'Séquence arrêtée')
    where sequence_id = new.id and status = 'processing';
  end if;
  return new;
end;
$$;

-- Complete an initial scheduled send through the existing claimed-step engine.
-- Privileges and the existing overlap/reply/permission guards stay unchanged.
create or replace function public.complete_local_recruitment_initial(
  p_step_id uuid, p_success boolean, p_provider_message_id text default null, p_error text default null
) returns public.recruitment_email_sequence_steps
language plpgsql security definer set search_path = '' as $$
declare
  v_step public.recruitment_email_sequence_steps;
  v_sequence public.recruitment_email_sequences;
begin
  select * into v_step from public.recruitment_email_sequence_steps where id=p_step_id for update;
  select * into v_sequence from public.recruitment_email_sequences where id=v_step.sequence_id for update;
  if v_step.id is null or v_step.step_index <> 0
    or v_sequence.campaign_snapshot->>'key' is distinct from 'saint-maur-local-20261016' then
    raise exception 'INVALID_LOCAL_INITIAL_STEP';
  end if;
  if v_step.status='sent' then return v_step; end if;
  if v_sequence.status <> 'pending' or v_sequence.lifecycle_status in ('stopped','completed') then
    raise exception 'LOCAL_SEQUENCE_NOT_PENDING';
  end if;
  select * into v_step from public.complete_recruitment_email_step(p_step_id,p_success,p_provider_message_id,p_error);
  update public.recruitment_email_sequences set
    status=case when p_success then 'sent' else 'error' end,
    sent_at=case when p_success then v_step.sent_at else null end
    where id=v_sequence.id;
  -- The legacy initial-status trigger increments again; retain the actual claim count.
  update public.recruitment_email_sequences set attempt_count=v_sequence.attempt_count where id=v_sequence.id;
  return v_step;
end;
$$;
revoke all on function public.complete_local_recruitment_initial(uuid,boolean,text,text) from public,anon,authenticated;
grant execute on function public.complete_local_recruitment_initial(uuid,boolean,text,text) to service_role;
