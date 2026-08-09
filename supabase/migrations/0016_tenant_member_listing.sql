-- Secure tenant member listing for Atlas owner/admin users.

create or replace function public.list_tenant_members_for_admin()
returns table (
  user_id uuid,
  full_name text,
  email text,
  role_slug text,
  status text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_actor_tenant_id uuid;
  v_actor_role text;
  v_active_membership_count integer;
begin
  if v_actor_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  select count(*)
  into v_active_membership_count
  from public.tenant_users tu
  where tu.user_id = v_actor_user_id
    and tu.status = 'active';

  if v_active_membership_count <> 1 then
    raise exception 'TENANT_CONTEXT_AMBIGUOUS' using errcode = '42501';
  end if;

  select tu.tenant_id, r.slug
  into v_actor_tenant_id, v_actor_role
  from public.tenant_users tu
  join public.roles r on r.id = tu.role_id
  where tu.user_id = v_actor_user_id
    and tu.status = 'active'
  limit 1;

  if v_actor_tenant_id is null or v_actor_role not in ('owner', 'admin') then
    raise exception 'TENANT_MEMBER_FORBIDDEN' using errcode = '42501';
  end if;

  return query
  select
    tu.user_id,
    p.full_name,
    p.email,
    r.slug,
    tu.status
  from public.tenant_users tu
  join public.roles r on r.id = tu.role_id
  left join public.profiles p on p.id = tu.user_id
  where tu.tenant_id = v_actor_tenant_id
  order by tu.created_at asc;
end;
$$;

revoke all on function public.list_tenant_members_for_admin() from public;
revoke all on function public.list_tenant_members_for_admin() from anon;
grant execute on function public.list_tenant_members_for_admin() to authenticated, service_role;
