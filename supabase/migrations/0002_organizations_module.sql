alter table public.organizations
  add column if not exists legal_name text,
  add column if not exists address_line1 text,
  add column if not exists address_line2 text,
  add column if not exists postal_code text,
  add column if not exists country text,
  add column if not exists primary_phone text,
  add column if not exists primary_email text,
  add column if not exists siret text,
  add column if not exists vat_number text,
  add column if not exists parent_organization_id uuid references public.organizations(id) on delete set null,
  add column if not exists source text,
  add column if not exists comments text,
  add column if not exists contact_allowed boolean not null default false,
  add column if not exists do_not_contact boolean not null default false;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'organizations_type_allowed'
      and conrelid = 'public.organizations'::regclass
  ) then
    alter table public.organizations
      add constraint organizations_type_allowed
      check (
        organization_type is null
        or organization_type in (
          'network',
          'agency',
          'independent_agency',
          'franchise',
          'property_management',
          'developer',
          'brokerage',
          'training_company',
          'partner',
          'other'
        )
      ) not valid;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'organizations_not_own_parent'
      and conrelid = 'public.organizations'::regclass
  ) then
    alter table public.organizations
      add constraint organizations_not_own_parent
      check (parent_organization_id is null or parent_organization_id <> id);
  end if;
end;
$$;

create index if not exists organizations_tenant_type_idx
  on public.organizations (tenant_id, organization_type);

create index if not exists organizations_tenant_status_idx
  on public.organizations (tenant_id, status);

create index if not exists organizations_tenant_created_idx
  on public.organizations (tenant_id, created_at desc);

create index if not exists organizations_tenant_siren_idx
  on public.organizations (tenant_id, siren)
  where siren is not null;

create index if not exists organizations_tenant_siret_idx
  on public.organizations (tenant_id, siret)
  where siret is not null;

create index if not exists organizations_tenant_email_idx
  on public.organizations (tenant_id, lower(primary_email))
  where primary_email is not null;

create index if not exists organizations_tenant_phone_idx
  on public.organizations (tenant_id, primary_phone)
  where primary_phone is not null;

create index if not exists organizations_parent_idx
  on public.organizations (tenant_id, parent_organization_id)
  where parent_organization_id is not null;

drop trigger if exists set_organizations_updated_at on public.organizations;
create trigger set_organizations_updated_at
before update on public.organizations
for each row execute function public.set_updated_at();
