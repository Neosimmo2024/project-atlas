# Supabase test reset runbook

This runbook prepares a protected reset for the Atlas Supabase test project only.

It must not be used for production. It must not be run from a chat message. It is
designed for a future human-triggered GitHub Actions run with explicit approval.

## Authorized target

- Supabase project name: plateforme de recrutement
- Supabase project ref: `aqmuvakvienfwzhgzhcw`
- Expected project URL: `https://aqmuvakvienfwzhgzhcw.supabase.co`
- Session Pooler host: `aws-0-eu-central-1.pooler.supabase.com`
- Session Pooler port: `5432`
- Session Pooler user: `postgres.aqmuvakvienfwzhgzhcw`
- Validated repository base SHA: `4dbb483d6418d98bbbd40f0ef9ac72d35f4250a1`

No other project ref is accepted by the workflow.

## What the reset does

The workflow `.github/workflows/supabase-test-reset.yml` is manual only. It is
never triggered by `push`, `pull_request`, or `schedule`.

When a human triggers it with the exact required inputs, the workflow is prepared
to:

1. validate the project ref and confirmation phrase before any Supabase
   connection;
2. checkout the exact human-reviewed commit SHA supplied as `authorized_sha`;
3. fetch repository history for that checkout and verify that it is based on the
   validated main SHA;
4. verify that the migration set is exactly `0001` through `0010`;
5. install a pinned Supabase CLI version;
6. link only the authorized Supabase project;
7. configure PostgreSQL checks through the locked IPv4 Session Pooler with SSL
   required;
8. verify the exact authorized pre-reset snapshot;
9. run the official `supabase db reset --linked --no-seed --yes`;
10. verify migration history, tables, RLS, privileges, functions, and PostgREST
   reload;
11. bootstrap one test owner only if the matching Auth user already exists;
12. verify that no CI QA seed data was introduced.

## Official Supabase behavior used

Supabase documents `supabase db reset --linked` as destructive and intended only
for throwaway dev or staging projects. The command resets the linked remote
database and rebuilds it from local migrations. The CLI reference states that
remote reset identifies and drops user-created entities, while Supabase-managed
schemas such as `auth` and `storage` are excluded by related CLI dump behavior.
Supabase community discussion also confirms that remote reset preserves managed
schemas such as `auth`, including `auth.users`, while dropping public
user-created objects.

The pinned CLI version `2.101.0` has been checked locally for command syntax:

- `supabase db reset` supports `--linked`;
- `supabase db reset` supports `--no-seed`;
- `supabase db reset` supports the global `--yes` flag for non-interactive
  confirmation;
- `supabase migration list` supports `--local`, `--linked`, and `--db-url`.

Operational conclusion for Atlas:

- do not assume `auth.users` is deleted;
- do not assume it is usable without verification;
- verify `auth.users` before and after reset;
- fail if there are multiple unexpected Auth users;
- if the Auth user is missing after reset, create it manually through Supabase
  Auth and rerun only the owner bootstrap procedure.

Storage is treated as managed Supabase state. The reset procedure does not rely
on database reset deleting Storage buckets or objects. The workflow requires
`storage.buckets = 0` and `storage.objects = 0` before reset. If Storage is not
empty, stop and review manually before any destructive action.

GitHub-hosted runners can be IPv4-only. The workflow therefore uses the official
Supabase Shared Pooler in session mode for every remote `psql` check:

- host: `aws-0-eu-central-1.pooler.supabase.com`;
- port: `5432`;
- user: `postgres.aqmuvakvienfwzhgzhcw`;
- SSL mode: `require`.

Each remote `psql` invocation must pass the pooler user explicitly with
`--username="postgres.aqmuvakvienfwzhgzhcw"`. Do not rely only on `PGUSER` or on
libpq defaults; the user suffix is part of the Supabase Session Pooler identity
and must remain visible in the command definition without printing any password
or connection string.

Do not switch `psql` checks back to the direct host
`db.aqmuvakvienfwzhgzhcw.supabase.co`; that endpoint can resolve to IPv6 and is
not reliable from GitHub-hosted runners without an IPv4 add-on. The workflow
still uses `supabase db reset --linked --no-seed --yes` for the official reset
step after all guards pass, with the linked project ref locked separately.

References:

- Supabase CLI reference, `supabase db reset --linked`:
  `https://supabase.com/docs/reference/cli/usage`
- Supabase local development workflow:
  `https://supabase.com/docs/guides/local-development/cli-workflows`
- Supabase Auth user management:
  `https://supabase.com/docs/guides/auth/managing-user-data`

## Required GitHub environment

Create a GitHub Environment named:

