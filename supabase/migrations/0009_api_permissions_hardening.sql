-- Harden API-facing privileges for a fresh local Supabase database.
-- These grants only allow PostgREST to reach the tables; RLS policies remain
-- the authority for row-level access decisions.

alter table public.tenants enable row level security;
alter table public.profiles enable row level security;
alter table public.roles enable row level security;
alter table public.tenant_users enable row level security;
alter table public.people enable row level security;
alter table public.organizations enable row level security;
alter table public.relationships enable row level security;
alter table public.audit_log enable row level security;
alter table public.interaction_types enable row level security;
alter table public.interactions enable row level security;
alter table public.tasks enable row level security;
alter table public.timeline_events enable row level security;
alter table public.action_plan_decisions enable row level security;
alter table public.projects enable row level security;

grant usage on schema public to anon, authenticated, service_role;

grant select on table public.roles to authenticated, service_role;

grant select, update on table public.tenants to authenticated;
grant select, insert, update on table public.tenants to service_role;

grant select, insert, update on table public.profiles to authenticated, service_role;

grant select, insert, update, delete on table public.tenant_users to authenticated, service_role;

grant select, insert, update, delete on table
  public.people,
  public.organizations,
  public.relationships,
  public.interaction_types,
  public.interactions,
  public.tasks
to authenticated, service_role;

grant select, insert, update on table
  public.audit_log,
  public.timeline_events,
  public.action_plan_decisions,
  public.projects
to authenticated, service_role;

grant execute on function public.is_tenant_member(uuid) to authenticated, service_role;
grant execute on function public.has_tenant_role(uuid, text[]) to authenticated, service_role;

do $$
declare
  missing_privileges text[];
begin
  select array_agg(privilege order by privilege)
  into missing_privileges
  from (
    values
      ('authenticated:public.people:select', has_table_privilege('authenticated', 'public.people', 'select')),
      ('authenticated:public.organizations:select', has_table_privilege('authenticated', 'public.organizations', 'select')),
      ('authenticated:public.relationships:select', has_table_privilege('authenticated', 'public.relationships', 'select')),
      ('authenticated:public.interactions:select', has_table_privilege('authenticated', 'public.interactions', 'select')),
      ('authenticated:public.tasks:select', has_table_privilege('authenticated', 'public.tasks', 'select')),
      ('authenticated:public.timeline_events:select', has_table_privilege('authenticated', 'public.timeline_events', 'select')),
      ('authenticated:public.action_plan_decisions:select', has_table_privilege('authenticated', 'public.action_plan_decisions', 'select')),
      ('authenticated:public.projects:select', has_table_privilege('authenticated', 'public.projects', 'select')),
      ('service_role:public.tenants:insert', has_table_privilege('service_role', 'public.tenants', 'insert')),
      ('service_role:public.people:insert', has_table_privilege('service_role', 'public.people', 'insert')),
      ('service_role:public.projects:insert', has_table_privilege('service_role', 'public.projects', 'insert'))
  ) as audit(privilege, granted)
  where not granted;

  if missing_privileges is not null then
    raise exception 'Missing API privileges after hardening: %', array_to_string(missing_privileges, ', ');
  end if;
end $$;
