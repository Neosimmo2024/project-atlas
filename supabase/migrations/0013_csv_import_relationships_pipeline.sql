alter table public.csv_import_cancellations
  add column if not exists relationships_deleted integer not null default 0 check (relationships_deleted >= 0),
  add column if not exists relationships_kept integer not null default 0 check (relationships_kept >= 0);

create or replace function public._csv_import_actor_has_tenant_role(
  p_tenant_id uuid,
  p_actor_user_id uuid,
  p_allowed_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.tenant_users tu
    join public.roles r on r.id = tu.role_id
    where tu.tenant_id = p_tenant_id
      and tu.user_id = p_actor_user_id
      and tu.status = 'active'
      and r.slug = any(p_allowed_roles)
  );
$$;

revoke execute on function public._csv_import_actor_has_tenant_role(uuid, uuid, text[]) from public, anon, authenticated;

create or replace function public._csv_import_safe_uuid(p_value text)
returns uuid
language plpgsql
immutable
set search_path = public, pg_temp
as $$
begin
  if p_value is null or btrim(p_value) = '' then
    return null;
  end if;

  return p_value::uuid;
exception
  when invalid_text_representation then
    return null;
end;
$$;

revoke execute on function public._csv_import_safe_uuid(text) from public, anon, authenticated;

