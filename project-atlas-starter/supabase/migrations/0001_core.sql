create extension if not exists pgcrypto;

create table if not exists tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists people (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  first_name text,
  last_name text,
  display_name text not null,
  primary_email text,
  primary_phone text,
  city text,
  postal_code text,
  department text,
  linkedin_url text,
  source text,
  status text not null default 'a_qualifier',
  talent_types text[] not null default '{}',
  priority text not null default 'moyenne',
  talent_score integer check (talent_score between 0 and 10),
  contact_allowed boolean not null default false,
  do_not_contact boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists people_tenant_email_unique
on people (tenant_id, lower(primary_email))
where primary_email is not null;

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  organization_type text,
  siren text,
  website_url text,
  city text,
  department text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists relationships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  person_id uuid not null references people(id) on delete cascade,
  organization_id uuid references organizations(id) on delete set null,
  relationship_type text not null,
  phase text not null default 'detection',
  status text not null default 'active',
  owner_user_id uuid,
  next_action text,
  next_action_at timestamptz,
  started_at timestamptz default now(),
  ended_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists relationships_person_idx on relationships(person_id);
create index if not exists relationships_org_idx on relationships(organization_id);
