alter table public.organizations
  add column if not exists vat_status text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'organizations_vat_status_allowed'
      and conrelid = 'public.organizations'::regclass
  ) then
    alter table public.organizations
      add constraint organizations_vat_status_allowed
      check (
        vat_status is null
        or vat_status in ('assujetti', 'non_assujetti', 'a_verifier')
      );
  end if;
end;
$$;

create index if not exists organizations_tenant_vat_status_idx
  on public.organizations (tenant_id, vat_status)
  where vat_status is not null;

create or replace function public._csv_import_normalize_vat_status(p_value text)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_normalized text;
begin
  if p_value is null or btrim(p_value) = '' then
    return null;
  end if;

  v_normalized := lower(btrim(p_value));
  v_normalized := translate(
    v_normalized,
    'àáâãäåæçèéêëìíîïñòóôõöùúûüýÿ',
    'aaaaaaaceeeeiiiinooooouuuuyy'
  );
  v_normalized := regexp_replace(v_normalized, '[[:space:]_-]+', ' ', 'g');

  if v_normalized in ('assujetti', 'assujettie', 'oui', 'yes', 'true', 'vrai', 'actif', 'active', '1') then
    return 'assujetti';
  end if;

  if v_normalized in ('non assujetti', 'non assujettie', 'non', 'no', 'false', 'faux', 'inactif', 'inactive', '0') then
    return 'non_assujetti';
  end if;

  if v_normalized in ('a verifier', 'a verifier plus tard', 'verifier', 'a controler', 'a confirmer') then
    return 'a_verifier';
  end if;

  return 'a_verifier';
end;
$$;

revoke execute on function public._csv_import_normalize_vat_status(text) from public, anon, authenticated;

do $$
begin
  if to_regprocedure('public._execute_csv_import_without_vat(uuid,text,text,text,jsonb,uuid,boolean)') is null then
    alter function public.execute_csv_import(uuid, text, text, text, jsonb, uuid, boolean)
      rename to _execute_csv_import_without_vat;
  end if;
end;
$$;

revoke execute on function public._execute_csv_import_without_vat(uuid, text, text, text, jsonb, uuid, boolean)
  from public, anon, authenticated, service_role;

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
  v_report jsonb;
  v_report_rows jsonb := '[]'::jsonb;
  v_report_row jsonb;
  v_input_row jsonb;
  v_line_number integer;
  v_organization_id uuid;
  v_vat_status text;
  v_organization_created boolean;
  v_import_id uuid;
begin
  v_report := public._execute_csv_import_without_vat(
    p_tenant_id,
    p_idempotency_key,
    p_source_name,
    p_analysis_fingerprint,
    p_rows,
    p_actor_user_id,
    p_add_to_pipeline
  );

  v_import_id := public._csv_import_safe_uuid(v_report->>'id');

  for v_report_row in select * from jsonb_array_elements(coalesce(v_report->'rows', '[]'::jsonb))
  loop
    v_line_number := nullif(v_report_row->>'lineNumber', '')::integer;
    v_organization_id := public._csv_import_safe_uuid(v_report_row->>'organizationId');
    v_organization_created := coalesce((v_report_row->>'organizationCreated')::boolean, false);
    v_vat_status := null;

    select public._csv_import_normalize_vat_status(input_row.row_value->'normalizedValues'->>'vat_status')
    into v_vat_status
    from jsonb_array_elements(p_rows) as input_row(row_value)
    where nullif(input_row.row_value->>'lineNumber', '')::integer = v_line_number
    limit 1;

    if v_organization_id is not null and v_vat_status is not null then
      update public.organizations
      set vat_status = v_vat_status
      where id = v_organization_id
        and tenant_id = p_tenant_id
        and (v_organization_created is true or vat_status is null);
    end if;

    if v_vat_status is not null then
      v_report_row := jsonb_set(v_report_row, '{vatStatus}', to_jsonb(v_vat_status), true);
    end if;

    v_report_rows := v_report_rows || v_report_row;
  end loop;

  v_report := jsonb_set(v_report, '{rows}', v_report_rows, true);

  if v_import_id is not null then
    update public.csv_import_runs
    set report = v_report,
        updated_at = now()
    where id = v_import_id
      and tenant_id = p_tenant_id;
  end if;

  return v_report;
end;
$$;

revoke execute on function public.execute_csv_import(uuid, text, text, text, jsonb, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.execute_csv_import(uuid, text, text, text, jsonb, uuid, boolean)
  to service_role;
