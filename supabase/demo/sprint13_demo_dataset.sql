-- Project Atlas Sprint 13 demo dataset.
--
-- Scope:
--   Strictly fictitious, local/QA-only data for the CSV -> Pipeline recipe.
--
-- Required psql variables:
--   atlas_demo_owner_user_id     Existing local auth.users.id UUID.
--   atlas_demo_owner_email       Existing local auth.users.email.
--
-- Optional psql variable:
--   atlas_demo_tenant_name       Defaults to Atlas Sprint 13 Demo Tenant.
--
-- Safety:
--   - Idempotent upserts only.
--   - No DELETE, TRUNCATE, DROP, reset, linked project, or remote connection.
--   - No real personal data. All emails use example.com.

\set ON_ERROR_STOP on

\if :{?atlas_demo_owner_user_id}
\else
\error 'Missing required psql variable atlas_demo_owner_user_id.'
\endif

\if :{?atlas_demo_owner_email}
\else
\error 'Missing required psql variable atlas_demo_owner_email.'
\endif

\if :{?atlas_demo_tenant_name}
\else
\set atlas_demo_tenant_name 'Atlas Sprint 13 Demo Tenant'
\endif

begin;

do $$
declare
  v_owner_user_id uuid := :'atlas_demo_owner_user_id'::uuid;
  v_owner_email text := lower(btrim(:'atlas_demo_owner_email'));
  v_tenant_name text := btrim(:'atlas_demo_tenant_name');
  v_tenant_id uuid := '13000000-0000-4000-8000-000000000001'::uuid;
  v_owner_role_id uuid;
  v_interaction_type_id uuid;
