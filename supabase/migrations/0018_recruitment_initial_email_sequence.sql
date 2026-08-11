create table public.recruitment_email_sequences (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  email text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'error', 'stopped')),
  provider text not null default 'brevo' check (provider = 'brevo'),
  provider_message_id text,
  sent_at timestamptz,
  stopped_at timestamptz,
  last_error text,
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recruitment_email_sequences_person_unique unique (tenant_id, person_id),
  constraint recruitment_email_sequences_email_check check (length(trim(email)) > 3 and position('@' in email) > 1)
);

create index recruitment_email_sequences_tenant_status_idx
  on public.recruitment_email_sequences (tenant_id, status, updated_at desc);

create trigger set_recruitment_email_sequences_updated_at
before update on public.recruitment_email_sequences
for each row execute function public.set_updated_at();

create trigger audit_recruitment_email_sequences_changes
after insert or update or delete on public.recruitment_email_sequences
for each row execute function public.audit_row_change();

alter table public.recruitment_email_sequences enable row level security;

create policy recruitment_email_sequences_select_for_members
on public.recruitment_email_sequences for select
to authenticated
using (public.is_tenant_member(tenant_id));

grant select on table public.recruitment_email_sequences to authenticated;
revoke insert, update, delete on table public.recruitment_email_sequences from authenticated;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'timeline_events_event_type_check'
      and conrelid = 'public.timeline_events'::regclass
  ) then
    alter table public.timeline_events drop constraint timeline_events_event_type_check;
  end if;
end;
$$;

alter table public.timeline_events
  add constraint timeline_events_event_type_check check (
    event_type in (
      'person_created', 'organization_created', 'relationship_created',
      'interaction_created', 'interaction_updated', 'task_created',
      'task_completed', 'task_reopened', 'task_updated', 'task_deleted',
      'organization_linked', 'organization_unlinked', 'project_created',
      'project_stage_changed', 'project_owner_changed',
      'project_estimated_value_changed', 'project_expected_close_changed',
      'project_won', 'project_lost', 'project_reopened', 'project_archived',
      'project_reactivated', 'project_task_created', 'project_task_completed',
      'project_interaction_created', 'relationship_stage_changed',
      'relationship_signature_confirmed', 'relationship_rejected',
      'relationship_reopened', 'relationship_owner_changed',
      'relationship_do_not_contact_changed', 'recruitment_email_queued',
      'recruitment_email_sent', 'recruitment_email_error',
      'recruitment_email_stopped'
    )
  );

create or replace function public.claim_initial_recruitment_email(p_person_id uuid)
returns public.recruitment_email_sequences
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_person public.people;
  v_sequence public.recruitment_email_sequences;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;

  select * into v_person from public.people where id = p_person_id and deleted_at is null;
  if v_person.id is null or not public.has_tenant_role(v_person.tenant_id, array['owner', 'admin', 'recruiter', 'manager']) then
    raise exception 'PERSON_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;
  if v_person.primary_email is null or trim(v_person.primary_email) = '' then
    raise exception 'PERSON_EMAIL_REQUIRED' using errcode = '22023';
  end if;
  if not v_person.contact_allowed or v_person.do_not_contact then
    raise exception 'CONTACT_NOT_ALLOWED' using errcode = '42501';
  end if;

  insert into public.recruitment_email_sequences (
    tenant_id, person_id, email, status, created_by, updated_by
  ) values (
    v_person.tenant_id, v_person.id, lower(trim(v_person.primary_email)), 'pending', v_user_id, v_user_id
  )
  on conflict (tenant_id, person_id) do update
  set status = case
        when recruitment_email_sequences.status = 'error' then 'pending'
        else recruitment_email_sequences.status
      end,
      email = case
        when recruitment_email_sequences.status = 'error' then excluded.email
        else recruitment_email_sequences.email
      end,
      last_error = case
        when recruitment_email_sequences.status = 'error' then null
        else recruitment_email_sequences.last_error
      end,
      updated_by = v_user_id
  returning * into v_sequence;

  if v_sequence.status = 'pending' then
    insert into public.timeline_events (
      tenant_id, event_type, title, description, occurred_at, created_by,
      person_id, source_type, source_id, metadata, visibility, idempotency_key
    ) values (
      v_sequence.tenant_id, 'recruitment_email_queued', 'Premier email de recrutement à envoyer',
      v_sequence.email, now(), v_user_id, v_sequence.person_id, 'person',
      v_sequence.person_id, jsonb_build_object('sequence_id', v_sequence.id), 'tenant',
      'recruitment_email_queued:' || v_sequence.id::text
    ) on conflict (tenant_id, idempotency_key) do nothing;
  end if;
  return v_sequence;
