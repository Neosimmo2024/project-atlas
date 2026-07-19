do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'relationships'
      and column_name = 'pipeline_stage'
  ) then
    update public.relationships
    set
      metadata = case
        when pipeline_stage in ('meeting', 'refusal', 'closed') then
          jsonb_set(coalesce(metadata, '{}'::jsonb), '{recruitment_pipeline,legacy_stage}', to_jsonb(pipeline_stage), true)
        else coalesce(metadata, '{}'::jsonb)
      end,
      pipeline_stage = case pipeline_stage
        when 'meeting' then 'appointment'
        when 'refusal' then 'rejected'
        when 'closed' then 'rejected'
        else pipeline_stage
      end
    where pipeline_stage in ('meeting', 'refusal', 'closed')
      or metadata is null;
  end if;
end;
$$;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'relationships_pipeline_stage_allowed'
      and conrelid = 'public.relationships'::regclass
  ) then
    alter table public.relationships drop constraint relationships_pipeline_stage_allowed;
  end if;
end;
$$;

alter table public.relationships
  add constraint relationships_pipeline_stage_allowed check (
    pipeline_stage in (
      'detection',
      'qualification',
      'first_contact',
      'conversation',
      'appointment',
      'presentation',
      'reflection',
      'negotiation',
      'signature',
      'onboarding',
      'development',
      'ambassador',
      'rejected'
    )
  );

alter table public.relationships
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create table if not exists public.recruitment_pipeline_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  relationship_id uuid not null references public.relationships(id) on delete cascade,
  from_stage text,
  to_stage text not null,
  event_type text not null default 'stage_transition',
  actor_user_id uuid references auth.users(id) on delete set null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint recruitment_pipeline_events_stage_check check (
    (from_stage is null or from_stage in (
      'detection',
      'qualification',
      'first_contact',
      'conversation',
      'appointment',
      'presentation',
      'reflection',
      'negotiation',
      'signature',
      'onboarding',
      'development',
      'ambassador',
      'rejected'
    ))
    and to_stage in (
      'detection',
      'qualification',
      'first_contact',
      'conversation',
      'appointment',
      'presentation',
      'reflection',
      'negotiation',
      'signature',
      'onboarding',
      'development',
      'ambassador',
      'rejected'
    )
  ),
  constraint recruitment_pipeline_events_type_check check (
    event_type in (
      'stage_transition',
      'signature_confirmed',
      'signature_left',
      'rejected',
      'reopened',
      'owner_changed',
      'do_not_contact_changed'
    )
  )
);

create unique index if not exists relationships_tenant_id_unique
  on public.relationships (tenant_id, id);

create index if not exists relationships_tenant_pipeline_stage_idx
  on public.relationships (tenant_id, pipeline_stage, updated_at desc);

create index if not exists relationships_tenant_owner_idx
  on public.relationships (tenant_id, owner_user_id, updated_at desc)
  where owner_user_id is not null;

create index if not exists recruitment_pipeline_events_relationship_created_idx
  on public.recruitment_pipeline_events (tenant_id, relationship_id, created_at desc, id desc);

alter table public.recruitment_pipeline_events enable row level security;

drop policy if exists recruitment_pipeline_events_select_for_members on public.recruitment_pipeline_events;
create policy recruitment_pipeline_events_select_for_members
on public.recruitment_pipeline_events
for select
to authenticated
using (public.is_tenant_member(tenant_id));

drop policy if exists recruitment_pipeline_events_insert_for_recruiting_roles on public.recruitment_pipeline_events;
create policy recruitment_pipeline_events_insert_for_recruiting_roles
on public.recruitment_pipeline_events
for insert
to authenticated
with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'recruiter', 'manager']));

create or replace function public.relationship_references_match_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.people
    where people.id = new.person_id
      and people.tenant_id = new.tenant_id
  ) then
    raise exception 'Relationship person must belong to the relationship tenant.';
  end if;

  if new.organization_id is not null and not exists (
    select 1 from public.organizations
    where organizations.id = new.organization_id
      and organizations.tenant_id = new.tenant_id
  ) then
    raise exception 'Relationship organization must belong to the relationship tenant.';
  end if;

  if new.owner_user_id is not null and not exists (
    select 1 from public.tenant_users
    where tenant_users.tenant_id = new.tenant_id
      and tenant_users.user_id = new.owner_user_id
      and tenant_users.status = 'active'
  ) then
    raise exception 'Relationship owner must belong to the relationship tenant.';
  end if;

  return new;
end;
$$;