create or replace function public.execute_csv_import(
  p_tenant_id uuid,
  p_idempotency_key text,
  p_source_name text,
  p_analysis_fingerprint text,
  p_rows jsonb,
  p_actor_user_id uuid,
  p_add_to_pipeline boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_import_id uuid;
  v_existing public.csv_import_runs%rowtype;
  v_payload_fingerprint text;
  v_rows_fingerprint text;
  v_existing_pipeline_enabled boolean;
  v_row jsonb;
  v_values jsonb;
  v_decision text;
  v_line_number integer;
  v_person_id uuid;
  v_organization_id uuid;
  v_created_person_id uuid;
  v_created_organization_id uuid;
  v_relationship_id uuid;
  v_relationship_created boolean;
  v_relationship_linked boolean;
  v_relationship_outcome text;
  v_relationship_reason text;
  v_relationship_trace jsonb;
  v_people_created integer := 0;
  v_people_linked integer := 0;
  v_organizations_created integer := 0;
  v_organizations_linked integer := 0;
  v_relationships_created integer := 0;
  v_relationships_linked integer := 0;
  v_relationships_skipped integer := 0;
  v_rows_ignored integer := 0;
  v_rows_review_later integer := 0;
  v_rows_rejected integer := 0;
  v_errors jsonb := '[]'::jsonb;
  v_rows_report jsonb := '[]'::jsonb;
  v_report jsonb;
  v_display_name text;
  v_email text;
  v_phone text;
  v_first_name text;
  v_last_name text;
  v_city text;
  v_postal_code text;
  v_source text;
  v_comments text;
  v_organization_name text;
  v_organization_siren text;
  v_organization_siret text;
  v_organization_email text;
  v_organization_phone text;
begin
  if p_actor_user_id is null or not public._csv_import_actor_has_tenant_role(p_tenant_id, p_actor_user_id, array['owner', 'admin', 'recruiter', 'manager']) then
    raise exception 'Action non autorisee.';
  end if;

  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'Idempotency key is required.';
  end if;

  if p_analysis_fingerprint is null or btrim(p_analysis_fingerprint) = '' then
    raise exception 'Analysis fingerprint is required.';
  end if;

  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Rows payload must be a JSON array.';
  end if;

  v_rows_fingerprint := md5(p_rows::text);
  v_payload_fingerprint := md5(jsonb_build_object(
    'rows', p_rows,
    'addToPipeline', coalesce(p_add_to_pipeline, false)
  )::text);

  insert into public.csv_import_runs (
    tenant_id,
    requested_by,
    idempotency_key,
    source_name,
    analysis_fingerprint,
    payload_fingerprint,
    total_rows,
    report
  )
  values (
    p_tenant_id,
    p_actor_user_id,
    p_idempotency_key,
    nullif(btrim(coalesce(p_source_name, '')), ''),
    p_analysis_fingerprint,
    v_payload_fingerprint,
    jsonb_array_length(p_rows),
    jsonb_build_object('status', 'processing')
  )
  on conflict (tenant_id, idempotency_key) do nothing
  returning id into v_import_id;

  if v_import_id is null then
    select *
    into v_existing
    from public.csv_import_runs
    where tenant_id = p_tenant_id
      and idempotency_key = p_idempotency_key;

    v_existing_pipeline_enabled := coalesce((v_existing.report->'summary'->>'pipelineIntegrationEnabled')::boolean, false);

    if v_existing.analysis_fingerprint <> p_analysis_fingerprint
      or v_existing.total_rows <> jsonb_array_length(p_rows)
      or not (
        v_existing.payload_fingerprint = v_payload_fingerprint
        or (
          p_add_to_pipeline is not true
          and v_existing_pipeline_enabled is false
          and v_existing.payload_fingerprint = v_rows_fingerprint
        )
      ) then
      raise exception 'Idempotency key already belongs to a different import payload.';
    end if;

    return v_existing.report || jsonb_build_object(
      'id', v_existing.id,
      'idempotent', true,
      'createdAt', v_existing.created_at
    );
  end if;

  for v_row in select * from jsonb_array_elements(p_rows)
  loop
    v_line_number := coalesce((v_row->>'lineNumber')::integer, 0);
    v_decision := v_row->>'decision';
    v_values := coalesce(v_row->'normalizedValues', '{}'::jsonb);
    v_person_id := public._csv_import_safe_uuid(v_row->>'targetPersonId');
    v_organization_id := public._csv_import_safe_uuid(v_row->>'targetOrganizationId');
    v_created_person_id := null;
    v_created_organization_id := null;
    v_relationship_id := null;
    v_relationship_created := false;
    v_relationship_linked := false;
    v_relationship_outcome := case when p_add_to_pipeline is true then 'not_created' else 'disabled' end;
    v_relationship_reason := case when p_add_to_pipeline is true then null else 'pipeline_option_disabled' end;
    v_relationship_trace := null;

    if v_decision = 'ignore_row' then
      if v_row->>'classification' = 'rejected_row' then
        v_rows_rejected := v_rows_rejected + 1;
      else
        v_rows_ignored := v_rows_ignored + 1;
      end if;
      v_rows_report := v_rows_report || jsonb_build_object(
        'lineNumber', v_line_number,
        'decision', v_decision,
        'outcome', case when v_row->>'classification' = 'rejected_row' then 'rejected' else 'ignored' end,
        'relationshipOutcome', v_relationship_outcome,
        'relationshipReason', v_relationship_reason
      );
      continue;
    elsif v_decision = 'review_later' then
      v_rows_review_later := v_rows_review_later + 1;
      v_rows_report := v_rows_report || jsonb_build_object(
        'lineNumber', v_line_number,
        'decision', v_decision,
        'outcome', 'review_later',
        'relationshipOutcome', v_relationship_outcome,
        'relationshipReason', v_relationship_reason
      );
      continue;
    elsif v_decision not in ('create_new', 'link_existing') then
      raise exception 'Unsupported import decision for line %.', v_line_number;
    end if;

    if v_person_id is not null and not exists (
      select 1 from public.people
      where id = v_person_id
        and tenant_id = p_tenant_id
    ) then
      raise exception 'Person target is not accessible for line %.', v_line_number;
    end if;

    if v_organization_id is not null and not exists (
      select 1 from public.organizations
      where id = v_organization_id
        and tenant_id = p_tenant_id
    ) then
      raise exception 'Organization target is not accessible for line %.', v_line_number;
    end if;

    if v_decision = 'link_existing' then
      if v_person_id is null and v_organization_id is null then
        raise exception 'Line % must include an accessible target to link.', v_line_number;
      end if;

      if v_person_id is not null then
        v_people_linked := v_people_linked + 1;
      end if;
      if v_organization_id is not null then
        v_organizations_linked := v_organizations_linked + 1;
      end if;
    else
      v_email := nullif(v_values->>'email', '');
      v_phone := nullif(v_values->>'phone', '');
      v_first_name := nullif(v_values->>'first_name', '');
      v_last_name := nullif(v_values->>'last_name', '');
      v_city := nullif(v_values->>'city', '');
      v_postal_code := nullif(v_values->>'postal_code', '');
      v_source := nullif(v_values->>'source', '');
      v_comments := nullif(v_values->>'comments', '');
      v_organization_name := nullif(v_values->>'organization', '');
      v_organization_siren := nullif(v_values->>'organization_siren', '');
      v_organization_siret := nullif(v_values->>'organization_siret', '');
      v_organization_email := nullif(v_values->>'organization_email', '');
      v_organization_phone := nullif(v_values->>'organization_phone', '');

      if v_email is null and v_phone is null then
        raise exception 'Line % must include an email or phone.', v_line_number;
      end if;

      if v_organization_id is null and v_organization_name is not null then
        select id
        into v_organization_id
        from public.organizations
        where tenant_id = p_tenant_id
          and (
            (v_organization_siren is not null and siren = v_organization_siren)
            or (v_organization_siret is not null and siret = v_organization_siret)
            or (v_organization_email is not null and lower(primary_email) = lower(v_organization_email))
            or (lower(name) = lower(v_organization_name) and lower(coalesce(city, '')) = lower(coalesce(v_city, '')))
          )
        order by created_at asc, id asc
        limit 1;

        if v_organization_id is null then
          insert into public.organizations (
            tenant_id,
            name,
            siren,
            siret,
            primary_email,
            primary_phone,
            city,
            postal_code,
            source,
            status
          )
          values (
            p_tenant_id,
            v_organization_name,
            v_organization_siren,
            v_organization_siret,
            v_organization_email,
            v_organization_phone,
            v_city,
            v_postal_code,
            v_source,
            'active'
          )
          returning id into v_organization_id;
          v_created_organization_id := v_organization_id;
          v_organizations_created := v_organizations_created + 1;
        else
          v_organizations_linked := v_organizations_linked + 1;
        end if;
      end if;

      select id
      into v_person_id
      from public.people
      where tenant_id = p_tenant_id
        and (
          (v_email is not null and lower(primary_email) = lower(v_email))
          or (v_phone is not null and primary_phone = v_phone)
        )
      order by created_at asc, id asc
      limit 1;

      if v_person_id is null then
        v_display_name := nullif(btrim(coalesce(v_first_name, '') || ' ' || coalesce(v_last_name, '')), '');
        if v_display_name is null then
          v_display_name := coalesce(v_email, v_phone, 'Contact import CSV');
        end if;

        insert into public.people (
          tenant_id,
          first_name,
          last_name,
          display_name,
          primary_email,
          primary_phone,
          city,
          postal_code,
          source,
          comments,
          contact_allowed,
          do_not_contact,
          talent_types
        )
        values (
          p_tenant_id,
          v_first_name,
          v_last_name,
          v_display_name,
          v_email,
          v_phone,
          v_city,
          v_postal_code,
          v_source,
          v_comments,
          false,
          false,
          '{}'::text[]
        )
        returning id into v_person_id;
        v_created_person_id := v_person_id;
        v_people_created := v_people_created + 1;
      else
        v_people_linked := v_people_linked + 1;
      end if;
    end if;

    if p_add_to_pipeline is true then
      if v_person_id is null then
        v_relationship_reason := 'missing_person';
        v_relationships_skipped := v_relationships_skipped + 1;
      elsif v_organization_id is null then
        v_relationship_reason := 'missing_organization';
        v_relationships_skipped := v_relationships_skipped + 1;
      else
        select id
        into v_relationship_id
        from public.relationships
        where tenant_id = p_tenant_id
          and person_id = v_person_id
          and organization_id = v_organization_id
          and relationship_type = 'recruiting'
          and status in ('active', 'paused')
        order by created_at asc, id asc
        limit 1;

        if v_relationship_id is not null then
          v_relationship_linked := true;
          v_relationship_outcome := 'existing';
          v_relationship_reason := 'existing_relationship';
          v_relationships_linked := v_relationships_linked + 1;
        elsif exists (
          select 1
          from public.relationships
          where tenant_id = p_tenant_id
            and person_id = v_person_id
            and organization_id = v_organization_id
            and relationship_type <> 'recruiting'
            and status in ('active', 'paused')
        ) then
          v_relationship_reason := 'different_type_exists';
          v_relationships_skipped := v_relationships_skipped + 1;
        else
          insert into public.relationships (
            tenant_id,
            person_id,
            organization_id,
            relationship_type,
            pipeline_stage,
            status,
            owner_user_id,
            started_at,
            metadata
          )
          values (
            p_tenant_id,
            v_person_id,
            v_organization_id,
            'recruiting',
            'detection',
            'active',
            null,
            now(),
            jsonb_build_object(
              'csv_import', jsonb_build_object(
                'importRunId', v_import_id,
                'lineNumber', v_line_number,
                'relationshipType', 'recruiting',
                'pipelineStage', 'detection'
              )
            )
          )
          returning id into v_relationship_id;

          v_relationship_created := true;
          v_relationship_outcome := 'created';
          v_relationships_created := v_relationships_created + 1;
          v_relationship_trace := jsonb_build_object(
            'importRunId', v_import_id,
            'lineNumber', v_line_number,
            'tenantId', p_tenant_id,
            'personId', v_person_id,
            'organizationId', v_organization_id,
            'relationshipType', 'recruiting',
            'pipelineStage', 'detection',
            'createdBy', p_actor_user_id
          );
        end if;
      end if;
    end if;

    v_rows_report := v_rows_report || jsonb_strip_nulls(jsonb_build_object(
      'lineNumber', v_line_number,
      'decision', v_decision,
      'outcome', case when v_created_person_id is not null or v_created_organization_id is not null or v_relationship_created then 'created' else 'linked' end,
      'personId', v_person_id,
      'organizationId', v_organization_id,
      'personCreated', v_created_person_id is not null,
      'organizationCreated', v_created_organization_id is not null,
      'relationshipId', v_relationship_id,
      'relationshipCreated', v_relationship_created,
      'relationshipLinked', v_relationship_linked,
      'relationshipOutcome', v_relationship_outcome,
      'relationshipReason', v_relationship_reason,
      'relationshipTrace', v_relationship_trace
    ));
  end loop;

  v_report := jsonb_build_object(
    'id', v_import_id,
    'idempotent', false,
    'sourceName', p_source_name,
    'analysisFingerprint', p_analysis_fingerprint,
    'summary', jsonb_build_object(
      'totalRows', jsonb_array_length(p_rows),
      'peopleCreated', v_people_created,
      'peopleLinked', v_people_linked,
      'organizationsCreated', v_organizations_created,
      'organizationsLinked', v_organizations_linked,
      'relationshipsCreated', v_relationships_created,
      'relationshipsLinked', v_relationships_linked,
      'relationshipsSkipped', v_relationships_skipped,
      'pipelineIntegrationEnabled', p_add_to_pipeline is true,
      'rowsIgnored', v_rows_ignored,
      'rowsReviewLater', v_rows_review_later,
      'rowsRejected', v_rows_rejected,
      'errorsCount', jsonb_array_length(v_errors)
    ),
    'rows', v_rows_report,
    'errors', v_errors,
    'createdAt', now()
  );

  update public.csv_import_runs
  set
    people_created = v_people_created,
    people_linked = v_people_linked,
    organizations_created = v_organizations_created,
    organizations_linked = v_organizations_linked,
    relationships_created = v_relationships_created,
    rows_ignored = v_rows_ignored,
    rows_review_later = v_rows_review_later,
    rows_rejected = v_rows_rejected,
    errors_count = jsonb_array_length(v_errors),
    report = v_report,
    updated_at = now()
  where id = v_import_id;

  return v_report;
end;
$$;

revoke execute on function public.execute_csv_import(uuid, text, text, text, jsonb, uuid) from public, anon, authenticated, service_role;
revoke execute on function public.execute_csv_import(uuid, text, text, text, jsonb, uuid, boolean) from public, anon, authenticated;
grant execute on function public.execute_csv_import(uuid, text, text, text, jsonb, uuid, boolean) to service_role;

create or replace function public._csv_import_created_entity_report(
  p_tenant_id uuid,
  p_import_run_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_run public.csv_import_runs%rowtype;
  v_cancellation public.csv_import_cancellations%rowtype;
  v_row jsonb;
  v_person public.people%rowtype;
  v_organization public.organizations%rowtype;
  v_relationship public.relationships%rowtype;
  v_person_id uuid;
  v_organization_id uuid;
  v_relationship_id uuid;
  v_trace_person_id uuid;
  v_trace_organization_id uuid;
  v_people jsonb := '[]'::jsonb;
  v_organizations jsonb := '[]'::jsonb;
  v_relationships jsonb := '[]'::jsonb;
  v_people_created_ids uuid[] := '{}';
  v_organization_created_ids uuid[] := '{}';
  v_relationship_traces jsonb := '[]'::jsonb;
  v_deletable integer := 0;
  v_kept integer := 0;
  v_trace_insufficient boolean := false;
  v_reason text;
begin
  select *
  into v_run
  from public.csv_import_runs
  where id = p_import_run_id
    and tenant_id = p_tenant_id;

  if not found then
    raise exception 'Import introuvable.';
  end if;

  select *
  into v_cancellation
  from public.csv_import_cancellations
  where tenant_id = p_tenant_id
    and import_run_id = p_import_run_id;

  for v_row in
    select distinct row_value
    from jsonb_array_elements(coalesce(v_run.report->'rows', '[]'::jsonb)) as rows(row_value)
    where row_value->>'personCreated' = 'true'
      and nullif(row_value->>'personId', '') is not null
  loop
    v_person_id := public._csv_import_safe_uuid(v_row->>'personId');
    if v_person_id is null then
      v_trace_insufficient := true;
    elsif v_person_id <> all(v_people_created_ids) then
      v_people_created_ids := array_append(v_people_created_ids, v_person_id);
    end if;
  end loop;

  for v_row in
    select distinct row_value
    from jsonb_array_elements(coalesce(v_run.report->'rows', '[]'::jsonb)) as rows(row_value)
    where row_value->>'organizationCreated' = 'true'
      and nullif(row_value->>'organizationId', '') is not null
  loop
    v_organization_id := public._csv_import_safe_uuid(v_row->>'organizationId');
    if v_organization_id is null then
      v_trace_insufficient := true;
    elsif v_organization_id <> all(v_organization_created_ids) then
      v_organization_created_ids := array_append(v_organization_created_ids, v_organization_id);
    end if;
  end loop;

  for v_row in
    select distinct row_value
    from jsonb_array_elements(coalesce(v_run.report->'rows', '[]'::jsonb)) as rows(row_value)
    where row_value->>'relationshipCreated' = 'true'
      and nullif(row_value->>'relationshipId', '') is not null
  loop
    v_relationship_id := public._csv_import_safe_uuid(v_row->>'relationshipId');
    v_trace_person_id := public._csv_import_safe_uuid(v_row->>'personId');
    v_trace_organization_id := public._csv_import_safe_uuid(v_row->>'organizationId');

    if v_relationship_id is null or v_trace_person_id is null or v_trace_organization_id is null then
      v_trace_insufficient := true;
    else
      v_relationship_traces := v_relationship_traces || jsonb_build_object(
        'id', v_relationship_id,
        'personId', v_trace_person_id,
        'organizationId', v_trace_organization_id,
        'lineNumber', v_row->>'lineNumber'
      );
    end if;
  end loop;

  if (v_run.people_created > 0 and cardinality(v_people_created_ids) = 0)
    or (v_run.organizations_created > 0 and cardinality(v_organization_created_ids) = 0)
    or (v_run.relationships_created > 0 and jsonb_array_length(v_relationship_traces) = 0) then
    v_trace_insufficient := true;
  end if;

  for v_row in select * from jsonb_array_elements(v_relationship_traces)
  loop
    v_relationship_id := public._csv_import_safe_uuid(v_row->>'id');
    v_trace_person_id := public._csv_import_safe_uuid(v_row->>'personId');
    v_trace_organization_id := public._csv_import_safe_uuid(v_row->>'organizationId');
    v_relationship := null;

    select *
    into v_relationship
    from public.relationships
    where id = v_relationship_id;

    v_reason := null;
    if not found then
      v_reason := 'deja_absente';
    elsif v_relationship.tenant_id <> p_tenant_id then
      v_reason := 'appartient_a_un_autre_tenant';
    elsif v_relationship.person_id <> v_trace_person_id or v_relationship.organization_id <> v_trace_organization_id then
      v_reason := 'trace_contradictoire';
    elsif v_relationship.relationship_type <> 'recruiting' then
      v_reason := 'relation_type_different';
    elsif v_relationship.pipeline_stage <> 'detection' then
      v_reason := 'phase_modifiee_apres_import';
    elsif v_relationship.status <> 'active' then
      v_reason := 'statut_modifie_apres_import';
    elsif v_relationship.owner_user_id is not null then
      v_reason := 'responsable_modifie';
    elsif v_relationship.updated_at <> v_relationship.created_at then
      v_reason := 'modifiee_apres_import';
    elsif exists (select 1 from public.tasks where tenant_id = p_tenant_id and relationship_id = v_relationship.id and deleted_at is null) then
      v_reason := 'dependance_task';
    elsif exists (select 1 from public.interactions where tenant_id = p_tenant_id and relationship_id = v_relationship.id and deleted_at is null) then
      v_reason := 'dependance_interaction';
    elsif exists (select 1 from public.projects where tenant_id = p_tenant_id and relationship_id = v_relationship.id) then
      v_reason := 'dependance_project';
    elsif exists (select 1 from public.timeline_events where tenant_id = p_tenant_id and relationship_id = v_relationship.id and deleted_at is null) then
      v_reason := 'dependance_timeline';
    elsif exists (select 1 from public.recruitment_pipeline_events where tenant_id = p_tenant_id and relationship_id = v_relationship.id) then
      v_reason := 'dependance_pipeline_event';
    elsif exists (
      select 1
      from public.csv_import_runs other_run,
        jsonb_array_elements(coalesce(other_run.report->'rows', '[]'::jsonb)) as other_rows(other_row)
      where other_run.tenant_id = p_tenant_id
        and other_run.id <> p_import_run_id
        and public._csv_import_safe_uuid(other_row->>'relationshipId') = v_relationship.id
    ) then
      v_reason := 'utilisee_par_un_autre_import';
    end if;

    if v_reason is null then
      v_deletable := v_deletable + 1;
      v_relationships := v_relationships || jsonb_build_object('id', v_relationship.id, 'label', 'Relation de recrutement', 'deletable', true, 'reason', null);
    else
      v_kept := v_kept + 1;
      v_relationships := v_relationships || jsonb_build_object('id', v_relationship_id, 'label', 'Relation de recrutement', 'deletable', false, 'reason', v_reason);
    end if;
  end loop;

  foreach v_person_id in array v_people_created_ids
  loop
    v_person := null;
    select *
    into v_person
    from public.people
    where id = v_person_id;

    v_reason := null;
    if not found then
      v_reason := 'deja_absente';
    elsif v_person.tenant_id <> p_tenant_id then
      v_reason := 'appartient_a_un_autre_tenant';
    elsif v_person.updated_at <> v_person.created_at then
      v_reason := 'modifiee_apres_import';
    elsif exists (select 1 from public.relationships where tenant_id = p_tenant_id and person_id = v_person.id) then
      v_reason := 'dependance_relationship';
    elsif exists (select 1 from public.tasks where tenant_id = p_tenant_id and person_id = v_person.id and deleted_at is null) then
      v_reason := 'dependance_task';
    elsif exists (select 1 from public.interactions where tenant_id = p_tenant_id and person_id = v_person.id and deleted_at is null) then
      v_reason := 'dependance_interaction';
    elsif exists (select 1 from public.projects where tenant_id = p_tenant_id and person_id = v_person.id) then
      v_reason := 'dependance_project';
    elsif exists (select 1 from public.timeline_events where tenant_id = p_tenant_id and person_id = v_person.id and deleted_at is null) then
      v_reason := 'dependance_timeline';
    elsif exists (
      select 1
      from public.csv_import_runs other_run,
        jsonb_array_elements(coalesce(other_run.report->'rows', '[]'::jsonb)) as other_rows(other_row)
      where other_run.tenant_id = p_tenant_id
        and other_run.id <> p_import_run_id
        and public._csv_import_safe_uuid(other_row->>'personId') = v_person.id
    ) then
      v_reason := 'utilisee_par_un_autre_import';
    end if;

    if v_reason is null then
      v_deletable := v_deletable + 1;
      v_people := v_people || jsonb_build_object('id', v_person.id, 'label', v_person.display_name, 'deletable', true, 'reason', null);
    else
      v_kept := v_kept + 1;
      v_people := v_people || jsonb_build_object('id', v_person_id, 'label', coalesce(v_person.display_name, 'Personne'), 'deletable', false, 'reason', v_reason);
    end if;
  end loop;

  foreach v_organization_id in array v_organization_created_ids
  loop
    v_organization := null;
    select *
    into v_organization
    from public.organizations
    where id = v_organization_id;

    v_reason := null;
    if not found then
      v_reason := 'deja_absente';
    elsif v_organization.tenant_id <> p_tenant_id then
      v_reason := 'appartient_a_un_autre_tenant';
    elsif v_organization.updated_at <> v_organization.created_at then
      v_reason := 'modifiee_apres_import';
    elsif exists (select 1 from public.organizations where tenant_id = p_tenant_id and parent_organization_id = v_organization.id) then
      v_reason := 'dependance_organisation_enfant';
    elsif exists (select 1 from public.relationships where tenant_id = p_tenant_id and organization_id = v_organization.id) then
      v_reason := 'dependance_relationship';
    elsif exists (select 1 from public.tasks where tenant_id = p_tenant_id and organization_id = v_organization.id and deleted_at is null) then
      v_reason := 'dependance_task';
    elsif exists (select 1 from public.interactions where tenant_id = p_tenant_id and organization_id = v_organization.id and deleted_at is null) then
      v_reason := 'dependance_interaction';
    elsif exists (select 1 from public.projects where tenant_id = p_tenant_id and organization_id = v_organization.id) then
      v_reason := 'dependance_project';
    elsif exists (select 1 from public.timeline_events where tenant_id = p_tenant_id and organization_id = v_organization.id and deleted_at is null) then
      v_reason := 'dependance_timeline';
    elsif exists (select 1 from public.action_plan_decisions where tenant_id = p_tenant_id and organization_id = v_organization.id) then
      v_reason := 'dependance_action_plan';
    elsif exists (
      select 1
      from public.csv_import_runs other_run,
        jsonb_array_elements(coalesce(other_run.report->'rows', '[]'::jsonb)) as other_rows(other_row)
      where other_run.tenant_id = p_tenant_id
        and other_run.id <> p_import_run_id
        and public._csv_import_safe_uuid(other_row->>'organizationId') = v_organization.id
    ) then
      v_reason := 'utilisee_par_un_autre_import';
    end if;

    if v_reason is null then
      v_deletable := v_deletable + 1;
      v_organizations := v_organizations || jsonb_build_object('id', v_organization.id, 'label', v_organization.name, 'deletable', true, 'reason', null);
    else
      v_kept := v_kept + 1;
      v_organizations := v_organizations || jsonb_build_object('id', v_organization_id, 'label', coalesce(v_organization.name, 'Organisation'), 'deletable', false, 'reason', v_reason);
    end if;
  end loop;

  return jsonb_build_object(
    'importId', v_run.id,
    'status',
      case
        when v_cancellation.id is not null and v_cancellation.status in ('complete', 'partial', 'none') then 'already_cancelled'
        when v_cancellation.id is not null and v_cancellation.status = 'processing' then 'cancellation_in_progress'
        when v_cancellation.id is not null and v_cancellation.status = 'failed' then 'cancellation_failed'
        when v_trace_insufficient then 'not_cancellable'
        when v_deletable > 0 and v_kept = 0 then 'cancellable'
        when v_deletable > 0 and v_kept > 0 then 'partially_cancellable'
        when v_deletable = 0 and v_kept > 0 then 'not_cancellable'
        else 'no_action_needed'
      end,
    'traceInsufficient', v_trace_insufficient,
    'people', v_people,
    'organizations', v_organizations,
    'relationships', v_relationships,
    'summary', jsonb_build_object(
      'deletable', v_deletable,
      'kept', v_kept,
      'peopleCreated', cardinality(v_people_created_ids),
      'organizationsCreated', cardinality(v_organization_created_ids),
      'relationshipsCreated', jsonb_array_length(v_relationship_traces)
    ),
    'cancellation', case when v_cancellation.id is null then null else to_jsonb(v_cancellation) end
  );
end;
$$;

revoke execute on function public._csv_import_created_entity_report(uuid, uuid) from public, anon, authenticated;

create or replace function public.cancel_csv_import(
  p_tenant_id uuid,
  p_import_run_id uuid,
  p_idempotency_key text,
  p_actor_user_id uuid,
  p_confirm boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
  if auth.uid() is null or auth.uid() <> p_actor_user_id then
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
$$;

revoke execute on function public.cancel_csv_import(uuid, uuid, text, uuid, boolean) from public, anon;
grant execute on function public.cancel_csv_import(uuid, uuid, text, uuid, boolean) to authenticated, service_role;
