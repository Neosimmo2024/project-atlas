alter table public.relationships
  add column if not exists pipeline_stage text,
  add column if not exists score integer,
  add column if not exists confidence integer,
  add column if not exists last_interaction_at timestamptz,
  add column if not exists tags text[] not null default '{}',
  add column if not exists metadata jsonb not null default '{}'::jsonb;

update public.relationships
set pipeline_stage = coalesce(pipeline_stage, phase, 'detection')
where pipeline_stage is null;

alter table public.relationships
  alter column pipeline_stage set default 'detection',
  alter column pipeline_stage set not null;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'relationships'
      and column_name = 'phase'
  ) then
    alter table public.relationships
      drop constraint if exists relationships_phase_check;
  end if;
end;
$$;

do $$
begin
  alter table public.relationships
    drop constraint if exists relationships_relationship_type_check;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'relationships_type_allowed'
      and conrelid = 'public.relationships'::regclass
  ) then
    alter table public.relationships
      add constraint relationships_type_allowed
      check (relationship_type in ('recruiting', 'management', 'partnership', 'customer', 'supplier', 'referrer', 'prospecting'));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'relationships_pipeline_stage_allowed'
      and conrelid = 'public.relationships'::regclass
  ) then
    alter table public.relationships
      add constraint relationships_pipeline_stage_allowed
      check (pipeline_stage in (
        'detection',
        'qualification',
        'first_contact',
        'conversation',
        'meeting',
        'presentation',
        'reflection',
        'negotiation',
        'signature',
        'onboarding',
        'development',
        'ambassador',
        'refusal',
        'closed'
      ));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'relationships_status_allowed'
      and conrelid = 'public.relationships'::regclass
  ) then
    alter table public.relationships
      add constraint relationships_status_allowed
      check (status in ('active', 'paused', 'won', 'lost', 'archived'));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'relationships_score_bounds'
      and conrelid = 'public.relationships'::regclass
  ) then
    alter table public.relationships
      add constraint relationships_score_bounds
      check (score is null or score between 0 and 100);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'relationships_confidence_bounds'
      and conrelid = 'public.relationships'::regclass
  ) then
    alter table public.relationships
      add constraint relationships_confidence_bounds
      check (confidence is null or confidence between 0 and 100);
  end if;
end;
$$;

create unique index if not exists relationships_active_identity_unique
  on public.relationships (tenant_id, person_id, organization_id, relationship_type)
  where status in ('active', 'paused');

create index if not exists relationships_tenant_stage_idx
  on public.relationships (tenant_id, pipeline_stage);

create index if not exists relationships_tenant_status_idx
  on public.relationships (tenant_id, status);

create index if not exists relationships_tenant_type_idx
  on public.relationships (tenant_id, relationship_type);

create index if not exists relationships_tenant_owner_idx
  on public.relationships (tenant_id, owner_user_id)
  where owner_user_id is not null;

drop trigger if exists set_relationships_updated_at on public.relationships;
create trigger set_relationships_updated_at
before update on public.relationships
for each row execute function public.set_updated_at();