drop trigger if exists relationship_references_match_tenant on public.relationships;
create trigger relationship_references_match_tenant
before insert or update on public.relationships
for each row execute function public.relationship_references_match_tenant();

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
      'person_created',
      'organization_created',
      'relationship_created',
      'interaction_created',
      'interaction_updated',
      'task_created',
      'task_completed',
      'task_reopened',
      'task_updated',
      'task_deleted',
      'organization_linked',
      'organization_unlinked',
      'project_created',
      'project_stage_changed',
      'project_owner_changed',
      'project_estimated_value_changed',
      'project_expected_close_changed',
      'project_won',
      'project_lost',
      'project_reopened',
      'project_archived',
      'project_reactivated',
      'project_task_created',
      'project_task_completed',
      'project_interaction_created',
      'relationship_stage_changed',
      'relationship_signature_confirmed',
      'relationship_rejected',
      'relationship_reopened',
      'relationship_owner_changed',
      'relationship_do_not_contact_changed'
    )
  );

create or replace function public.transition_recruitment_pipeline(
  p_relationship_id uuid,
  p_tenant_id uuid,
  p_to_stage text,
  p_expected_stage text default null,
  p_expected_updated_at timestamptz default null,
  p_confirmed boolean default false,
  p_reason text default null,
  p_signature_at timestamptz default null,
  p_start_at timestamptz default null,
  p_rejection_reason text default null,
  p_rejection_comment text default null,
  p_rejection_recontactable boolean default null,
  p_rejection_follow_up_at timestamptz default null,
  p_do_not_contact boolean default null,
  p_metadata jsonb default '{}'::jsonb
)
returns public.relationships
language plpgsql
security definer
set search_path = public
as $$
declare
  v_relationship public.relationships%rowtype;
  v_updated public.relationships%rowtype;
  v_event_type text := 'stage_transition';
  v_timeline_event_type text := 'relationship_stage_changed';
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
  v_actor uuid := auth.uid();
  v_event_id uuid := gen_random_uuid();
