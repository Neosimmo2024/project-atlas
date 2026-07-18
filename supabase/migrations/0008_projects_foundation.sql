create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  title text not null,
  short_description text,
  project_type text not null,
  status text not null default 'open',
  stage text not null default 'new',
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  created_by uuid references auth.users(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  person_id uuid references public.people(id) on delete set null,
  relationship_id uuid references public.relationships(id) on delete set null,
  estimated_value numeric(14,2),
  final_value numeric(14,2),
  currency char(3) not null default 'EUR',
  expected_close_at timestamptz,
  won_at timestamptz,
  lost_at timestamptz,
  loss_reason text,
  closing_note text,
  archived_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projects_type_check check (project_type in ('recruitment', 'property_sale', 'rental_management', 'partnership', 'training', 'referral', 'other')),
  constraint projects_status_check check (status in ('open', 'won', 'lost')),
  constraint projects_stage_check check (stage in ('new', 'qualification', 'proposal', 'decision')),
  constraint projects_loss_reason_check check (loss_reason is null or loss_reason in ('price', 'competition', 'abandoned', 'too_long', 'no_response', 'bad_qualification', 'conditions_rejected', 'other')),
  constraint projects_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint projects_estimated_value_check check (estimated_value is null or estimated_value >= 0),
  constraint projects_final_value_check check (final_value is null or final_value >= 0),
  constraint projects_won_fields_check check (
    (status = 'won' and won_at is not null and lost_at is null and loss_reason is null)
    or status <> 'won'
  ),
  constraint projects_lost_fields_check check (
    (status = 'lost' and lost_at is not null and loss_reason is not null and won_at is null)
    or status <> 'lost'
  ),
  constraint projects_open_fields_check check (
    status <> 'open'
    or (won_at is null and lost_at is null and loss_reason is null and final_value is null)
  ),
  constraint projects_loss_other_note_check check (
    loss_reason <> 'other'
    or (closing_note is not null and length(trim(closing_note)) > 0)
  )
);

create unique index if not exists projects_tenant_id_unique
  on public.projects (tenant_id, id);

create index if not exists projects_tenant_active_status_idx
  on public.projects (tenant_id, archived_at, status, stage, updated_at desc);

create index if not exists projects_tenant_owner_idx
  on public.projects (tenant_id, owner_user_id, updated_at desc);

create index if not exists projects_tenant_type_idx
  on public.projects (tenant_id, project_type, status, updated_at desc);

create index if not exists projects_tenant_organization_idx
  on public.projects (tenant_id, organization_id, updated_at desc)
  where organization_id is not null;

create index if not exists projects_tenant_person_idx
  on public.projects (tenant_id, person_id, updated_at desc)
  where person_id is not null;

create index if not exists projects_tenant_relationship_idx
  on public.projects (tenant_id, relationship_id, updated_at desc)
  where relationship_id is not null;

alter table public.tasks
  add column if not exists project_id uuid references public.projects(id) on delete set null;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'tasks_source_check'
      and conrelid = 'public.tasks'::regclass
  ) then
    alter table public.tasks drop constraint tasks_source_check;
  end if;
end;
$$;

alter table public.tasks
  add constraint tasks_source_check check (
    (source_type is null and source_id is null)
    or (source_type in ('manual', 'person', 'organization', 'relationship', 'interaction', 'project') and source_id is not null)
  );

alter table public.interactions
  add column if not exists project_id uuid references public.projects(id) on delete set null;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'interactions_has_target'
      and conrelid = 'public.interactions'::regclass
  ) then
    alter table public.interactions drop constraint interactions_has_target;
  end if;
end;
$$;

alter table public.interactions
  add constraint interactions_has_target
  check (person_id is not null or organization_id is not null or relationship_id is not null or project_id is not null);

alter table public.timeline_events
  add column if not exists project_id uuid references public.projects(id) on delete set null;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'timeline_events_event_type_check'
      and conrelid = 'public.timeline_events'::regclass
  ) then
    alter table public.timeline_events drop constraint timeline_events_event_type_check;
  end if;
end;
$$;

alter table public.timeline_events
  add constraint timeline_events_event_type_check check (
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
      'organization_unlinked',
      'project_created',
      'project_stage_changed',
      'project_owner_changed',
      'project_estimated_value_changed',
      'project_expected_close_changed',
      'project_won',
      'project_lost',
      'project_reopened',
      'project_archived',
      'project_reactivated',
      'project_task_created',
      'project_task_completed',
      'project_interaction_created'
    )
  );

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'timeline_events_source_type_check'
      and conrelid = 'public.timeline_events'::regclass
  ) then
    alter table public.timeline_events drop constraint timeline_events_source_type_check;
  end if;
