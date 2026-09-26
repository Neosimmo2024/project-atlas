-- Fail closed on explicit NULL confirmation and ambiguous tenant context.
-- CREATE OR REPLACE preserves the restricted EXECUTE grants from hardening.

CREATE OR REPLACE FUNCTION public.transition_recruitment_pipeline(p_relationship_id uuid, p_tenant_id uuid, p_to_stage text, p_expected_stage text DEFAULT NULL::text, p_expected_updated_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_confirmed boolean DEFAULT false, p_reason text DEFAULT NULL::text, p_signature_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_start_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_rejection_reason text DEFAULT NULL::text, p_rejection_comment text DEFAULT NULL::text, p_rejection_recontactable boolean DEFAULT NULL::boolean, p_rejection_follow_up_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_do_not_contact boolean DEFAULT NULL::boolean, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS relationships
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    if p_confirmed is not true or p_signature_at is null then
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
    if p_confirmed is not true or p_reason is null or length(trim(p_reason)) = 0 then
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
$function$

CREATE OR REPLACE FUNCTION public.manage_tenant_member(p_target_user_id uuid, p_action text, p_role_slug text DEFAULT NULL::text)
 RETURNS TABLE(tenant_user_id uuid, tenant_id uuid, user_id uuid, role_slug text, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actor_user_id uuid := auth.uid();
  v_actor_tenant_id uuid;
  v_actor_role text;
  v_target_tenant_user_id uuid;
  v_target_tenant_id uuid;
  v_target_role text;
  v_target_status text;
  v_new_role_id uuid;
  v_active_owner_count integer;
begin
  if v_actor_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  if p_action is null or p_action not in ('change_role', 'suspend', 'reactivate') then
    raise exception 'TENANT_MEMBER_ACTION_NOT_ALLOWED' using errcode = '22023';
  end if;

  if (select count(*) from public.tenant_users
      where user_id = v_actor_user_id and status = 'active') <> 1 then
    raise exception 'TENANT_CONTEXT_AMBIGUOUS' using errcode = '42501';
  end if;

  select tu.tenant_id, r.slug
  into v_actor_tenant_id, v_actor_role
  from public.tenant_users tu
  join public.roles r on r.id = tu.role_id
  where tu.user_id = v_actor_user_id
    and tu.status = 'active'
  order by tu.created_at asc
  limit 1;

  if v_actor_tenant_id is null or v_actor_role not in ('owner', 'admin') then
    raise exception 'TENANT_MEMBER_FORBIDDEN' using errcode = '42501';
  end if;

  perform 1
  from public.tenants t
  where t.id = v_actor_tenant_id
  for update;

  select tu.id, tu.tenant_id, r.slug, tu.status
  into v_target_tenant_user_id, v_target_tenant_id, v_target_role, v_target_status
  from public.tenant_users tu
  join public.roles r on r.id = tu.role_id
  where tu.tenant_id = v_actor_tenant_id
    and tu.user_id = p_target_user_id
  for update of tu;

  if v_target_tenant_user_id is null then
    raise exception 'TENANT_MEMBER_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_target_status = 'invited' then
    raise exception 'TENANT_MEMBER_INVITED_NOT_MANAGED' using errcode = '22023';
  end if;

  if p_action = 'suspend' and p_target_user_id = v_actor_user_id then
    raise exception 'TENANT_MEMBER_SELF_SUSPEND_FORBIDDEN' using errcode = '42501';
  end if;

  if v_actor_role = 'admin' then
    if v_target_role = 'owner' then
      raise exception 'TENANT_MEMBER_OWNER_PROTECTED' using errcode = '42501';
    end if;

    if p_action = 'change_role' and p_role_slug = 'owner' then
      raise exception 'TENANT_MEMBER_OWNER_ROLE_FORBIDDEN' using errcode = '42501';
    end if;
  end if;

  if p_action = 'change_role' then
    if p_role_slug is null or p_role_slug not in ('owner', 'admin', 'recruiter', 'manager', 'reader') then
      raise exception 'TENANT_MEMBER_ROLE_NOT_ALLOWED' using errcode = '22023';
    end if;

    if v_target_role = 'owner' and p_role_slug <> 'owner' and v_target_status = 'active' then
      select count(*)
      into v_active_owner_count
      from public.tenant_users tu
      join public.roles r on r.id = tu.role_id
      where tu.tenant_id = v_actor_tenant_id
        and tu.status = 'active'
        and r.slug = 'owner';

      if v_active_owner_count <= 1 then
        raise exception 'TENANT_MEMBER_LAST_OWNER_PROTECTED' using errcode = '42501';
      end if;
    end if;

    select r.id
    into v_new_role_id
    from public.roles r
    where r.slug = p_role_slug;

    if v_new_role_id is null then
      raise exception 'TENANT_MEMBER_ROLE_NOT_FOUND' using errcode = 'P0002';
    end if;

    update public.tenant_users
    set role_id = v_new_role_id
    where id = v_target_tenant_user_id;
  elsif p_action = 'suspend' then
    if v_target_status = 'active' and v_target_role = 'owner' then
      select count(*)
      into v_active_owner_count
      from public.tenant_users tu
      join public.roles r on r.id = tu.role_id
      where tu.tenant_id = v_actor_tenant_id
        and tu.status = 'active'
        and r.slug = 'owner';

      if v_active_owner_count <= 1 then
        raise exception 'TENANT_MEMBER_LAST_OWNER_PROTECTED' using errcode = '42501';
      end if;
    end if;

    update public.tenant_users
    set status = 'suspended'
    where id = v_target_tenant_user_id;
  elsif p_action = 'reactivate' then
    update public.tenant_users
    set status = 'active'
    where id = v_target_tenant_user_id;
  end if;

  return query
  select tu.id, tu.tenant_id, tu.user_id, r.slug, tu.status
  from public.tenant_users tu
  join public.roles r on r.id = tu.role_id
  where tu.id = v_target_tenant_user_id;
end;
$function$

CREATE OR REPLACE FUNCTION public.analyze_csv_import_cancellation(p_tenant_id uuid, p_import_run_id uuid, p_actor_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if auth.uid() is null or auth.uid() is distinct from p_actor_user_id then
    raise exception 'Authenticated user mismatch.';
  end if;

  if not public.has_tenant_role(p_tenant_id, array['owner', 'admin']) then
    raise exception 'Action non autorisee.';
  end if;

  if not exists (select 1 from public.csv_import_runs where id = p_import_run_id and tenant_id = p_tenant_id) then
    raise exception 'Import introuvable.';
  end if;

  return public._csv_import_created_entity_report(p_tenant_id, p_import_run_id);
end;
$function$

CREATE OR REPLACE FUNCTION public.cancel_csv_import(p_tenant_id uuid, p_import_run_id uuid, p_idempotency_key text, p_actor_user_id uuid, p_confirm boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_run public.csv_import_runs%rowtype;
  v_existing public.csv_import_cancellations%rowtype;
  v_other public.csv_import_cancellations%rowtype;
  v_cancellation_id uuid;
  v_analysis jsonb;
  v_entity jsonb;
  v_people_deleted jsonb := '[]'::jsonb;
  v_people_kept jsonb := '[]'::jsonb;
  v_organizations_deleted jsonb := '[]'::jsonb;
  v_organizations_kept jsonb := '[]'::jsonb;
  v_relationships_deleted jsonb := '[]'::jsonb;
  v_relationships_kept jsonb := '[]'::jsonb;
  v_people_deleted_count integer := 0;
  v_people_kept_count integer := 0;
  v_organizations_deleted_count integer := 0;
  v_organizations_kept_count integer := 0;
  v_relationships_deleted_count integer := 0;
  v_relationships_kept_count integer := 0;
  v_final_status text;
  v_report jsonb;
begin
  if auth.uid() is null or auth.uid() is distinct from p_actor_user_id then
    raise exception 'Authenticated user mismatch.';
  end if;

  if p_confirm is not true then
    raise exception 'Confirmation requise.';
  end if;

  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'Idempotency key is required.';
  end if;

  if not public.has_tenant_role(p_tenant_id, array['owner', 'admin']) then
    raise exception 'Action non autorisee.';
  end if;

  select *
  into v_run
  from public.csv_import_runs
  where id = p_import_run_id
    and tenant_id = p_tenant_id
  for update;

  if not found then
    raise exception 'Import introuvable.';
  end if;

  select *
  into v_existing
  from public.csv_import_cancellations
  where tenant_id = p_tenant_id
    and import_run_id = p_import_run_id;

  if found then
    if v_existing.idempotency_key <> p_idempotency_key then
      raise exception 'Cet import possede deja une annulation avec une autre cle.';
    end if;

    return v_existing.report || jsonb_build_object(
      'id', v_existing.id,
      'idempotent', true,
      'status', v_existing.status
    );
  end if;

  select *
  into v_other
  from public.csv_import_cancellations
  where tenant_id = p_tenant_id
    and idempotency_key = p_idempotency_key
    and import_run_id <> p_import_run_id;

  if found then
    raise exception 'Idempotency key already belongs to a different cancellation.';
  end if;

  v_analysis := public._csv_import_created_entity_report(p_tenant_id, p_import_run_id);

  if v_analysis->>'status' not in ('cancellable', 'partially_cancellable', 'no_action_needed') then
    raise exception 'Annulation non autorisee pour cet import.';
  end if;

  insert into public.csv_import_cancellations (
    tenant_id,
    import_run_id,
    requested_by,
    idempotency_key,
    status,
    report
  )
  values (
    p_tenant_id,
    p_import_run_id,
    p_actor_user_id,
    p_idempotency_key,
    'processing',
    jsonb_build_object('status', 'processing')
  )
  returning id into v_cancellation_id;

  for v_entity in select * from jsonb_array_elements(coalesce(v_analysis->'relationships', '[]'::jsonb))
  loop
    if (v_entity->>'deletable')::boolean then
      delete from public.relationships
      where id = public._csv_import_safe_uuid(v_entity->>'id')
        and tenant_id = p_tenant_id;
      v_relationships_deleted := v_relationships_deleted || v_entity;
      v_relationships_deleted_count := v_relationships_deleted_count + 1;
    else
      v_relationships_kept := v_relationships_kept || v_entity;
      v_relationships_kept_count := v_relationships_kept_count + 1;
    end if;
  end loop;

  v_analysis := public._csv_import_created_entity_report(p_tenant_id, p_import_run_id);

  for v_entity in select * from jsonb_array_elements(coalesce(v_analysis->'people', '[]'::jsonb))
  loop
    if (v_entity->>'deletable')::boolean then
      delete from public.people
      where id = public._csv_import_safe_uuid(v_entity->>'id')
        and tenant_id = p_tenant_id;
      v_people_deleted := v_people_deleted || v_entity;
      v_people_deleted_count := v_people_deleted_count + 1;
    else
      v_people_kept := v_people_kept || v_entity;
      v_people_kept_count := v_people_kept_count + 1;
    end if;
  end loop;

  for v_entity in select * from jsonb_array_elements(coalesce(v_analysis->'organizations', '[]'::jsonb))
  loop
    if (v_entity->>'deletable')::boolean then
      delete from public.organizations
      where id = public._csv_import_safe_uuid(v_entity->>'id')
        and tenant_id = p_tenant_id;
      v_organizations_deleted := v_organizations_deleted || v_entity;
      v_organizations_deleted_count := v_organizations_deleted_count + 1;
    else
      v_organizations_kept := v_organizations_kept || v_entity;
      v_organizations_kept_count := v_organizations_kept_count + 1;
    end if;
  end loop;

  if v_people_deleted_count + v_organizations_deleted_count + v_relationships_deleted_count = 0 then
    v_final_status := 'none';
  elsif v_people_kept_count + v_organizations_kept_count + v_relationships_kept_count > 0 then
    v_final_status := 'partial';
  else
    v_final_status := 'complete';
  end if;

  v_report := jsonb_build_object(
    'id', v_cancellation_id,
    'importId', p_import_run_id,
    'idempotent', false,
    'status', v_final_status,
    'summary', jsonb_build_object(
      'peopleDeleted', v_people_deleted_count,
      'peopleKept', v_people_kept_count,
      'organizationsDeleted', v_organizations_deleted_count,
      'organizationsKept', v_organizations_kept_count,
      'relationshipsDeleted', v_relationships_deleted_count,
      'relationshipsKept', v_relationships_kept_count
    ),
    'peopleDeleted', v_people_deleted,
    'peopleKept', v_people_kept,
    'organizationsDeleted', v_organizations_deleted,
    'organizationsKept', v_organizations_kept,
    'relationshipsDeleted', v_relationships_deleted,
    'relationshipsKept', v_relationships_kept,
    'executedAt', now()
  );

  update public.csv_import_cancellations
  set
    status = v_final_status,
    people_deleted = v_people_deleted_count,
    people_kept = v_people_kept_count,
    organizations_deleted = v_organizations_deleted_count,
    organizations_kept = v_organizations_kept_count,
    relationships_deleted = v_relationships_deleted_count,
    relationships_kept = v_relationships_kept_count,
    report = v_report,
    executed_at = now(),
    updated_at = now()
  where id = v_cancellation_id;

  return v_report;
end;
$function$