begin
  if v_actor is null then
    raise exception 'Authentication required.';
  end if;

  if not public.has_tenant_role(p_tenant_id, array['owner', 'admin', 'recruiter', 'manager']) then
    raise exception 'Insufficient role for recruitment pipeline transition.';
  end if;

  if p_to_stage not in (
    'detection',
    'qualification',
    'first_contact',
    'conversation',
    'appointment',
    'presentation',
    'reflection',
    'negotiation',
    'signature',
    'onboarding',
    'development',
    'ambassador',
    'rejected'
  ) then
    raise exception 'Invalid recruitment pipeline stage.';
  end if;

  select *
  into v_relationship
  from public.relationships
  where id = p_relationship_id
    and tenant_id = p_tenant_id
  for update;

  if not found then
    raise exception 'Relationship not found.';
  end if;

  if p_expected_stage is not null and v_relationship.pipeline_stage <> p_expected_stage then
    raise exception 'Relationship pipeline stage is stale.';
  end if;

  if p_expected_updated_at is not null and v_relationship.updated_at <> p_expected_updated_at then
    raise exception 'Relationship has been modified since it was loaded.';
  end if;

  if v_relationship.pipeline_stage = p_to_stage then
    return v_relationship;
  end if;

  if p_to_stage = 'signature' then
    if not p_confirmed or p_signature_at is null then
      raise exception 'Signature requires confirmation and signature date.';
    end if;
    v_event_type := 'signature_confirmed';
    v_timeline_event_type := 'relationship_signature_confirmed';
    v_metadata := jsonb_set(v_metadata, '{signature}', jsonb_build_object(
      'signature_at', p_signature_at,
      'start_at', p_start_at,
      'note', p_reason,
      'scheduled', p_signature_at > now()
    ), true);
  end if;

  if v_relationship.pipeline_stage = 'signature' and p_to_stage <> 'signature' then
    if not public.has_tenant_role(p_tenant_id, array['owner', 'admin']) then
      raise exception 'Only owner and admin roles can leave the signature stage.';
    end if;
    if not p_confirmed or p_reason is null or length(trim(p_reason)) = 0 then
      raise exception 'Leaving signature requires confirmation and correction reason.';
    end if;
    v_event_type := 'signature_left';
  end if;

  if p_to_stage = 'rejected' then
    if p_rejection_reason is null
      or p_rejection_reason not in ('not_interested', 'conditions', 'current_network', 'postponed', 'profile_mismatch', 'unresponsive', 'duplicate', 'other') then
      raise exception 'Rejected stage requires a valid rejection reason.';
    end if;
    if p_rejection_reason = 'other' and (p_rejection_comment is null or length(trim(p_rejection_comment)) = 0) then
      raise exception 'Rejection reason other requires a comment.';
    end if;
    v_event_type := 'rejected';
    v_timeline_event_type := 'relationship_rejected';
    v_metadata := jsonb_set(v_metadata, '{rejection}', jsonb_build_object(
      'reason', p_rejection_reason,
      'comment', p_rejection_comment,
      'recontactable', coalesce(p_rejection_recontactable, false),
      'follow_up_at', p_rejection_follow_up_at,
      'do_not_contact', coalesce(p_do_not_contact, false)
    ), true);
  end if;

  if v_relationship.pipeline_stage = 'rejected' and p_to_stage <> 'rejected' then
    if p_reason is null or length(trim(p_reason)) = 0 then
      raise exception 'Reopening a rejected relationship requires a reason.';
    end if;
    v_event_type := 'reopened';
    v_timeline_event_type := 'relationship_reopened';
    v_metadata := jsonb_set(v_metadata, '{reopen}', jsonb_build_object(
      'reason', p_reason,
      'reopened_at', now()
    ), true);
  end if;

  update public.relationships
  set
    pipeline_stage = p_to_stage,
    status = case
      when p_to_stage = 'rejected' then 'lost'
      when pipeline_stage = 'rejected' and p_to_stage <> 'rejected' then 'active'
      else status
    end,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'recruitment_pipeline',
      coalesce(metadata -> 'recruitment_pipeline', '{}'::jsonb) || v_metadata
    ),
    updated_at = now()
  where id = p_relationship_id
    and tenant_id = p_tenant_id
  returning * into v_updated;

  if p_to_stage = 'rejected' and coalesce(p_do_not_contact, false) then
    update public.people
    set do_not_contact = true
    where id = v_updated.person_id
      and tenant_id = p_tenant_id;
  end if;

  insert into public.recruitment_pipeline_events (
    id,
    tenant_id,
    relationship_id,
    from_stage,
    to_stage,
    event_type,
    actor_user_id,
    reason,
    metadata
  )
  values (
    v_event_id,
    p_tenant_id,
    p_relationship_id,
    v_relationship.pipeline_stage,
    p_to_stage,
    v_event_type,
    v_actor,
    p_reason,
    v_metadata
  );

  insert into public.timeline_events (
    tenant_id,
    event_type,
    title,
    description,
    occurred_at,
    created_by,
    person_id,
    organization_id,
    relationship_id,
    source_type,
    source_id,
    metadata,
    idempotency_key
  )
  values (
    p_tenant_id,
    v_timeline_event_type,
    case
      when v_timeline_event_type = 'relationship_signature_confirmed' then 'Signature confirmée'
      when v_timeline_event_type = 'relationship_rejected' then 'Relation rejetée'
      when v_timeline_event_type = 'relationship_reopened' then 'Relation rouverte'
      else 'Phase de relation modifiée'
    end,
    p_reason,
    now(),
    v_actor,
    v_updated.person_id,
    v_updated.organization_id,
    v_updated.id,
    'relationship',
    v_updated.id,
    v_metadata,
    'relationship_pipeline:' || v_event_id::text
  );

  return v_updated;
end;
$$;

create or replace function public.assign_relationship_owner(
  p_relationship_id uuid,
  p_tenant_id uuid,
  p_owner_user_id uuid,
  p_expected_updated_at timestamptz default null,
  p_reason text default null
)
returns public.relationships
language plpgsql
security definer
set search_path = public
as $$
declare
  v_relationship public.relationships%rowtype;
  v_updated public.relationships%rowtype;
  v_actor uuid := auth.uid();
  v_event_id uuid := gen_random_uuid();