`atlas-test-reset`

Recommended protection:

- require manual approval;
- restrict who can approve;
- do not add deployment targets;
- keep environment secrets separate from repository secrets when possible.

The environment reviewer is a blocking safety control. If the GitHub plan in use
does not enforce environment required reviewers for this repository, do not run
the workflow until equivalent human approval is enforced outside GitHub and
recorded in the project notes.

Menu path:

1. GitHub repository
2. Settings
3. Environments
4. New environment
5. Name: `atlas-test-reset`
6. Add required reviewers

## Required GitHub secrets

Create these secrets in the `atlas-test-reset` environment or, if environment
secrets are not available, as repository secrets:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_DB_PASSWORD`
- `ATLAS_TEST_OWNER_EMAIL`

Never paste their values in chat, commit them, attach screenshots containing
them, or print them in terminal logs.

### Where to get the values

`SUPABASE_ACCESS_TOKEN`

- Supabase Dashboard
- Account or organization access tokens
- Create a token with only the permissions needed for the test project reset
- Copy it once directly into the GitHub secret field

`SUPABASE_DB_PASSWORD`

- Supabase Dashboard
- Project settings
- Database
- Database password
- If the password is unknown, rotate it and store the new value directly in the
  GitHub secret

`ATLAS_TEST_OWNER_EMAIL`

- The email address of the Auth user that will become the first Atlas owner
- Store it as a secret so it is not printed by workflow inputs
- The Auth user must already exist before the owner bootstrap step can succeed

## Manual trigger values

Menu path:

1. GitHub repository
2. Actions
3. Supabase Test Reset
4. Run workflow

Inputs must be exactly:

- `project_ref`: `aqmuvakvienfwzhgzhcw`
- `confirmation`: `RESET PLATEFORME RECRUTEMENT TEST`
- `apply_reset`: `true`
- `authorized_sha`: the full 40-character commit SHA that has been reviewed for
  the reset run

Any different value stops the workflow before Supabase is contacted.

After this runbook is merged, use the exact merge commit SHA that contains the
workflow as `authorized_sha`. This avoids hardcoding a future SHA in Git while
still preventing the workflow from silently running whatever `main` happens to
contain later.

The workflow checkout intentionally uses full Git history so the validated main
base SHA can be resolved during the ancestry guard. A shallow checkout can make
Git report the validated base as an invalid commit name and must not be used for
this workflow.

## Exact authorized pre-reset snapshot

The reset is allowed only if the target exactly matches the known throwaway test
database snapshot. The workflow prints table names and counts only, never row
data or personal data.

| Table | Expected count |
| --- | ---: |
| `auth.users` | 1 |
| `storage.buckets` | 0 |
| `storage.objects` | 0 |
| `public.tenants` | 1 |
| `public.tenant_users` | 1 |
| `public.profiles` | 1 |
| `public.people` | 1 |
| `public.organizations` | 1 |
| `public.relationships` | 1 |
| `public.interactions` | 4 |
| `public.tasks` | 4 |
| `public.timeline_events` | 9 |
| `public.audit_log` | 29 |
| `public.action_plan_decisions` | 0 |

If any count differs from the exact authorized snapshot, whether lower or
higher, stop. Do not adjust counters only to make the workflow pass. Any real
evolution of the test database requires a fresh human verification and a new
commit updating the workflow and this runbook. The project ref remains locked to
`aqmuvakvienfwzhgzhcw`; no workflow input can change the target or the expected
snapshot.

## First owner procedure

The existing file `supabase/bootstrap/001_first_owner.sql` is a manual SQL Editor
helper. It is idempotent for `profiles` and `tenant_users`, but it contains
placeholders and the historical tenant name `Neos Immo`. For the reset workflow,
the owner bootstrap is performed inline with protected inputs instead:

- no real email is committed;
- the owner email is read from `ATLAS_TEST_OWNER_EMAIL`;
- the workflow verifies exactly one matching `auth.users` row;
- the workflow creates or reuses `Atlas Test Tenant`;
- the workflow inserts or updates `profiles`;
- the workflow inserts or updates the `owner` membership in `tenant_users`;
- the workflow fails if more than two Auth users are present.

If `auth.users` is empty after reset, create the test user manually from:

1. Supabase Dashboard
2. Authentication
3. Users
4. Add user

Do not put the password in GitHub Actions, Git, chat, or screenshots.

## Post-reset checks

The workflow verifies:

- migration history includes `0001` through `0010`;
- core tables are present;
- `public.projects` exists;
- `public.recruitment_pipeline_events` exists;
- RLS is enabled on tenant-scoped tables;
- API privileges are present for authenticated users;
- `transition_recruitment_pipeline` is executable by `authenticated`;
- PostgREST schema cache is reloaded;
- one tenant exists after bootstrap;
- one owner membership exists after bootstrap;
- no CI QA tenant or profile data was created.

## Stop plan

The workflow stops before reset if:

- `project_ref` is not exactly `aqmuvakvienfwzhgzhcw`;
- `confirmation` is not exactly `RESET PLATEFORME RECRUTEMENT TEST`;
- `apply_reset` is not `true`;
- `authorized_sha` is not a full 40-character SHA;
- a required secret is missing;
- the checked-out commit is not exactly `authorized_sha`;
- the checked-out commit is not based on the validated main SHA;
- the migration set is not exactly `0001` through `0010`;
- the pre-reset table counts differ from the exact authorized snapshot.

After reset starts, the workflow uses `set -euo pipefail` and `ON_ERROR_STOP=1`.
It stops at the first error and prints only non-sensitive diagnostics.

## Dry-run and validation limits

Before the first real reset, run the non-destructive validations from the branch:

- `npm test`
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- local CLI syntax check with `supabase@2.101.0 db reset --help`
- local CLI syntax check with `supabase@2.101.0 migration list --help`

A full local disposable reset also requires Docker and a working Bash shell on
the runner. If Docker or Bash is unavailable locally, do not use a distant
Supabase project as a substitute test target. Use GitHub Actions review and a
separate local runner with Docker for the final non-production rehearsal.

## Local reset simulation

The standard `CI Supabase` workflow runs a local-only simulation before the QA
seed step:

```bash
node scripts/supabase-reset-local-simulation.mjs
```

The simulation refuses to run unless every Supabase API and PostgreSQL URL points
to `localhost` or `127.0.0.1`. It does not use the project ref
`aqmuvakvienfwzhgzhcw`, does not link a Supabase project, does not read GitHub
secrets, and does not contact a remote Supabase host.

The simulation covers:

- canonical migrations `0001` through `0010` from a local database;
- creation of a fictitious pre-reset snapshot with the exact authorized counts;
- strict equality guards for lower values, higher values, unexpected zero,
  missing/NULL observations, Storage buckets, Storage objects, and Auth user
  count drift;
- local input guards for project ref, confirmation phrase, `apply_reset`, and
  `authorized_sha`;
- a local reset with `supabase db reset --no-seed --yes`, without `--linked`;
- post-reset checks for migration history, tables, RLS, API privileges,
  recruitment pipeline RPC access, PostgREST schema reload, and idempotent first
  owner bootstrap.

The simulation intentionally uses a local-only project ref:

`atlas-local-reset-simulation`

This avoids training or testing against the real remote project ref. The remote
workflow remains locked to `aqmuvakvienfwzhgzhcw`; the local simulation never
changes that production safety guard.

### Local and distant behavior differences

The simulation demonstrates Atlas SQL, local Supabase services, local Auth, local
Storage, and the workflow guard logic. It does not prove every managed-service
detail of a linked remote reset.

Known differences to keep explicit:

- local reset uses `supabase db reset --no-seed --yes`, without `--linked`;
- distant test reset uses `supabase db reset --linked --no-seed --yes`;
- local Auth and Storage run inside disposable Docker services;
- remote Auth and Storage are Supabase-managed schemas and services;
- local `auth.users` behavior after reset is recorded by the simulation, but the
  remote workflow must still verify remote `auth.users` before bootstrap;
- local Storage bucket/object guards are exercised, but managed remote Storage
  must still be checked before any distant reset;
- remote PostgreSQL checks are configured through the IPv4 Session Pooler, but
  the managed remote reset path remains unproven until the first human-approved
  reset run.

Do not loosen the remote guards because the local simulation passes. Any future
change to the exact authorized snapshot still requires human verification and a
new commit.

## Cleanup after success

After a successful one-time reset:

1. Remove or rotate `SUPABASE_ACCESS_TOKEN`.
2. Rotate `SUPABASE_DB_PASSWORD` if the reset token/password was temporary.
3. Remove `ATLAS_TEST_OWNER_EMAIL` if no longer needed.
4. Keep the workflow run logs, but never attach secrets manually.
5. Record the GitHub Actions run URL in the project notes.

## Residual risks

- `supabase db reset --linked` is destructive by design.
- Supabase-managed schemas such as `auth` may be preserved; therefore Auth user
  state must always be verified rather than assumed.
- Direct Postgres access depends on the Supabase database host accepting the
  GitHub runner connection.
- The workflow intentionally avoids automatic retries for destructive steps.
