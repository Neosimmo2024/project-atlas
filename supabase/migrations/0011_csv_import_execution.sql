create table if not exists public.csv_import_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete restrict,
  idempotency_key text not null,
  source_name text,
  analysis_fingerprint text not null,
  status text not null default 'succeeded'
    check (status in ('succeeded')),
  total_rows integer not null default 0 check (total_rows >= 0),
  people_created integer not null default 0 check (people_created >= 0),
  people_linked integer not null default 0 check (people_linked >= 0),
  organizations_created integer not null default 0 check (organizations_created >= 0),
  organizations_linked integer not null default 0 check (organizations_linked >= 0),
  relationships_created integer not null default 0 check (relationships_created >= 0),
  rows_ignored integer not null default 0 check (rows_ignored >= 0),
  rows_review_later integer not null default 0 check (rows_review_later >= 0),
  rows_rejected integer not null default 0 check (rows_rejected >= 0),
  errors_count integer not null default 0 check (errors_count >= 0),
  report jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint csv_import_runs_tenant_idempotency_unique unique (tenant_id, idempotency_key)
);

create index if not exists csv_import_runs_tenant_created_idx
  on public.csv_import_runs (tenant_id, created_at desc);

alter table public.csv_import_runs enable row level security;

drop policy if exists csv_import_runs_select_for_members on public.csv_import_runs;
create policy csv_import_runs_select_for_members
on public.csv_import_runs
for select
using (public.is_tenant_member(tenant_id));

grant select on table public.csv_import_runs to authenticated, service_role;

create or replace function public.execute_csv_import(
  p_tenant_id uuid,
  p_idempotency_key text,
  p_source_name text,
  p_analysis_fingerprint text,
  p_rows jsonb,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_import_id uuid;
  v_existing public.csv_import_runs%rowtype;
  v_row jsonb;
  v_values jsonb;
  v_decision text;
  v_line_number integer;
  v_person_id uuid;
  v_organization_id uuid;
  v_created_person_id uuid;
  v_created_organization_id uuid;
  v_people_created integer := 0;
  v_people_linked integer := 0;
  v_organizations_created integer := 0;
  v_organizations_linked integer := 0;
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
  if auth.uid() is null or auth.uid() <> p_actor_user_id then
    raise exception 'Authenticated user mismatch.';
  end if;

  if not public.has_tenant_role(p_tenant_id, array['owner', 'admin', 'recruiter', 'manager']) then
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

  insert into public.csv_import_runs (
    tenant_id,
    requested_by,
    idempotency_key,
    source_name,
    analysis_fingerprint,
    total_rows,
    report
  )
  values (
    p_tenant_id,
    p_actor_user_id,
    p_idempotency_key,
    nullif(btrim(coalesce(p_source_name, '')), ''),
    p_analysis_fingerprint,
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
    v_person_id := nullif(v_row->>'targetPersonId', '')::uuid;
    v_organization_id := nullif(v_row->>'targetOrganizationId', '')::uuid;
    v_created_person_id := null;
    v_created_organization_id := null;

    if v_decision = 'ignore_row' then
      if v_row->>'classification' = 'rejected_row' then
        v_rows_rejected := v_rows_rejected + 1;
      else
        v_rows_ignored := v_rows_ignored + 1;
      end if;
      v_rows_report := v_rows_report || jsonb_build_object(
        'lineNumber', v_line_number,
        'decision', v_decision,
        'outcome', case when v_row->>'classification' = 'rejected_row' then 'rejected' else 'ignored' end
      );
      continue;
    elsif v_decision = 'review_later' then
      v_rows_review_later := v_rows_review_later + 1;
      v_rows_report := v_rows_report || jsonb_build_object(
        'lineNumber', v_line_number,
        'decision', v_decision,
        'outcome', 'review_later'
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
      if v_person_id is not null then
        v_people_linked := v_people_linked + 1;
      end if;
      if v_organization_id is not null then
        v_organizations_linked := v_organizations_linked + 1;
      end if;
      v_rows_report := v_rows_report || jsonb_build_object(
        'lineNumber', v_line_number,
        'decision', v_decision,
        'outcome', 'linked',
        'personId', v_person_id,
        'organizationId', v_organization_id
      );
      continue;
    end if;

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

    v_rows_report := v_rows_report || jsonb_build_object(
      'lineNumber', v_line_number,
      'decision', v_decision,
      'outcome', 'created',
      'personId', v_person_id,
      'organizationId', v_organization_id,
      'personCreated', v_created_person_id is not null,
      'organizationCreated', v_created_organization_id is not null
    );
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
      'relationshipsCreated', 0,
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
    relationships_created = 0,
    rows_ignored = v_rows_ignored,
    rows_review_later = v_rows_review_later,
    rows_rejected = v_rows_rejected,
    errors_count = jsonb_array_length(v_errors),
    report = v_report,
    updated_at = now()
  where id = v_import_id;

  return v_report;
exception
  when others then
    raise;
end;
$$;

grant execute on function public.execute_csv_import(uuid, text, text, text, jsonb, uuid) to authenticated, service_role;
