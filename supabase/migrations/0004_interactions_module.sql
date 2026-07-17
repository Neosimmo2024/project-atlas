create table if not exists public.interaction_types (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  slug text not null,
  label text not null,
  sort_order integer not null default 100,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint interaction_types_scope_slug_unique unique (tenant_id, slug)
);

create unique index if not exists interaction_types_system_slug_unique
  on public.interaction_types (slug)
  where tenant_id is null;

insert into public.interaction_types (tenant_id, slug, label, sort_order, is_system)
values
  (null, 'call', 'Appel', 10, true),
  (null, 'video', 'Visio', 20, true),
  (null, 'in_person', 'Presentiel', 30, true),
  (null, 'email', 'Mail', 40, true),
  (null, 'sms', 'SMS', 50, true),
  (null, 'whatsapp', 'WhatsApp', 60, true),
  (null, 'coaching', 'Coaching', 70, true),
  (null, 'training', 'Formation', 80, true),
  (null, 'meeting', 'Reunion', 90, true),
  (null, 'note', 'Note', 100, true)
on conflict (slug) where tenant_id is null do update set
  label = excluded.label,
  sort_order = excluded.sort_order,
  is_system = excluded.is_system,
  updated_at = now();

create table if not exists public.interactions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  person_id uuid references public.people(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  relationship_id uuid references public.relationships(id) on delete set null,
  type_id uuid not null references public.interaction_types(id),
  title text not null,
  summary text,
  interaction_date timestamptz not null default now(),
  duration_minutes integer check (duration_minutes is null or duration_minutes between 0 and 1440),
  location text,
  created_by uuid references auth.users(id) on delete set null,
  change_reason text,
  main_obstacle text,
  timing text,
  dna_compatibility text,
  work_with_person_desire text,
  comments text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'interactions_has_target'
      and conrelid = 'public.interactions'::regclass
  ) then
    alter table public.interactions
      add constraint interactions_has_target
      check (person_id is not null or organization_id is not null or relationship_id is not null);
  end if;
end;
$$;

create index if not exists interaction_types_tenant_sort_idx
  on public.interaction_types (tenant_id, sort_order, label);

create index if not exists interactions_tenant_date_idx
  on public.interactions (tenant_id, interaction_date desc)
  where deleted_at is null;

create index if not exists interactions_tenant_person_idx
  on public.interactions (tenant_id, person_id, interaction_date desc)
  where deleted_at is null and person_id is not null;

create index if not exists interactions_tenant_organization_idx
  on public.interactions (tenant_id, organization_id, interaction_date desc)
  where deleted_at is null and organization_id is not null;

create index if not exists interactions_tenant_relationship_idx
  on public.interactions (tenant_id, relationship_id, interaction_date desc)
  where deleted_at is null and relationship_id is not null;

create index if not exists interactions_tenant_type_idx
  on public.interactions (tenant_id, type_id)
  where deleted_at is null;

create index if not exists interactions_tenant_created_by_idx
  on public.interactions (tenant_id, created_by)
  where deleted_at is null and created_by is not null;

drop trigger if exists set_interaction_types_updated_at on public.interaction_types;
create trigger set_interaction_types_updated_at
before update on public.interaction_types
for each row execute function public.set_updated_at();

drop trigger if exists set_interactions_updated_at on public.interactions;
create trigger set_interactions_updated_at
before update on public.interactions
for each row execute function public.set_updated_at();

drop trigger if exists audit_interactions_changes on public.interactions;
create trigger audit_interactions_changes
after insert or update or delete on public.interactions
for each row execute function public.audit_changes();

alter table public.interaction_types enable row level security;
alter table public.interactions enable row level security;

drop policy if exists interaction_types_select_for_members on public.interaction_types;
create policy interaction_types_select_for_members
on public.interaction_types
for select
to authenticated
using (tenant_id is null or public.is_tenant_member(tenant_id));

drop policy if exists interaction_types_manage_for_owners_and_admins on public.interaction_types;
create policy interaction_types_manage_for_owners_and_admins
on public.interaction_types
for all
to authenticated
using (tenant_id is not null and public.has_tenant_role(tenant_id, array['owner', 'admin']))
with check (tenant_id is not null and public.has_tenant_role(tenant_id, array['owner', 'admin']));

drop policy if exists interactions_select_for_members on public.interactions;
create policy interactions_select_for_members
on public.interactions
for select
to authenticated
using (public.is_tenant_member(tenant_id));

drop policy if exists interactions_insert_for_recruiting_roles on public.interactions;
create policy interactions_insert_for_recruiting_roles
on public.interactions
for insert
to authenticated
with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'recruiter', 'manager']));

drop policy if exists interactions_update_for_recruiting_roles on public.interactions;
create policy interactions_update_for_recruiting_roles
on public.interactions
for update
to authenticated
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'recruiter', 'manager']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'recruiter', 'manager']));

drop policy if exists interactions_delete_for_owners_and_admins on public.interactions;
create policy interactions_delete_for_owners_and_admins
on public.interactions
for delete
to authenticated
using (public.has_tenant_role(tenant_id, array['owner', 'admin']));
