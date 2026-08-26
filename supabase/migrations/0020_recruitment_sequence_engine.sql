alter table public.recruitment_email_sequences
  add column lifecycle_status text not null default 'idle',
  add column current_step smallint not null default 0,
  add column next_action_at timestamptz,
  add column attempt_count integer not null default 0,
  add column last_attempt_at timestamptz,
  add column completed_at timestamptz,
  add column stop_reason text;

alter table public.recruitment_email_sequences
  add constraint recruitment_email_sequences_lifecycle_status_check
    check (lifecycle_status in ('idle', 'scheduled', 'running', 'completed', 'stopped', 'error')),
  add constraint recruitment_email_sequences_current_step_check
    check (current_step between 0 and 2),
  add constraint recruitment_email_sequences_attempt_count_check
    check (attempt_count >= 0);

create index recruitment_email_sequences_engine_due_idx
  on public.recruitment_email_sequences (tenant_id, lifecycle_status, next_action_at)
  where next_action_at is not null;

create table public.recruitment_email_sequence_steps (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  sequence_id uuid not null references public.recruitment_email_sequences(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  step_index smallint not null check (step_index between 0 and 2),
  step_key text not null check (step_key in ('initial', 'follow_up_1', 'follow_up_2')),
  status text not null default 'scheduled' check (status in ('scheduled', 'processing', 'sent', 'error', 'cancelled')),
  scheduled_at timestamptz not null,
  claimed_at timestamptz,
  provider_message_id text,
  sent_at timestamptz,
  last_error text,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recruitment_email_sequence_steps_sequence_step_unique unique (sequence_id, step_index),
  constraint recruitment_email_sequence_steps_tenant_idempotency_unique unique (tenant_id, idempotency_key)
);

create index recruitment_email_sequence_steps_due_idx
  on public.recruitment_email_sequence_steps (tenant_id, status, scheduled_at)
  where status = 'scheduled';

create trigger set_recruitment_email_sequence_steps_updated_at
before update on public.recruitment_email_sequence_steps
for each row execute function public.set_updated_at();

create trigger audit_recruitment_email_sequence_steps_changes
after insert or update or delete on public.recruitment_email_sequence_steps
for each row execute function public.audit_changes();

alter table public.recruitment_email_sequence_steps enable row level security;

create policy recruitment_email_sequence_steps_select_for_members
on public.recruitment_email_sequence_steps for select
to authenticated
using (public.is_tenant_member(tenant_id));

grant select on table public.recruitment_email_sequence_steps to authenticated;
revoke insert, update, delete on table public.recruitment_email_sequence_steps from authenticated;

create table public.recruitment_email_sequence_attempts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  sequence_id uuid not null references public.recruitment_email_sequences(id) on delete cascade,
  step_id uuid not null references public.recruitment_email_sequence_steps(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  attempt_number integer not null check (attempt_number > 0),
  status text not null default 'processing' check (status in ('processing', 'sent', 'error', 'cancelled')),
  claimed_at timestamptz not null default now(),
  completed_at timestamptz,
  provider_message_id text,
  error_message text,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  constraint recruitment_email_sequence_attempts_step_number_unique unique (step_id, attempt_number),
  constraint recruitment_email_sequence_attempts_tenant_idempotency_unique unique (tenant_id, idempotency_key)
);

create index recruitment_email_sequence_attempts_sequence_idx
  on public.recruitment_email_sequence_attempts (sequence_id, created_at desc);

create trigger audit_recruitment_email_sequence_attempts_changes
after insert or update or delete on public.recruitment_email_sequence_attempts
for each row execute function public.audit_changes();

alter table public.recruitment_email_sequence_attempts enable row level security;

create policy recruitment_email_sequence_attempts_select_for_members
on public.recruitment_email_sequence_attempts for select
to authenticated
using (public.is_tenant_member(tenant_id));

grant select on table public.recruitment_email_sequence_attempts to authenticated;
revoke insert, update, delete on table public.recruitment_email_sequence_attempts from authenticated;

-- Lot 8 compatibility: an already-sent initial email is eligible for a future follow-up.
update public.recruitment_email_sequences
set lifecycle_status = case status
      when 'sent' then 'idle'
      when 'error' then 'error'
      when 'stopped' then 'stopped'
      else 'idle'
    end,
    current_step = 0,
    attempt_count = case when status in ('sent', 'error') then 1 else 0 end,
    last_attempt_at = case when status = 'sent' then sent_at when status = 'error' then updated_at else null end,
    completed_at = null,
    stop_reason = case when status = 'stopped' then 'legacy_stop' else null end,
    next_action_at = null;

insert into public.recruitment_email_sequence_steps (
  tenant_id, sequence_id, person_id, step_index, step_key, status, scheduled_at,
  provider_message_id, sent_at, last_error, idempotency_key
)
select tenant_id, id, person_id, 0, 'initial',
       case when status = 'sent' then 'sent' else 'error' end,
       created_at, provider_message_id, sent_at, last_error,
       'initial:' || id::text
from public.recruitment_email_sequences
where status in ('sent', 'error')
on conflict (sequence_id, step_index) do nothing;

insert into public.recruitment_email_sequence_attempts (
  tenant_id, sequence_id, step_id, person_id, attempt_number, status,
  claimed_at, completed_at, provider_message_id, error_message, idempotency_key
)
select s.tenant_id, s.sequence_id, s.id, s.person_id, 1, s.status,
       s.scheduled_at, coalesce(s.sent_at, s.updated_at), s.provider_message_id, s.last_error,
       'initial-attempt:' || s.sequence_id::text
from public.recruitment_email_sequence_steps s
where s.step_index = 0 and s.status in ('sent', 'error')
on conflict (step_id, attempt_number) do nothing;

create or replace function public.sync_initial_recruitment_email_engine_columns()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'sent' then
      new.lifecycle_status := 'idle';
      new.current_step := 0;
      new.next_action_at := null;
      new.attempt_count := old.attempt_count + 1;
      new.last_attempt_at := coalesce(new.sent_at, now());
      new.completed_at := null;
      new.stop_reason := null;
    elsif new.status = 'error' then
      new.lifecycle_status := 'error';
      new.current_step := 0;
      new.next_action_at := null;
      new.attempt_count := old.attempt_count + 1;
      new.last_attempt_at := now();
      new.completed_at := null;
    elsif new.status = 'stopped' then
      new.lifecycle_status := 'stopped';
      new.next_action_at := null;
      new.stopped_at := coalesce(new.stopped_at, now());
      new.stop_reason := coalesce(nullif(trim(new.stop_reason), ''), 'manual');
    elsif new.status = 'pending' and old.status = 'error' then
      new.lifecycle_status := 'idle';
      new.next_action_at := null;
      new.completed_at := null;
      new.stop_reason := null;
    end if;
  end if;
  return new;
end;
$$;

create trigger sync_initial_recruitment_email_engine_columns
before update of status on public.recruitment_email_sequences
for each row execute function public.sync_initial_recruitment_email_engine_columns();

create or replace function public.materialize_initial_recruitment_email_step()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_step public.recruitment_email_sequence_steps;
begin
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

create trigger materialize_initial_recruitment_email_step
after update of status on public.recruitment_email_sequences
for each row execute function public.materialize_initial_recruitment_email_step();

create or replace function public.schedule_recruitment_email_step(
  p_sequence_id uuid,
  p_step_index smallint,
  p_scheduled_at timestamptz
)
returns public.recruitment_email_sequence_steps
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_sequence public.recruitment_email_sequences;
  v_person public.people;
  v_existing public.recruitment_email_sequence_steps;
  v_previous public.recruitment_email_sequence_steps;
  v_step public.recruitment_email_sequence_steps;
  v_step_key text;
begin
  select * into v_sequence from public.recruitment_email_sequences where id = p_sequence_id for update;
  if v_user_id is null or v_sequence.id is null
     or not public.has_tenant_role(v_sequence.tenant_id, array['owner', 'admin', 'recruiter', 'manager']) then
    raise exception 'SEQUENCE_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;
  if p_step_index not in (1, 2) then raise exception 'FOLLOW_UP_STEP_REQUIRED' using errcode = '22023'; end if;
  if p_scheduled_at is null or p_scheduled_at <= now() then raise exception 'FUTURE_SCHEDULE_REQUIRED' using errcode = '22023'; end if;
  if v_sequence.status = 'stopped' or v_sequence.lifecycle_status in ('stopped', 'completed') then
    raise exception 'SEQUENCE_NOT_SCHEDULABLE' using errcode = '22023';
  end if;
  if v_sequence.status <> 'sent' then raise exception 'INITIAL_EMAIL_NOT_SENT' using errcode = '22023'; end if;

  select * into v_person from public.people where id = v_sequence.person_id;
  if v_person.id is null or not v_person.contact_allowed or v_person.do_not_contact then
    raise exception 'CONTACT_NOT_ALLOWED' using errcode = '42501';
  end if;

  if p_step_index = 2 then
    select * into v_previous from public.recruitment_email_sequence_steps
    where sequence_id = p_sequence_id and step_index = 1;
    if v_previous.id is null or v_previous.status <> 'sent' then
      raise exception 'PREVIOUS_STEP_NOT_SENT' using errcode = '22023';
    end if;
  end if;

  if exists (
    select 1 from public.recruitment_email_sequence_steps
    where sequence_id = p_sequence_id and step_index <> p_step_index and status in ('scheduled', 'processing')
  ) then
    raise exception 'ANOTHER_STEP_ALREADY_ACTIVE' using errcode = '22023';
  end if;

  select * into v_existing from public.recruitment_email_sequence_steps
  where sequence_id = p_sequence_id and step_index = p_step_index;
  if v_existing.id is not null and v_existing.status in ('processing', 'sent') then
    raise exception 'STEP_ALREADY_CLAIMED_OR_SENT' using errcode = '22023';
  end if;

  v_step_key := case p_step_index when 1 then 'follow_up_1' else 'follow_up_2' end;
  insert into public.recruitment_email_sequence_steps (
    tenant_id, sequence_id, person_id, step_index, step_key, status, scheduled_at,
    claimed_at, provider_message_id, sent_at, last_error, idempotency_key
  ) values (
    v_sequence.tenant_id, v_sequence.id, v_sequence.person_id, p_step_index,
    v_step_key, 'scheduled', p_scheduled_at, null, null, null, null,
    'recruitment-email-step:' || v_sequence.id::text || ':' || p_step_index::text
  )
  on conflict (sequence_id, step_index) do update
    set status = 'scheduled', scheduled_at = excluded.scheduled_at, claimed_at = null,
        provider_message_id = null, sent_at = null, last_error = null
  returning * into v_step;

  update public.recruitment_email_sequences
  set lifecycle_status = 'scheduled', current_step = p_step_index,
      next_action_at = p_scheduled_at, completed_at = null, stop_reason = null, updated_by = v_user_id
  where id = v_sequence.id;

  insert into public.timeline_events (
    tenant_id, event_type, title, description, occurred_at, created_by,
    person_id, source_type, source_id, metadata, visibility, idempotency_key
  ) values (
    v_sequence.tenant_id, 'recruitment_email_queued', 'Relance email de recrutement planifiée',
    v_step_key || ' — ' || p_scheduled_at::text, now(), v_user_id,
    v_sequence.person_id, 'person', v_sequence.person_id,
    jsonb_build_object('sequence_id', v_sequence.id, 'step_id', v_step.id, 'step_index', p_step_index, 'scheduled_at', p_scheduled_at),
    'tenant', 'recruitment_email_scheduled:' || v_sequence.id::text || ':' || p_step_index::text
  ) on conflict (tenant_id, idempotency_key) do nothing;

  return v_step;
end;
$$;

create or replace function public.claim_due_recruitment_email_steps(p_limit integer default 25)
returns setof public.recruitment_email_sequence_steps
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_step public.recruitment_email_sequence_steps;
  v_claimed public.recruitment_email_sequence_steps;
  v_sequence public.recruitment_email_sequences;
  v_person public.people;
  v_attempt_number integer;
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
$$;

create or replace function public.complete_recruitment_email_step(
  p_step_id uuid,
  p_success boolean,
  p_provider_message_id text default null,
  p_error text default null
)
returns public.recruitment_email_sequence_steps
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_step public.recruitment_email_sequence_steps;
  v_sequence public.recruitment_email_sequences;
  v_attempt public.recruitment_email_sequence_attempts;
begin
  select * into v_step from public.recruitment_email_sequence_steps where id = p_step_id for update;
  if v_step.id is null then raise exception 'STEP_NOT_FOUND' using errcode = '22023'; end if;
  if v_step.status = 'sent' then return v_step; end if;
  if v_step.status <> 'processing' then raise exception 'STEP_NOT_PROCESSING' using errcode = '22023'; end if;
  if p_success and nullif(trim(p_provider_message_id), '') is null then
    raise exception 'PROVIDER_MESSAGE_ID_REQUIRED' using errcode = '22023';
  end if;

  select * into v_attempt from public.recruitment_email_sequence_attempts
  where step_id = p_step_id and status = 'processing'
  order by attempt_number desc limit 1 for update;
  if v_attempt.id is null then raise exception 'PROCESSING_ATTEMPT_NOT_FOUND' using errcode = '22023'; end if;

  select * into v_sequence from public.recruitment_email_sequences where id = v_step.sequence_id for update;

  update public.recruitment_email_sequence_steps
  set status = case when p_success then 'sent' else 'error' end,
      provider_message_id = case when p_success then nullif(trim(p_provider_message_id), '') else null end,
      sent_at = case when p_success then now() else null end,
      last_error = case when p_success then null else left(coalesce(nullif(trim(p_error), ''), 'Erreur Brevo'), 500) end
  where id = v_step.id returning * into v_step;

  update public.recruitment_email_sequence_attempts
  set status = case when p_success then 'sent' else 'error' end,
      completed_at = now(),
      provider_message_id = case when p_success then v_step.provider_message_id else null end,
      error_message = case when p_success then null else v_step.last_error end
  where id = v_attempt.id;

  update public.recruitment_email_sequences
  set lifecycle_status = case when not p_success then 'error' when v_step.step_index >= 2 then 'completed' else 'idle' end,
      current_step = v_step.step_index, next_action_at = null,
      provider_message_id = case when p_success then v_step.provider_message_id else provider_message_id end,
      completed_at = case when p_success and v_step.step_index >= 2 then now() else null end,
      last_error = case when p_success then null else v_step.last_error end
  where id = v_sequence.id;

  insert into public.timeline_events (
    tenant_id, event_type, title, description, occurred_at, created_by,
    person_id, source_type, source_id, metadata, visibility, idempotency_key
  ) values (
    v_sequence.tenant_id,
    case when p_success then 'recruitment_email_sent' else 'recruitment_email_error' end,
    case when p_success then 'Relance email de recrutement envoyée' else 'Erreur de relance email de recrutement' end,
    case when p_success then v_sequence.email else v_step.last_error end,
    now(), null, v_sequence.person_id, 'person', v_sequence.person_id,
    jsonb_build_object('sequence_id', v_sequence.id, 'step_id', v_step.id, 'step_index', v_step.step_index, 'attempt_id', v_attempt.id, 'provider_message_id', v_step.provider_message_id),
    'tenant',
    (case when p_success then 'recruitment_email_sent:' else 'recruitment_email_error:' end)
      || v_sequence.id::text || ':step:' || v_step.step_index::text || ':attempt:' || v_attempt.attempt_number::text
  ) on conflict (tenant_id, idempotency_key) do nothing;

  return v_step;
end;
$$;

create or replace function public.stop_recruitment_email_sequence_engine(
  p_sequence_id uuid,
  p_reason text default 'manual'
)
returns public.recruitment_email_sequences
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_sequence public.recruitment_email_sequences;
  v_reason text := left(coalesce(nullif(trim(p_reason), ''), 'manual'), 120);
begin
  select * into v_sequence from public.recruitment_email_sequences where id = p_sequence_id for update;
  if v_user_id is null or v_sequence.id is null
     or not public.has_tenant_role(v_sequence.tenant_id, array['owner', 'admin', 'recruiter', 'manager']) then
    raise exception 'SEQUENCE_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;
  if v_sequence.lifecycle_status = 'stopped' then return v_sequence; end if;

  update public.recruitment_email_sequences
  set status = 'stopped', lifecycle_status = 'stopped', next_action_at = null,
      stopped_at = coalesce(stopped_at, now()), stop_reason = v_reason, updated_by = v_user_id
  where id = v_sequence.id returning * into v_sequence;

  update public.recruitment_email_sequence_steps
  set status = 'cancelled', last_error = coalesce(last_error, 'Séquence arrêtée: ' || v_reason)
  where sequence_id = v_sequence.id and status in ('scheduled', 'processing');

  update public.recruitment_email_sequence_attempts
  set status = 'cancelled', completed_at = coalesce(completed_at, now()),
      error_message = coalesce(error_message, 'Séquence arrêtée: ' || v_reason)
  where sequence_id = v_sequence.id and status = 'processing';

  insert into public.timeline_events (
    tenant_id, event_type, title, description, occurred_at, created_by,
    person_id, source_type, source_id, metadata, visibility, idempotency_key
  ) values (
    v_sequence.tenant_id, 'recruitment_email_stopped', 'Séquence email de recrutement arrêtée',
    v_reason, now(), v_user_id, v_sequence.person_id, 'person', v_sequence.person_id,
    jsonb_build_object('sequence_id', v_sequence.id, 'reason', v_reason), 'tenant',
    'recruitment_email_stopped:' || v_sequence.id::text
  ) on conflict (tenant_id, idempotency_key) do nothing;

  return v_sequence;
end;
$$;

revoke all on function public.schedule_recruitment_email_step(uuid, smallint, timestamptz) from public, anon;
revoke all on function public.claim_due_recruitment_email_steps(integer) from public, anon, authenticated;
revoke all on function public.complete_recruitment_email_step(uuid, boolean, text, text) from public, anon, authenticated;
revoke all on function public.stop_recruitment_email_sequence_engine(uuid, text) from public, anon;

grant execute on function public.schedule_recruitment_email_step(uuid, smallint, timestamptz) to authenticated;
grant execute on function public.stop_recruitment_email_sequence_engine(uuid, text) to authenticated;
grant execute on function public.claim_due_recruitment_email_steps(integer) to service_role;
grant execute on function public.complete_recruitment_email_step(uuid, boolean, text, text) to service_role;