begin
  if v_actor is null then
    raise exception 'Authentication required.';
  end if;

  if not public.has_tenant_role(p_tenant_id, array['owner', 'admin']) then
    raise exception 'Only owner and admin roles can assign a relationship owner.';
  end if;

  if p_owner_user_id is not null and not exists (
    select 1 from public.tenant_users
    where tenant_id = p_tenant_id
      and user_id = p_owner_user_id
      and status = 'active'
  ) then
    raise exception 'Relationship owner must belong to the relationship tenant.';
  end if;

  select *
  into v_relationship
  from public.relationships
  where id = p_relationship_id
    and tenant_id = p_tenant_id
  for update;

  if not found then
    raise exception 'Relationship not found.';
  end if;

  if p_expected_updated_at is not null and v_relationship.updated_at <> p_expected_updated_at then
    raise exception 'Relationship has been modified since it was loaded.';
  end if;

  if v_relationship.owner_user_id is not distinct from p_owner_user_id then
    return v_relationship;
  end if;

  update public.relationships
  set owner_user_id = p_owner_user_id,
      updated_at = now()
  where id = p_relationship_id
    and tenant_id = p_tenant_id
  returning * into v_updated;

  insert into public.recruitment_pipeline_events (
    id,
    tenant_id,
    relationship_id,
    from_stage,
    to_stage,
    event_type,
    actor_user_id,
    reason,
    metadata
  )
  values (
    v_event_id,
    p_tenant_id,
    p_relationship_id,
    v_relationship.pipeline_stage,
    v_relationship.pipeline_stage,
    'owner_changed',
    v_actor,
    p_reason,
    jsonb_build_object('from_owner_user_id', v_relationship.owner_user_id, 'to_owner_user_id', p_owner_user_id)
  );

  insert into public.timeline_events (
    tenant_id,
    event_type,
    title,
    description,
    occurred_at,
    created_by,
    person_id,
    organization_id,
    relationship_id,
    source_type,
    source_id,
    metadata,
    idempotency_key
  )
  values (
    p_tenant_id,
    'relationship_owner_changed',
    'Responsable de relation modifié',
    p_reason,
    now(),
    v_actor,
    v_updated.person_id,
    v_updated.organization_id,
    v_updated.id,
    'relationship',
    v_updated.id,
    jsonb_build_object('from_owner_user_id', v_relationship.owner_user_id, 'to_owner_user_id', p_owner_user_id),
    'relationship_owner:' || v_event_id::text
  );

  return v_updated;
end;
$$;

create or replace function public.set_relationship_do_not_contact(
  p_relationship_id uuid,
  p_tenant_id uuid,
  p_do_not_contact boolean,
  p_justification text,
  p_expected_updated_at timestamptz default null
)
returns public.relationships
language plpgsql
security definer
set search_path = public
as $$
declare
  v_relationship public.relationships%rowtype;
  v_updated public.relationships%rowtype;
  v_actor uuid := auth.uid();
  v_event_id uuid := gen_random_uuid();
begin
  if v_actor is null then
    raise exception 'Authentication required.';
  end if;

  if not public.has_tenant_role(p_tenant_id, array['owner', 'admin', 'recruiter', 'manager']) then
    raise exception 'Insufficient role for do-not-contact change.';
  end if;

  if p_justification is null or length(trim(p_justification)) = 0 then
    raise exception 'Do-not-contact changes require a justification.';
  end if;

  select *
  into v_relationship
  from public.relationships
  where id = p_relationship_id
    and tenant_id = p_tenant_id
  for update;

  if not found then
    raise exception 'Relationship not found.';
  end if;

  if p_expected_updated_at is not null and v_relationship.updated_at <> p_expected_updated_at then
    raise exception 'Relationship has been modified since it was loaded.';
  end if;

  update public.people
  set do_not_contact = p_do_not_contact
  where id = v_relationship.person_id
    and tenant_id = p_tenant_id;

  update public.relationships
  set updated_at = now()
  where id = p_relationship_id
    and tenant_id = p_tenant_id
  returning * into v_updated;

  insert into public.recruitment_pipeline_events (
    id,
    tenant_id,
    relationship_id,
    from_stage,
    to_stage,
    event_type,
    actor_user_id,
    reason,
    metadata
  )
  values (
    v_event_id,
    p_tenant_id,
    p_relationship_id,
    v_relationship.pipeline_stage,
    v_relationship.pipeline_stage,
    'do_not_contact_changed',
    v_actor,
    p_justification,
    jsonb_build_object('do_not_contact', p_do_not_contact)
  );

  insert into public.timeline_events (
    tenant_id,
    event_type,
    title,
    description,
    occurred_at,
    created_by,
    person_id,
    organization_id,
    relationship_id,
    source_type,
    source_id,
    metadata,
    idempotency_key
  )
  values (
    p_tenant_id,
    'relationship_do_not_contact_changed',
    case when p_do_not_contact then 'Ne plus contacter activé' else 'Ne plus contacter levé' end,
    p_justification,
    now(),
    v_actor,
    v_updated.person_id,
    v_updated.organization_id,
    v_updated.id,
    'relationship',
    v_updated.id,
    jsonb_build_object('do_not_contact', p_do_not_contact),
    'relationship_do_not_contact:' || v_event_id::text
  );

  return v_updated;
end;
$$;

grant select, insert on public.recruitment_pipeline_events to authenticated, service_role;
grant execute on function public.transition_recruitment_pipeline(uuid, uuid, text, text, timestamptz, boolean, text, timestamptz, timestamptz, text, text, boolean, timestamptz, boolean, jsonb) to authenticated, service_role;
grant execute on function public.assign_relationship_owner(uuid, uuid, uuid, timestamptz, text) to authenticated, service_role;
grant execute on function public.set_relationship_do_not_contact(uuid, uuid, boolean, text, timestamptz) to authenticated, service_role;
