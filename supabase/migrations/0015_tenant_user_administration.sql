-- Secure tenant member administration for Atlas owner/admin users.

alter table public.tenant_users enable row level security;

revoke insert, update, delete on table public.tenant_users from authenticated;

drop policy if exists tenant_users_manage_for_owners_and_admins on public.tenant_users;

create or replace function public.manage_tenant_member(
  p_target_user_id uuid,
  p_action text,
  p_role_slug text default null
)
returns table (
  tenant_user_id uuid,
  tenant_id uuid,
  user_id uuid,
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
  v_target_tenant_user_id uuid;
  v_target_tenant_id uuid;
  v_target_role text;
  v_target_status text;
  v_new_role_id uuid;
  v_active_owner_count integer;
begin
  if v_actor_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  if p_action not in ('change_role', 'suspend', 'reactivate') then
    raise exception 'TENANT_MEMBER_ACTION_NOT_ALLOWED' using errcode = '22023';
  end if;

  select tu.tenant_id, r.slug
  into v_actor_tenant_id, v_actor_role
  from public.tenant_users tu
  join public.roles r on r.id = tu.role_id
  where tu.user_id = v_actor_user_id
    and tu.status = 'active'
  order by tu.created_at asc
  limit 1;

  if v_actor_tenant_id is null or v_actor_role not in ('owner', 'admin') then
    raise exception 'TENANT_MEMBER_FORBIDDEN' using errcode = '42501';
  end if;

  perform 1
  from public.tenants t
  where t.id = v_actor_tenant_id
  for update;

  select tu.id, tu.tenant_id, r.slug, tu.status
  into v_target_tenant_user_id, v_target_tenant_id, v_target_role, v_target_status
  from public.tenant_users tu
  join public.roles r on r.id = tu.role_id
  where tu.tenant_id = v_actor_tenant_id
    and tu.user_id = p_target_user_id
  for update of tu;

  if v_target_tenant_user_id is null then
    raise exception 'TENANT_MEMBER_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_target_status = 'invited' then
    raise exception 'TENANT_MEMBER_INVITED_NOT_MANAGED' using errcode = '22023';
  end if;

  if p_action = 'suspend' and p_target_user_id = v_actor_user_id then
    raise exception 'TENANT_MEMBER_SELF_SUSPEND_FORBIDDEN' using errcode = '42501';
  end if;

  if v_actor_role = 'admin' then
    if v_target_role = 'owner' then
      raise exception 'TENANT_MEMBER_OWNER_PROTECTED' using errcode = '42501';
    end if;

    if p_action = 'change_role' and p_role_slug = 'owner' then
      raise exception 'TENANT_MEMBER_OWNER_ROLE_FORBIDDEN' using errcode = '42501';
    end if;
  end if;

  if p_action = 'change_role' then
    if p_role_slug not in ('owner', 'admin', 'recruiter', 'manager', 'reader') then
      raise exception 'TENANT_MEMBER_ROLE_NOT_ALLOWED' using errcode = '22023';
    end if;

    if v_target_role = 'owner' and p_role_slug <> 'owner' and v_target_status = 'active' then
      select count(*)
      into v_active_owner_count
      from public.tenant_users tu
      join public.roles r on r.id = tu.role_id
      where tu.tenant_id = v_actor_tenant_id
        and tu.status = 'active'
        and r.slug = 'owner';

      if v_active_owner_count <= 1 then
        raise exception 'TENANT_MEMBER_LAST_OWNER_PROTECTED' using errcode = '42501';
      end if;
    end if;

    select r.id
    into v_new_role_id
    from public.roles r
    where r.slug = p_role_slug;

    if v_new_role_id is null then
      raise exception 'TENANT_MEMBER_ROLE_NOT_FOUND' using errcode = 'P0002';
    end if;

    update public.tenant_users
    set role_id = v_new_role_id
    where id = v_target_tenant_user_id;
  elsif p_action = 'suspend' then
    if v_target_status = 'active' and v_target_role = 'owner' then
      select count(*)
      into v_active_owner_count
      from public.tenant_users tu
      join public.roles r on r.id = tu.role_id
      where tu.tenant_id = v_actor_tenant_id
        and tu.status = 'active'
        and r.slug = 'owner';

      if v_active_owner_count <= 1 then
        raise exception 'TENANT_MEMBER_LAST_OWNER_PROTECTED' using errcode = '42501';
      end if;
    end if;

    update public.tenant_users
    set status = 'suspended'
    where id = v_target_tenant_user_id;
  elsif p_action = 'reactivate' then
    update public.tenant_users
    set status = 'active'
    where id = v_target_tenant_user_id;
  end if;

  return query
  select tu.id, tu.tenant_id, tu.user_id, r.slug, tu.status
  from public.tenant_users tu
  join public.roles r on r.id = tu.role_id
  where tu.id = v_target_tenant_user_id;
end;
$$;

revoke all on function public.manage_tenant_member(uuid, text, text) from public;
grant execute on function public.manage_tenant_member(uuid, text, text) to authenticated, service_role;