end;
$$;

alter table public.timeline_events
  add constraint timeline_events_source_type_check
  check (source_type in ('person', 'organization', 'relationship', 'interaction', 'task', 'project'));

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'timeline_events_source_context_check'
      and conrelid = 'public.timeline_events'::regclass
  ) then
    alter table public.timeline_events drop constraint timeline_events_source_context_check;
  end if;
end;
$$;

alter table public.timeline_events
  add constraint timeline_events_source_context_check check (
    (source_type = 'person' and person_id = source_id)
    or (source_type = 'organization' and organization_id = source_id)
    or (source_type = 'relationship' and relationship_id = source_id)
    or (source_type = 'interaction' and interaction_id = source_id)
    or (source_type = 'task' and task_id = source_id)
    or (source_type = 'project' and project_id = source_id)
  );

create index if not exists tasks_tenant_project_idx
  on public.tasks (tenant_id, project_id, due_at)
  where deleted_at is null and project_id is not null;

create index if not exists interactions_tenant_project_idx
  on public.interactions (tenant_id, project_id, interaction_date desc)
  where deleted_at is null and project_id is not null;

create index if not exists timeline_events_project_idx
  on public.timeline_events (tenant_id, project_id, occurred_at desc)
  where project_id is not null;

drop trigger if exists set_projects_updated_at on public.projects;
create trigger set_projects_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

drop trigger if exists audit_projects_changes on public.projects;
create trigger audit_projects_changes
after insert or update or delete on public.projects
for each row execute function public.audit_changes();

create or replace function public.project_references_match_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.owner_user_id is null or not exists (
    select 1 from public.tenant_users tu
    where tu.tenant_id = new.tenant_id
      and tu.user_id = new.owner_user_id
      and tu.status = 'active'
  ) then
    raise exception 'Le responsable du projet est introuvable pour ce tenant.';
  end if;

  if new.person_id is not null and not exists (
    select 1 from public.people p where p.tenant_id = new.tenant_id and p.id = new.person_id
  ) then
    raise exception 'La personne du projet est introuvable pour ce tenant.';
  end if;

  if new.organization_id is not null and not exists (
    select 1 from public.organizations o where o.tenant_id = new.tenant_id and o.id = new.organization_id
  ) then
    raise exception 'L''organisation du projet est introuvable pour ce tenant.';
  end if;

  if new.relationship_id is not null and not exists (
    select 1 from public.relationships r
    where r.tenant_id = new.tenant_id
      and r.id = new.relationship_id
      and (new.person_id is null or r.person_id = new.person_id)
      and (new.organization_id is null or r.organization_id = new.organization_id)
  ) then
    raise exception 'La relation du projet est incoherente pour ce tenant.';
  end if;

  return new;
end;
$$;

drop trigger if exists check_projects_tenant_references on public.projects;
create trigger check_projects_tenant_references
before insert or update on public.projects
for each row execute function public.project_references_match_tenant();

create or replace function public.task_project_matches_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.project_id is not null and not exists (
    select 1 from public.projects p
    where p.tenant_id = new.tenant_id
      and p.id = new.project_id
  ) then
    raise exception 'Le projet de la tache est introuvable pour ce tenant.';
  end if;
  return new;
end;
$$;

drop trigger if exists check_tasks_project_tenant on public.tasks;
create trigger check_tasks_project_tenant
before insert or update on public.tasks
for each row execute function public.task_project_matches_tenant();

create or replace function public.interaction_project_matches_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.project_id is not null and not exists (
    select 1 from public.projects p
    where p.tenant_id = new.tenant_id
      and p.id = new.project_id
  ) then
    raise exception 'Le projet de l''echange est introuvable pour ce tenant.';
  end if;
  return new;
end;
$$;

drop trigger if exists check_interactions_project_tenant on public.interactions;
create trigger check_interactions_project_tenant
before insert or update on public.interactions
for each row execute function public.interaction_project_matches_tenant();

alter table public.projects enable row level security;

grant select, insert, update, delete on public.projects to authenticated;
grant select, insert, update, delete on public.projects to service_role;

drop policy if exists projects_select_for_members on public.projects;
create policy projects_select_for_members
on public.projects
for select
to authenticated
using (public.is_tenant_member(tenant_id));

drop policy if exists projects_insert_for_recruiting_roles on public.projects;
create policy projects_insert_for_recruiting_roles
on public.projects
for insert
to authenticated
with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'recruiter', 'manager']));

drop policy if exists projects_update_for_recruiting_roles on public.projects;
create policy projects_update_for_recruiting_roles
on public.projects
for update
to authenticated
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'recruiter', 'manager']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'recruiter', 'manager']));
