create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'active'
    check (status in ('active', 'suspended', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique
    check (slug in ('owner', 'admin', 'recruiter', 'manager', 'reader')),
  label text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.roles (slug, label)
values
  ('owner', 'Owner'),
  ('admin', 'Admin'),
  ('recruiter', 'Recruiter'),
  ('manager', 'Manager'),
  ('reader', 'Reader')
on conflict (slug) do update set
  label = excluded.label,
  updated_at = now();

create table if not exists public.tenant_users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role_id uuid not null references public.roles(id),
  status text not null default 'active'
    check (status in ('active', 'invited', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_users_tenant_user_unique unique (tenant_id, user_id)
);

create table if not exists public.people (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  first_name text,
  last_name text,
  display_name text not null,
  primary_email text,
  primary_phone text,
  city text,
  postal_code text,
  department text,
  linkedin_url text,
  job_title text,
  comments text,
  source text,
  status text not null default 'to_qualify'
    check (status in ('to_qualify', 'qualified', 'contacted', 'in_relationship', 'rejected', 'archived')),
  talent_types text[] not null default '{}',
  priority text not null default 'medium'
    check (priority in ('low', 'medium', 'high')),
  talent_score integer check (talent_score between 0 and 10),
  contact_allowed boolean not null default false,
  do_not_contact boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists people_tenant_email_unique
  on public.people (tenant_id, lower(primary_email))
  where primary_email is not null;

create unique index if not exists people_tenant_phone_unique
  on public.people (tenant_id, primary_phone)
  where primary_phone is not null;

create index if not exists people_tenant_name_city_idx
  on public.people (tenant_id, lower(first_name), lower(last_name), lower(city));

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  organization_type text,
  siren text,
  website_url text,
  city text,
  department text,
  status text not null default 'active'
    check (status in ('active', 'inactive', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists organizations_tenant_name_city_unique
  on public.organizations (tenant_id, lower(name), lower(coalesce(city, '')));

create table if not exists public.relationships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  relationship_type text not null
    check (relationship_type in ('recruiting', 'partnership', 'prospecting')),
  phase text not null default 'detection'
    check (phase in ('detection', 'qualification', 'contact', 'interview', 'follow_up', 'closed')),
  status text not null default 'active'
    check (status in ('active', 'paused', 'won', 'lost', 'archived')),
  owner_user_id uuid references auth.users(id) on delete set null,
  next_action text,
  next_action_at timestamptz,
  started_at timestamptz default now(),
  ended_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists relationships_tenant_idx
  on public.relationships (tenant_id);

create index if not exists relationships_person_idx
  on public.relationships (person_id);

create index if not exists relationships_organization_idx
  on public.relationships (organization_id);

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  table_name text not null,
  record_id uuid not null,
  action text not null check (action in ('insert', 'update', 'delete')),
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_log_tenant_created_idx
  on public.audit_log (tenant_id, created_at desc);

create or replace function public.audit_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_tenant_id uuid;
  target_record_id uuid;
begin
  target_tenant_id := coalesce(new.tenant_id, old.tenant_id);
  target_record_id := coalesce(new.id, old.id);

  insert into public.audit_log (
    tenant_id,
    user_id,
    table_name,
    record_id,
    action,
    old_value,
    new_value
  )
  values (
    target_tenant_id,
    auth.uid(),
    tg_table_name,
    target_record_id,
    lower(tg_op),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );

  return coalesce(new, old);
end;
$$;

create or replace function public.is_tenant_member(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tenant_users tu
    where tu.tenant_id = target_tenant_id
      and tu.user_id = auth.uid()
      and tu.status = 'active'
  );
$$;

create or replace function public.has_tenant_role(target_tenant_id uuid, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tenant_users tu
    join public.roles r on r.id = tu.role_id
    where tu.tenant_id = target_tenant_id
      and tu.user_id = auth.uid()
      and tu.status = 'active'
      and r.slug = any(allowed_roles)
  );
$$;

drop trigger if exists set_tenants_updated_at on public.tenants;
create trigger set_tenants_updated_at
before update on public.tenants
for each row execute function public.set_updated_at();

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_roles_updated_at on public.roles;
create trigger set_roles_updated_at
before update on public.roles
for each row execute function public.set_updated_at();

drop trigger if exists set_tenant_users_updated_at on public.tenant_users;
create trigger set_tenant_users_updated_at
before update on public.tenant_users
for each row execute function public.set_updated_at();

drop trigger if exists set_people_updated_at on public.people;
create trigger set_people_updated_at
before update on public.people
for each row execute function public.set_updated_at();

drop trigger if exists set_organizations_updated_at on public.organizations;
create trigger set_organizations_updated_at
before update on public.organizations
for each row execute function public.set_updated_at();

drop trigger if exists set_relationships_updated_at on public.relationships;
create trigger set_relationships_updated_at
before update on public.relationships
for each row execute function public.set_updated_at();

drop trigger if exists audit_tenant_users_changes on public.tenant_users;
create trigger audit_tenant_users_changes
after insert or update or delete on public.tenant_users
for each row execute function public.audit_changes();

drop trigger if exists audit_people_changes on public.people;
create trigger audit_people_changes
after insert or update or delete on public.people
for each row execute function public.audit_changes();

drop trigger if exists audit_organizations_changes on public.organizations;
create trigger audit_organizations_changes
after insert or update or delete on public.organizations
for each row execute function public.audit_changes();

drop trigger if exists audit_relationships_changes on public.relationships;
create trigger audit_relationships_changes
after insert or update or delete on public.relationships
for each row execute function public.audit_changes();

alter table public.tenants enable row level security;
alter table public.profiles enable row level security;
alter table public.roles enable row level security;
alter table public.tenant_users enable row level security;
alter table public.people enable row level security;
alter table public.organizations enable row level security;
alter table public.relationships enable row level security;
alter table public.audit_log enable row level security;

drop policy if exists tenants_select_for_members on public.tenants;
create policy tenants_select_for_members
on public.tenants
for select
to authenticated
using (public.is_tenant_member(id));

drop policy if exists tenants_update_for_owners_and_admins on public.tenants;
create policy tenants_update_for_owners_and_admins
on public.tenants
for update
to authenticated
using (public.has_tenant_role(id, array['owner', 'admin']))
with check (public.has_tenant_role(id, array['owner', 'admin']));

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
on public.profiles
for select
to authenticated
using (id = auth.uid());

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own
on public.profiles
for insert
to authenticated
with check (id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists roles_select_for_authenticated on public.roles;
create policy roles_select_for_authenticated
on public.roles
for select
to authenticated
using (true);

drop policy if exists tenant_users_select_for_members on public.tenant_users;
create policy tenant_users_select_for_members
on public.tenant_users
for select
to authenticated
using (public.is_tenant_member(tenant_id));

drop policy if exists tenant_users_manage_for_owners_and_admins on public.tenant_users;
create policy tenant_users_manage_for_owners_and_admins
on public.tenant_users
for all
to authenticated
using (public.has_tenant_role(tenant_id, array['owner', 'admin']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin']));

drop policy if exists people_select_for_members on public.people;
create policy people_select_for_members
on public.people
for select
to authenticated
using (public.is_tenant_member(tenant_id));

drop policy if exists people_insert_for_recruiting_roles on public.people;
create policy people_insert_for_recruiting_roles
on public.people
for insert
to authenticated
with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'recruiter', 'manager']));

drop policy if exists people_update_for_recruiting_roles on public.people;
create policy people_update_for_recruiting_roles
on public.people
for update
to authenticated
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'recruiter', 'manager']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'recruiter', 'manager']));

drop policy if exists people_delete_for_owners_and_admins on public.people;
create policy people_delete_for_owners_and_admins
on public.people
for delete
to authenticated
using (public.has_tenant_role(tenant_id, array['owner', 'admin']));

drop policy if exists organizations_select_for_members on public.organizations;
create policy organizations_select_for_members
on public.organizations
for select
to authenticated
using (public.is_tenant_member(tenant_id));

drop policy if exists organizations_insert_for_recruiting_roles on public.organizations;
create policy organizations_insert_for_recruiting_roles
on public.organizations
for insert
to authenticated
with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'recruiter', 'manager']));

