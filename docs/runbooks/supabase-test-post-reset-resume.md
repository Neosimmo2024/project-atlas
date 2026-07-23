# Supabase test post-reset resume runbook

This runbook covers a non-destructive recovery after the authorized Supabase
test reset has already completed the database reset step but failed during the
post-reset verification phase.

It must not be used before the destructive reset has succeeded. It must never
run `supabase db reset`, `supabase db push`, linked migration commands, or SQL
cleanup commands.

## Authorized incident context

- Supabase project ref: `aqmuvakvienfwzhgzhcw`
- Reset run: `https://github.com/Neosimmo2024/project-atlas/actions/runs/29819906515`
- Main SHA after the reset fix: `2300e42d6249ee15f537ffac41cb61693d4d6bc4`
- Resume confirmation phrase: `RESUME PLATEFORME RECRUTEMENT TEST`
- Protected GitHub environment: `atlas-test-reset`

The original reset run passed the pre-reset snapshot guard, passed the ultimate
destructive-action guard, and completed the official reset from canonical
migrations. It then failed while reloading and verifying schema readiness because
the Session Pooler returned a transient authentication failure for the pooler
user.

## What the resume workflow may do

The workflow `.github/workflows/supabase-test-post-reset-resume.yml` is manual
only and protected by the same GitHub environment used for the reset workflow.

It may only:

1. validate the project ref, confirmation phrase, explicit resume flag, and
   reviewed `authorized_sha`;
2. checkout the reviewed SHA and verify it descends from the post-reset main
   SHA;
3. verify the canonical migration file set is exactly `0001` through `0010`;
4. wait for the IPv4 Session Pooler with bounded retries;
5. verify migration history, tables, RLS, privileges, RPC access, and request a
   PostgREST schema reload;
6. verify the expected Auth user exists;
7. bootstrap the first owner idempotently from `ATLAS_TEST_OWNER_EMAIL`;
8. verify the final Atlas tenant and owner membership state.

## What the resume workflow must never do

- It must never run `supabase db reset`.
- It must never run `supabase db push`.
- It must never run remote migration commands.
- It must never delete, truncate, or drop Atlas data.
- It must never print a password, access token, connection string, or owner
  email.
- It must never accept a project ref other than `aqmuvakvienfwzhgzhcw`.
- It must never bypass the `atlas-test-reset` required reviewer protection.

## Manual trigger values

GitHub path:

1. Repository Actions
2. Supabase Test Post-Reset Resume
3. Run workflow

Inputs must be exactly:

- `project_ref`: `aqmuvakvienfwzhgzhcw`
- `confirmation`: `RESUME PLATEFORME RECRUTEMENT TEST`
- `apply_resume`: `true`
- `authorized_sha`: the reviewed 40-character commit SHA containing the resume
  workflow

Any different value stops the workflow before any Supabase connection.

## Required secrets

The protected environment `atlas-test-reset` must provide these secrets:

- `SUPABASE_DB_PASSWORD`
- `ATLAS_TEST_OWNER_EMAIL`

The resume workflow does not require a Supabase access token because it does not
link a project and does not run Supabase CLI remote commands.

## Session Pooler wait

The workflow uses the official IPv4 Session Pooler:

- host: `aws-0-eu-central-1.pooler.supabase.com`
- port: `5432`
- user: `postgres.aqmuvakvienfwzhgzhcw`
- SSL mode: `require`

It waits for readiness with:

- `POOLER_READY_MAX_ATTEMPTS: 24`
- `POOLER_READY_DELAY_SECONDS: 15`

The total wait window is bounded to about six minutes. If the pooler remains
unavailable, the workflow fails with a clear readiness error and does not run
the owner bootstrap.

## Owner bootstrap

The bootstrap is idempotent:

- it requires exactly one Auth user matching `ATLAS_TEST_OWNER_EMAIL`;
- it creates or reuses `Atlas Test Tenant`;
- it inserts or updates `profiles`;
- it inserts or updates the owner membership in `tenant_users`;
- it refuses unexpected Auth user counts.

If the Auth user is missing, create it manually in Supabase Auth and rerun only
this resume workflow after human approval.

## Final verification

The workflow verifies:

- migration history `0001` through `0010`;
- core Atlas tables;
- RLS on tenant-scoped tables;
- API privileges for authenticated users;
- recruitment pipeline RPC execution privilege;
- PostgREST schema reload request;
- exactly one tenant;
- exactly one tenant owner membership;
- no CI QA seed tenant or profile data.

## Residual risk

This workflow is non-destructive, but it does connect to the authorized Supabase
test project when manually approved. Do not run it from chat, do not run it
against production, and do not run it unless the reset step has already
succeeded.