begin
  if not exists (
    select 1 from auth.users
    where id = v_owner_user_id
      and lower(email) = v_owner_email
  ) then
    raise exception 'The supplied demo owner auth user does not exist or email does not match.';
  end if;

  select id into v_owner_role_id
  from public.roles
  where slug = 'owner';

  if v_owner_role_id is null then
    raise exception 'Owner role is missing.';
  end if;

  insert into public.tenants (id, name, status)
  values (v_tenant_id, v_tenant_name, 'active')
  on conflict (id) do update set
    name = excluded.name,
    status = 'active',
    updated_at = now();

  insert into public.profiles (id, full_name, email)
  values (v_owner_user_id, 'Camille Martin Démo', v_owner_email)
  on conflict (id) do update set
    full_name = excluded.full_name,
    email = excluded.email,
    updated_at = now();

  insert into public.tenant_users (tenant_id, user_id, role_id, status)
  values (v_tenant_id, v_owner_user_id, v_owner_role_id, 'active')
  on conflict (tenant_id, user_id) do update set
    role_id = excluded.role_id,
    status = 'active',
    updated_at = now();

  insert into public.organizations (
    id,
    tenant_id,
    name,
    organization_type,
    siren,
    siret,
    primary_email,
    primary_phone,
    city,
    postal_code,
    source,
    status,
    vat_status
  )
  values
    ('13000000-0000-4000-8000-000000000101', v_tenant_id, 'Atlas Démo Réseau Lumière', 'network', '111222333', '11122233300011', 'contact@reseau-lumiere.example.com', '0600000001', 'Paris', '75008', 'dataset sprint 13', 'active', 'assujetti'),
    ('13000000-0000-4000-8000-000000000102', v_tenant_id, 'Atlas Démo Agence Horizon', 'agency', '222333444', '22233344400022', 'contact@agence-horizon.example.com', '0600000002', 'Lyon', '69002', 'dataset sprint 13', 'active', 'non_assujetti'),
    ('13000000-0000-4000-8000-000000000103', v_tenant_id, 'Atlas Démo Cabinet Équinoxe', 'partner', '333444555', '33344455500033', 'contact@cabinet-equinoxe.example.com', '0600000003', 'Nantes', '44000', 'dataset sprint 13', 'active', 'a_verifier'),
    ('13000000-0000-4000-8000-000000000104', v_tenant_id, 'Atlas Démo Relation Autre Type', 'partner', '444555666', '44455566600044', 'contact@relation-autre-type.example.com', '0600000004', 'Bordeaux', '33000', 'dataset sprint 13', 'active', null)
  on conflict (id) do update set
    name = excluded.name,
    organization_type = excluded.organization_type,
    siren = excluded.siren,
    siret = excluded.siret,
    primary_email = excluded.primary_email,
    primary_phone = excluded.primary_phone,
    city = excluded.city,
    postal_code = excluded.postal_code,
    source = excluded.source,
    status = excluded.status,
    vat_status = excluded.vat_status,
    updated_at = now();

  insert into public.people (
    id,
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
    status,
    contact_allowed,
    do_not_contact
  )
  values
    ('13000000-0000-4000-8000-000000000201', v_tenant_id, 'Alice', 'Bernard', 'Alice Bernard', 'alice.bernard@example.com', '0600000101', 'Paris', '75008', 'dataset sprint 13', 'Personne existante pour doublon e-mail.', 'qualified', true, false),
    ('13000000-0000-4000-8000-000000000202', v_tenant_id, 'Bastien', 'Moreau', 'Bastien Moreau', 'bastien.moreau@example.com', '0600000102', 'Lyon', '69002', 'dataset sprint 13', 'Relation recruiting déjà présente.', 'in_relationship', true, false),
    ('13000000-0000-4000-8000-000000000203', v_tenant_id, 'Claire', 'Dubois', 'Claire Dubois', 'claire.dubois@example.com', '0600000103', 'Nantes', '44000', 'dataset sprint 13', 'Relation autre type déjà présente.', 'in_relationship', true, false),
    ('13000000-0000-4000-8000-000000000204', v_tenant_id, 'Denis', 'Petit', 'Denis Petit', 'denis.petit@example.com', '0600000104', 'Bordeaux', '33000', 'dataset sprint 13', 'Contact à ne pas contacter conservé.', 'qualified', false, true)
  on conflict (id) do update set
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    display_name = excluded.display_name,
    primary_email = excluded.primary_email,
    primary_phone = excluded.primary_phone,
    city = excluded.city,
    postal_code = excluded.postal_code,
    source = excluded.source,
    comments = excluded.comments,
    status = excluded.status,
    contact_allowed = excluded.contact_allowed,
    do_not_contact = excluded.do_not_contact,
    updated_at = now();

  insert into public.relationships (
    id,
    tenant_id,
    person_id,
    organization_id,
    relationship_type,
    pipeline_stage,
    status,
    owner_user_id,
    started_at,
    notes,
    metadata
  )
  values
    ('13000000-0000-4000-8000-000000000301', v_tenant_id, '13000000-0000-4000-8000-000000000202', '13000000-0000-4000-8000-000000000102', 'recruiting', 'qualification', 'active', v_owner_user_id, now(), 'Relation recruiting préexistante pour recette CSV.', '{"demo": true}'::jsonb),
    ('13000000-0000-4000-8000-000000000302', v_tenant_id, '13000000-0000-4000-8000-000000000203', '13000000-0000-4000-8000-000000000104', 'partnership', 'detection', 'active', v_owner_user_id, now(), 'Relation autre type à ne pas transformer.', '{"demo": true}'::jsonb)
  on conflict (id) do update set
    relationship_type = excluded.relationship_type,
    pipeline_stage = excluded.pipeline_stage,
    status = excluded.status,
    owner_user_id = excluded.owner_user_id,
    notes = excluded.notes,
    metadata = excluded.metadata,
    updated_at = now();

  insert into public.tasks (
    id,
    tenant_id,
    title,
    description,
    status,
    priority,
    due_at,
    assigned_to,
    created_by,
    person_id,
    organization_id,
    relationship_id,
    source_type,
    source_id,
    reason
  )
  values (
    '13000000-0000-4000-8000-000000000401',
    v_tenant_id,
    'Relancer Bastien Moreau',
    'Tâche fictive protégeant les données préexistantes pendant la recette.',
    'todo',
    'normal',
    now() + interval '2 days',
    v_owner_user_id,
    v_owner_user_id,
    '13000000-0000-4000-8000-000000000202',
    '13000000-0000-4000-8000-000000000102',
    '13000000-0000-4000-8000-000000000301',
    'relationship',
    '13000000-0000-4000-8000-000000000301',
    'dataset sprint 13'
  )
  on conflict (id) do update set
    title = excluded.title,
    description = excluded.description,
    status = excluded.status,
    priority = excluded.priority,
    due_at = excluded.due_at,
    assigned_to = excluded.assigned_to,
    created_by = excluded.created_by,
    person_id = excluded.person_id,
    organization_id = excluded.organization_id,
    relationship_id = excluded.relationship_id,
    source_type = excluded.source_type,
    source_id = excluded.source_id,
    reason = excluded.reason,
    updated_at = now();

  select id into v_interaction_type_id
  from public.interaction_types
  where tenant_id is null
    and slug = 'call'
  limit 1;

  if v_interaction_type_id is not null then
    insert into public.interactions (
      id,
      tenant_id,
      person_id,
      organization_id,
      relationship_id,
      type_id,
      title,
      summary,
      interaction_date,
      created_by,
      metadata
    )
    values (
      '13000000-0000-4000-8000-000000000501',
      v_tenant_id,
      '13000000-0000-4000-8000-000000000202',
      '13000000-0000-4000-8000-000000000102',
      '13000000-0000-4000-8000-000000000301',
      v_interaction_type_id,
      'Appel fictif de recette',
      'Interaction fictive protégeant une relation préexistante.',
      now() - interval '1 day',
      v_owner_user_id,
      '{"demo": true}'::jsonb
    )
    on conflict (id) do update set
      title = excluded.title,
      summary = excluded.summary,
      interaction_date = excluded.interaction_date,
      updated_at = now();
  end if;
end;
$$;

commit;

select
  t.id as tenant_id,
  t.name as tenant_name,
  count(distinct p.id) as people_count,
  count(distinct o.id) as organizations_count,
  count(distinct r.id) as relationships_count
from public.tenants t
left join public.people p on p.tenant_id = t.id
left join public.organizations o on o.tenant_id = t.id
left join public.relationships r on r.tenant_id = t.id
where t.id = '13000000-0000-4000-8000-000000000001'::uuid
group by t.id, t.name;
