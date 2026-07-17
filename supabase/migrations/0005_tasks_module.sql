create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'todo',
  priority text not null default 'normal',
  due_at timestamptz,
  completed_at timestamptz,
  assigned_to uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  person_id uuid references public.people(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  relationship_id uuid references public.relationships(id) on delete set null,
  interaction_id uuid references public.interactions(id) on delete set null,
  source_type text,
  source_id uuid,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint tasks_status_check check (status in ('todo', 'in_progress', 'waiting', 'completed', 'cancelled')),
  constraint tasks_priority_check check (priority in ('low', 'normal', 'high', 'critical')),
  constraint tasks_completed_at_check check (
    (status = 'completed' and completed_at is not null)
    or (status <> 'completed' and completed_at is null)
  ),
  constraint tasks_source_check check (
    (source_type is null and source_id is null)
    or (source_type in ('manual', 'person', 'organization', 'relationship', 'interaction') and source_id is not null)
  )
);

create index if not exists tasks_tenant_status_idx
  on public.tasks (tenant_id, status, due_at)
  where deleted_at is null;

create index if not exists tasks_tenant_priority_idx
  on public.tasks (tenant_id, priority, due_at)
  where deleted_at is null;

create index if not exists tasks_tenant_due_idx
  on public.tasks (tenant_id, due_at)
  where deleted_at is null;

create index if not exists tasks_tenant_assigned_idx
  on public.tasks (tenant_id, assigned_to, due_at)
  where deleted_at is null and assigned_to is not null;

create index if not exists tasks_tenant_person_idx
  on public.tasks (tenant_id, person_id, due_at)
  where deleted_at is null and person_id is not null;

create index if not exists tasks_tenant_organization_idx
  on public.tasks (tenant_id, organization_id, due_at)
  where deleted_at is null and organization_id is not null;

create index if not exists tasks_tenant_relationship_idx
  on public.tasks (tenant_id, relationship_id, due_at)
  where deleted_at is null and relationship_id is not null;

create index if not exists tasks_tenant_interaction_idx
  on public.tasks (tenant_id, interaction_id, due_at)
  where deleted_at is null and interaction_id is not null;

create index if not exists tasks_tenant_source_idx
  on public.tasks (tenant_id, source_type, source_id)
  where deleted_at is null and source_type is not null and source_id is not null;

drop trigger if exists set_tasks_updated_at on public.tasks;
create trigger set_tasks_updated_at
before update on public.tasks
for each row execute function public.set_updated_at();

drop trigger if exists audit_tasks_changes on public.tasks;
create trigger audit_tasks_changes
after insert or update or delete on public.tasks
for each row execute function public.audit_changes();

alter table public.tasks enable row level security;

drop policy if exists tasks_select_for_members on public.tasks;
create policy tasks_select_for_members
on public.tasks
for select
to authenticated
using (public.is_tenant_member(tenant_id));

drop policy if exists tasks_insert_for_recruiting_roles on public.tasks;
create policy tasks_insert_for_recruiting_roles
on public.tasks
for insert
to authenticated
with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'recruiter', 'manager']));

drop policy if exists tasks_update_for_recruiting_roles on public.tasks;
create policy tasks_update_for_recruiting_roles
on public.tasks
for update
to authenticated
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'recruiter', 'manager']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'recruiter', 'manager']));

drop policy if exists tasks_delete_for_owners_and_admins on public.tasks;
create policy tasks_delete_for_owners_and_admins
on public.tasks
for delete
to authenticated
using (public.has_tenant_role(tenant_id, array['owner', 'admin']));
