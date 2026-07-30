create table if not exists public.csv_import_cancellations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  import_run_id uuid not null references public.csv_import_runs(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete restrict,
  idempotency_key text not null,
  status text not null default 'processing'
    check (status in ('processing', 'complete', 'partial', 'none', 'failed')),
  people_deleted integer not null default 0 check (people_deleted >= 0),
  people_kept integer not null default 0 check (people_kept >= 0),
  organizations_deleted integer not null default 0 check (organizations_deleted >= 0),
  organizations_kept integer not null default 0 check (organizations_kept >= 0),
  report jsonb not null default '{}'::jsonb,
  failure_message text,
  executed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint csv_import_cancellations_import_unique unique (tenant_id, import_run_id),
  constraint csv_import_cancellations_idempotency_unique unique (tenant_id, idempotency_key)
);

create index if not exists csv_import_cancellations_tenant_created_idx
  on public.csv_import_cancellations (tenant_id, created_at desc);

create index if not exists csv_import_cancellations_import_idx
  on public.csv_import_cancellations (import_run_id);

drop trigger if exists set_csv_import_cancellations_updated_at on public.csv_import_cancellations;
create trigger set_csv_import_cancellations_updated_at
before update on public.csv_import_cancellations
for each row execute function public.set_updated_at();

alter table public.csv_import_cancellations enable row level security;

drop policy if exists csv_import_cancellations_select_for_members on public.csv_import_cancellations;
create policy csv_import_cancellations_select_for_members
on public.csv_import_cancellations
for select
using (public.is_tenant_member(tenant_id));

grant select on table public.csv_import_cancellations to authenticated, service_role;

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
  v_person_id uuid;
  v_organization_id uuid;
  v_people jsonb := '[]'::jsonb;
  v_organizations jsonb := '[]'::jsonb;
  v_people_created_ids uuid[] := '{}';
  v_organization_created_ids uuid[] := '{}';
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
    v_people_created_ids := array_append(v_people_created_ids, (v_row->>'personId')::uuid);
  end loop;

  for v_row in
    select distinct row_value
    from jsonb_array_elements(coalesce(v_run.report->'rows', '[]'::jsonb)) as rows(row_value)
    where row_value->>'organizationCreated' = 'true'
      and nullif(row_value->>'organizationId', '') is not null
  loop
    v_organization_created_ids := array_append(v_organization_created_ids, (v_row->>'organizationId')::uuid);
  end loop;

  if (v_run.people_created > 0 and cardinality(v_people_created_ids) = 0)
    or (v_run.organizations_created > 0 and cardinality(v_organization_created_ids) = 0) then
    v_trace_insufficient := true;
  end if;

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
        and nullif(other_row->>'personId', '')::uuid = v_person.id
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
        and nullif(other_row->>'organizationId', '')::uuid = v_organization.id
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
    'summary', jsonb_build_object(
      'deletable', v_deletable,
      'kept', v_kept,
      'peopleCreated', cardinality(v_people_created_ids),
      'organizationsCreated', cardinality(v_organization_created_ids)
    ),
    'cancellation', case when v_cancellation.id is null then null else to_jsonb(v_cancellation) end
  );
end;
$$;

revoke execute on function public._csv_import_created_entity_report(uuid, uuid) from public, anon, authenticated;

create or replace function public.analyze_csv_import_cancellation(
  p_tenant_id uuid,
  p_import_run_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or auth.uid() <> p_actor_user_id then
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
$$;

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
  v_person jsonb;
  v_organization jsonb;
  v_people_deleted jsonb := '[]'::jsonb;
  v_people_kept jsonb := '[]'::jsonb;
  v_organizations_deleted jsonb := '[]'::jsonb;
  v_organizations_kept jsonb := '[]'::jsonb;
  v_people_deleted_count integer := 0;
  v_people_kept_count integer := 0;
  v_organizations_deleted_count integer := 0;
  v_organizations_kept_count integer := 0;
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

  for v_person in select * from jsonb_array_elements(coalesce(v_analysis->'people', '[]'::jsonb))
  loop
    if (v_person->>'deletable')::boolean then
      delete from public.people
      where id = (v_person->>'id')::uuid
        and tenant_id = p_tenant_id;
      v_people_deleted := v_people_deleted || v_person;
      v_people_deleted_count := v_people_deleted_count + 1;
    else
      v_people_kept := v_people_kept || v_person;
      v_people_kept_count := v_people_kept_count + 1;
    end if;
  end loop;

  for v_organization in select * from jsonb_array_elements(coalesce(v_analysis->'organizations', '[]'::jsonb))
  loop
    if (v_organization->>'deletable')::boolean then
      delete from public.organizations
      where id = (v_organization->>'id')::uuid
        and tenant_id = p_tenant_id;
      v_organizations_deleted := v_organizations_deleted || v_organization;
      v_organizations_deleted_count := v_organizations_deleted_count + 1;
    else
      v_organizations_kept := v_organizations_kept || v_organization;
      v_organizations_kept_count := v_organizations_kept_count + 1;
    end if;
  end loop;

  if v_people_deleted_count + v_organizations_deleted_count = 0 then
    v_final_status := 'none';
  elsif v_people_kept_count + v_organizations_kept_count > 0 then
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
      'organizationsKept', v_organizations_kept_count
    ),
    'peopleDeleted', v_people_deleted,
    'peopleKept', v_people_kept,
    'organizationsDeleted', v_organizations_deleted,
    'organizationsKept', v_organizations_kept,
    'executedAt', now()
  );

  update public.csv_import_cancellations
  set
    status = v_final_status,
    people_deleted = v_people_deleted_count,
    people_kept = v_people_kept_count,
    organizations_deleted = v_organizations_deleted_count,
    organizations_kept = v_organizations_kept_count,
    report = v_report,
    executed_at = now(),
    updated_at = now()
  where id = v_cancellation_id;

  return v_report;
end;
$$;

revoke execute on function public.analyze_csv_import_cancellation(uuid, uuid, uuid) from public, anon;
grant execute on function public.analyze_csv_import_cancellation(uuid, uuid, uuid) to authenticated, service_role;

revoke execute on function public.cancel_csv_import(uuid, uuid, text, uuid, boolean) from public, anon;
grant execute on function public.cancel_csv_import(uuid, uuid, text, uuid, boolean) to authenticated, service_role;
