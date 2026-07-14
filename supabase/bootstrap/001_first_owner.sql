-- Project Atlas first owner bootstrap script.
--
-- Run this script in the Supabase SQL Editor after manually creating
-- the first user in Supabase Auth.
--
-- Replace YOUR_AUTH_USER_ID with the real auth.users.id UUID of the user.
-- Do not commit a real user UUID to the repository.
--
-- Example replacement format:
--   'YOUR_AUTH_USER_ID'::uuid
-- becomes:
--   '00000000-0000-0000-0000-000000000000'::uuid

begin;

do $$
declare
  bootstrap_user_id uuid := 'YOUR_AUTH_USER_ID'::uuid;
  bootstrap_tenant_name text := 'Neos Immo';
  bootstrap_tenant_id uuid;
  owner_role_id uuid;
begin
  if bootstrap_user_id::text = 'YOUR_AUTH_USER_ID' then
    raise exception 'Replace YOUR_AUTH_USER_ID with the real auth.users.id before running this script.';
  end if;

  if not exists (
    select 1
    from auth.users u
    where u.id = bootstrap_user_id
  ) then
    raise exception 'No auth.users row found for id %. Create the user in Supabase Auth first.', bootstrap_user_id;
  end if;

  insert into public.tenants (name, status)
  values (bootstrap_tenant_name, 'active')
  on conflict do nothing;

  select t.id
  into bootstrap_tenant_id
  from public.tenants t
  where t.name = bootstrap_tenant_name
  order by t.created_at asc
  limit 1;

  if bootstrap_tenant_id is null then
    raise exception 'Unable to create or find tenant %.', bootstrap_tenant_name;
  end if;

  select r.id
  into owner_role_id
  from public.roles r
  where r.slug = 'owner';

  if owner_role_id is null then
    raise exception 'Role owner not found. Run supabase/migrations/0001_core.sql first.';
  end if;

  insert into public.profiles (id, email, full_name)
  select
    u.id,
    u.email,
    coalesce(
      u.raw_user_meta_data ->> 'full_name',
      u.raw_user_meta_data ->> 'name',
      u.email
    )
  from auth.users u
  where u.id = bootstrap_user_id
  on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name,
    updated_at = now();

  insert into public.tenant_users (tenant_id, user_id, role_id, status)
  values (bootstrap_tenant_id, bootstrap_user_id, owner_role_id, 'active')
  on conflict (tenant_id, user_id) do update set
    role_id = excluded.role_id,
    status = 'active',
    updated_at = now();
end;
$$;

commit;
