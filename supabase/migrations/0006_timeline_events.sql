create table if not exists public.timeline_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  event_type text not null check (
    event_type in (
      'person_created',
      'organization_created',
      'relationship_created',
      'interaction_created',
      'interaction_updated',
      'task_created',
      'task_completed',
      'task_reopened',
      'task_updated',
      'task_deleted',
      'organization_linked',
      'organization_unlinked'
    )
  ),
  title text not null,
  description text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  person_id uuid references public.people(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  relationship_id uuid references public.relationships(id) on delete set null,
  interaction_id uuid references public.interactions(id) on delete set null,
  task_id uuid references public.tasks(id) on delete set null,
  source_type text not null check (source_type in ('person', 'organization', 'relationship', 'interaction', 'task')),
  source_id uuid not null,
  metadata jsonb not null default '{}'::jsonb,
  visibility text not null default 'tenant' check (visibility in ('tenant')),
  deleted_at timestamptz,
  idempotency_key text not null,
  constraint timeline_events_source_context_check check (
    (source_type = 'person' and person_id = source_id)
    or (source_type = 'organization' and organization_id = source_id)
    or (source_type = 'relationship' and relationship_id = source_id)
    or (source_type = 'interaction' and interaction_id = source_id)
    or (source_type = 'task' and task_id = source_id)
  )
);

create unique index if not exists timeline_events_tenant_idempotency_unique
on public.timeline_events (tenant_id, idempotency_key)
;

create index if not exists timeline_events_tenant_occurred_at_idx on public.timeline_events (tenant_id, occurred_at desc);
create index if not exists timeline_events_tenant_event_type_idx on public.timeline_events (tenant_id, event_type, occurred_at desc);
create index if not exists timeline_events_person_idx on public.timeline_events (tenant_id, person_id, occurred_at desc) where person_id is not null;
create index if not exists timeline_events_organization_idx on public.timeline_events (tenant_id, organization_id, occurred_at desc) where organization_id is not null;
create index if not exists timeline_events_relationship_idx on public.timeline_events (tenant_id, relationship_id, occurred_at desc) where relationship_id is not null;
create index if not exists timeline_events_source_idx on public.timeline_events (tenant_id, source_type, source_id);

alter table public.timeline_events enable row level security;

drop policy if exists timeline_events_select_for_members on public.timeline_events;
create policy timeline_events_select_for_members
on public.timeline_events
for select
to authenticated
using (public.is_tenant_member(tenant_id));

drop policy if exists timeline_events_insert_for_recruiting_roles on public.timeline_events;
create policy timeline_events_insert_for_recruiting_roles
on public.timeline_events
for insert
to authenticated
with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'recruiter', 'manager']));

drop policy if exists timeline_events_soft_delete_for_owners_and_admins on public.timeline_events;
create policy timeline_events_soft_delete_for_owners_and_admins
on public.timeline_events
for update
to authenticated
using (public.has_tenant_role(tenant_id, array['owner', 'admin']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin']));