end;
$$;

create or replace function public.complete_initial_recruitment_email(
  p_sequence_id uuid,
  p_success boolean,
  p_provider_message_id text default null,
  p_error text default null
)
returns public.recruitment_email_sequences
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_sequence public.recruitment_email_sequences;
begin
  select * into v_sequence from public.recruitment_email_sequences where id = p_sequence_id for update;
  if v_user_id is null or v_sequence.id is null
     or not public.has_tenant_role(v_sequence.tenant_id, array['owner', 'admin', 'recruiter', 'manager']) then
    raise exception 'SEQUENCE_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;
  if v_sequence.status = 'sent' then return v_sequence; end if;
  if v_sequence.status <> 'pending' then raise exception 'SEQUENCE_NOT_PENDING' using errcode = '22023'; end if;
  if p_success and nullif(trim(p_provider_message_id), '') is null then
    raise exception 'PROVIDER_MESSAGE_ID_REQUIRED' using errcode = '22023';
  end if;

  update public.recruitment_email_sequences
  set status = case when p_success then 'sent' else 'error' end,
      provider_message_id = case when p_success then nullif(trim(p_provider_message_id), '') else null end,
      sent_at = case when p_success then now() else null end,
      last_error = case when p_success then null else left(coalesce(nullif(trim(p_error), ''), 'Erreur Brevo'), 500) end,
      updated_by = v_user_id
  where id = p_sequence_id
  returning * into v_sequence;

  insert into public.timeline_events (
    tenant_id, event_type, title, description, occurred_at, created_by,
    person_id, source_type, source_id, metadata, visibility, idempotency_key
  ) values (
    v_sequence.tenant_id,
    case when p_success then 'recruitment_email_sent' else 'recruitment_email_error' end,
    case when p_success then 'Premier email de recrutement envoyé' else 'Erreur du premier email de recrutement' end,
    case when p_success then v_sequence.email else v_sequence.last_error end,
    now(), v_user_id, v_sequence.person_id, 'person', v_sequence.person_id,
    jsonb_build_object('sequence_id', v_sequence.id, 'provider_message_id', v_sequence.provider_message_id),
    'tenant',
    (case when p_success then 'recruitment_email_sent:' else 'recruitment_email_error:' end) || v_sequence.id::text
  ) on conflict (tenant_id, idempotency_key) do nothing;
  return v_sequence;
end;
$$;

create or replace function public.stop_initial_recruitment_email(p_sequence_id uuid)
returns public.recruitment_email_sequences
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_sequence public.recruitment_email_sequences;
begin
  select * into v_sequence from public.recruitment_email_sequences where id = p_sequence_id for update;
  if v_user_id is null or v_sequence.id is null
     or not public.has_tenant_role(v_sequence.tenant_id, array['owner', 'admin', 'recruiter', 'manager']) then
    raise exception 'SEQUENCE_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;
  if v_sequence.status = 'stopped' then return v_sequence; end if;

  update public.recruitment_email_sequences
  set status = 'stopped', stopped_at = now(), updated_by = v_user_id
  where id = p_sequence_id
  returning * into v_sequence;

  insert into public.timeline_events (
    tenant_id, event_type, title, occurred_at, created_by, person_id,
    source_type, source_id, metadata, visibility, idempotency_key
  ) values (
    v_sequence.tenant_id, 'recruitment_email_stopped', 'Séquence email de recrutement arrêtée',
    now(), v_user_id, v_sequence.person_id, 'person', v_sequence.person_id,
    jsonb_build_object('sequence_id', v_sequence.id), 'tenant',
    'recruitment_email_stopped:' || v_sequence.id::text
  ) on conflict (tenant_id, idempotency_key) do nothing;
  return v_sequence;
end;
$$;

revoke all on function public.claim_initial_recruitment_email(uuid) from public, anon;
revoke all on function public.complete_initial_recruitment_email(uuid, boolean, text, text) from public, anon;
revoke all on function public.stop_initial_recruitment_email(uuid) from public, anon;
grant execute on function public.claim_initial_recruitment_email(uuid) to authenticated;
grant execute on function public.complete_initial_recruitment_email(uuid, boolean, text, text) to authenticated;
grant execute on function public.stop_initial_recruitment_email(uuid) to authenticated;
