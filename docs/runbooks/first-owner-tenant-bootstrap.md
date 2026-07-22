# First Owner Tenant Bootstrap

This runbook attaches an existing Supabase Auth user to the first Atlas tenant.

Use it only after a human has confirmed that the target Supabase project is the intended recipe/test environment. Do not run it against production unless a separate production release procedure explicitly authorizes it.

## Purpose

The Atlas application resolves the active tenant through:

1. the authenticated Supabase user;
2. `public.tenant_users` with `status = 'active'`;
3. `public.tenants`;
4. `public.roles`.

If an Auth user exists but `public.tenants`, `public.profiles`, or `public.tenant_users` are missing, Atlas can authenticate the session but cannot resolve a tenant context.

## Script

Use:

```powershell
psql "$env:ATLAS_TEST_DB_URL" `
  -v atlas_bootstrap_user_id="<AUTH_USER_ID>" `
  -v atlas_bootstrap_user_email="<OWNER_EMAIL>" `
  -v atlas_bootstrap_tenant_name="Atlas Test Tenant" `
  -f supabase/bootstrap/001_first_owner.sql
```

Required values:

- `atlas_bootstrap_user_id`: existing `auth.users.id`.
- `atlas_bootstrap_user_email`: existing `auth.users.email`.
- `atlas_bootstrap_tenant_name`: tenant to create or reuse. Use `Atlas Test Tenant` for the recipe tenant unless a human decision changes the tenant name.

Never commit the real user id, owner email, database URL, password, token, or any secret.

## Guarantees

The script is transactional and idempotent.

It:

- verifies exactly one Auth user matches the supplied id and email;
- creates or reuses exactly one tenant with the supplied name;
- sets that tenant to `active`;
- reads the owner role by `slug = 'owner'`;
- creates or updates `public.profiles`;
- creates or updates `public.tenant_users` with `status = 'active'`;
- fails and rolls back if the user already has another active tenant membership;
- fails and rolls back if the target tenant already has another active owner;
- fails and rolls back on ambiguous counts.

The script does not contain `DELETE`, `TRUNCATE`, `DROP`, a reset command, or a migration command.

## After Execution

Run these read-only checks in the same target environment:

```sql
select id, name, status, created_at, updated_at
from public.tenants
order by created_at;

select tu.tenant_id, t.name as tenant_name, tu.user_id, tu.status, r.slug as role_slug
from public.tenant_users tu
join public.tenants t on t.id = tu.tenant_id
join public.roles r on r.id = tu.role_id
where tu.user_id = '<AUTH_USER_ID>';

select id, email, full_name, created_at, updated_at
from public.profiles
where id = '<AUTH_USER_ID>';
```

Expected result:

- one `Atlas Test Tenant` row with `status = 'active'`;
- one tenant membership for the Auth user on that tenant;
- role slug `owner`;
- tenant user status `active`;
- one profile row for the Auth user.

Then sign out and sign back in to Atlas, open `/dashboard`, and verify that the tenant card displays `Atlas Test Tenant`. Open `/pipeline` and confirm it no longer displays `Aucun tenant actif`.
