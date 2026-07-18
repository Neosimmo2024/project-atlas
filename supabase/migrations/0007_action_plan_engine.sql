alter table public.tasks
  add column if not exists snoozed_until timestamptz,
  add column if not exists snooze_count integer not null default 0 check (snooze_count >= 0),
  add column if not exists last_snoozed_at timestamptz;

create index if not exists tasks_tenant_snoozed_idx
  on public.tasks (tenant_id, snoozed_until)
  where deleted_at is null and snoozed_until is not null;

create unique index if not exists organizations_tenant_id_id_unique
  on public.organizations (tenant_id, id);

create table if not exists public.action_plan_decisions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  recommendation_key text not null,
  decision_type text not null check (decision_type in ('ignored', 'snoozed', 'converted_to_task', 'completed')),
  snoozed_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint action_plan_decisions_snooze_check check (
    decision_type <> 'snoozed'
    or snoozed_until is not null
  ),
  constraint action_plan_decisions_tenant_organization_fkey foreign key (tenant_id, organization_id)
    references public.organizations (tenant_id, id)
    on delete cascade
    deferrable initially immediate
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'action_plan_decisions_tenant_organization_fkey'
      and conrelid = 'public.action_plan_decisions'::regclass
  ) then
    alter table public.action_plan_decisions
      add constraint action_plan_decisions_tenant_organization_fkey
      foreign key (tenant_id, organization_id)
      references public.organizations (tenant_id, id)
      on delete cascade
      deferrable initially immediate;
  end if;
end;
$$;

create unique index if not exists action_plan_decisions_unique
  on public.action_plan_decisions (tenant_id, organization_id, user_id, recommendation_key);

create index if not exists action_plan_decisions_tenant_user_idx
  on public.action_plan_decisions (tenant_id, user_id, organization_id, decision_type);

drop trigger if exists set_action_plan_decisions_updated_at on public.action_plan_decisions;
create trigger set_action_plan_decisions_updated_at
before update on public.action_plan_decisions
for each row execute function public.set_updated_at();

drop trigger if exists audit_action_plan_decisions_changes on public.action_plan_decisions;
create trigger audit_action_plan_decisions_changes
after insert or update or delete on public.action_plan_decisions
for each row execute function public.audit_changes();

alter table public.action_plan_decisions enable row level security;

drop policy if exists action_plan_decisions_select_own_for_members on public.action_plan_decisions;
create policy action_plan_decisions_select_own_for_members
on public.action_plan_decisions
for select
to authenticated
using (
  user_id = auth.uid()
  and public.is_tenant_member(tenant_id)
  and exists (
    select 1
    from public.organizations organizations
    where organizations.id = action_plan_decisions.organization_id
      and organizations.tenant_id = action_plan_decisions.tenant_id
      and public.is_tenant_member(organizations.tenant_id)
  )
);

drop policy if exists action_plan_decisions_insert_own_for_recruiting_roles on public.action_plan_decisions;
create policy action_plan_decisions_insert_own_for_recruiting_roles
on public.action_plan_decisions
for insert
to authenticated
with check (
  user_id = auth.uid()
  and public.has_tenant_role(tenant_id, array['owner', 'admin', 'recruiter', 'manager'])
  and exists (
    select 1
    from public.organizations organizations
    where organizations.id = action_plan_decisions.organization_id
      and organizations.tenant_id = action_plan_decisions.tenant_id
      and public.has_tenant_role(organizations.tenant_id, array['owner', 'admin', 'recruiter', 'manager'])
  )
);

drop policy if exists action_plan_decisions_update_own_for_recruiting_roles on public.action_plan_decisions;
create policy action_plan_decisions_update_own_for_recruiting_roles
on public.action_plan_decisions
for update
to authenticated
using (
  user_id = auth.uid()
  and public.has_tenant_role(tenant_id, array['owner', 'admin', 'recruiter', 'manager'])
  and exists (
    select 1
    from public.organizations organizations
    where organizations.id = action_plan_decisions.organization_id
      and organizations.tenant_id = action_plan_decisions.tenant_id
      and public.has_tenant_role(organizations.tenant_id, array['owner', 'admin', 'recruiter', 'manager'])
  )
)
with check (
  user_id = auth.uid()
  and public.has_tenant_role(tenant_id, array['owner', 'admin', 'recruiter', 'manager'])
  and exists (
    select 1
    from public.organizations organizations
    where organizations.id = action_plan_decisions.organization_id
      and organizations.tenant_id = action_plan_decisions.tenant_id
      and public.has_tenant_role(organizations.tenant_id, array['owner', 'admin', 'recruiter', 'manager'])
  )
);