drop policy if exists organizations_update_for_recruiting_roles on public.organizations;
create policy organizations_update_for_recruiting_roles
on public.organizations
for update
to authenticated
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'recruiter', 'manager']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'recruiter', 'manager']));

drop policy if exists organizations_delete_for_owners_and_admins on public.organizations;
create policy organizations_delete_for_owners_and_admins
on public.organizations
for delete
to authenticated
using (public.has_tenant_role(tenant_id, array['owner', 'admin']));

drop policy if exists relationships_select_for_members on public.relationships;
create policy relationships_select_for_members
on public.relationships
for select
to authenticated
using (public.is_tenant_member(tenant_id));

drop policy if exists relationships_insert_for_recruiting_roles on public.relationships;
create policy relationships_insert_for_recruiting_roles
on public.relationships
for insert
to authenticated
with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'recruiter', 'manager']));

drop policy if exists relationships_update_for_recruiting_roles on public.relationships;
create policy relationships_update_for_recruiting_roles
on public.relationships
for update
to authenticated
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'recruiter', 'manager']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'recruiter', 'manager']));

drop policy if exists relationships_delete_for_owners_and_admins on public.relationships;
create policy relationships_delete_for_owners_and_admins
on public.relationships
for delete
to authenticated
using (public.has_tenant_role(tenant_id, array['owner', 'admin']));

drop policy if exists audit_log_select_for_members on public.audit_log;
create policy audit_log_select_for_members
on public.audit_log
for select
to authenticated
using (public.is_tenant_member(tenant_id));

drop policy if exists audit_log_insert_for_members on public.audit_log;
create policy audit_log_insert_for_members
on public.audit_log
for insert
to authenticated
with check (public.is_tenant_member(tenant_id));
