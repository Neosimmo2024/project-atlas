# Supabase test reset runbook

This runbook prepares a protected reset for the Atlas Supabase test project only.

It must not be used for production. It must not be run from a chat message. It is
designed for a future human-triggered GitHub Actions run with explicit approval.

## Authorized target

- Supabase project name: plateforme de recrutement
- Supabase project ref: `aqmuvakvienfwzhgzhcw`
- Expected project URL: `https://aqmuvakvienfwzhgzhcw.supabase.co`
- Validated repository base SHA: `4dbb483d6418d98bbbd40f0ef9ac72d35f4250a1`

No other project ref is accepted by the workflow.

## What the reset does

The workflow `.github/workflows/supabase-test-reset.yml` is manual only. It is
never triggered by `push`, `pull_request`, or `schedule`.

When a human triggers it with the exact required inputs, the workflow is prepared
to:

1. validate the project ref and confirmation phrase before any Supabase
   connection;
2. verify that the checkout is based on the validated main SHA;
3. verify that the migration set is exactly `0001` through `0010`;
4. install a pinned Supabase CLI version;
5. link only the authorized Supabase project;
6. verify conservative pre-reset row-count ceilings;
7. run the official `supabase db reset --linked --no-seed`;
8. verify migration history, tables, RLS, privileges, functions, and PostgREST
   reload;
9. bootstrap one test owner only if the matching Auth user already exists;
10. verify that no CI QA seed data was introduced.

## Official Supabase behavior used

Supabase documents `supabase db reset --linked` as destructive and intended only
for throwaway dev or staging projects. The command resets the linked remote
database and rebuilds it from local migrations. The CLI reference states that
remote reset identifies and drops user-created entities, while Supabase-managed
schemas such as `auth` and `storage` are excluded by related CLI dump behavior.
Supabase community discussion also confirms that remote reset preserves managed
schemas such as `auth`, including `auth.users`, while dropping public
user-created objects.

Operational conclusion for Atlas:

- do not assume `auth.users` is deleted;
- do not assume it is usable without verification;
- verify `auth.users` before and after reset;
- fail if there are multiple unexpected Auth users;
- if the Auth user is missing after reset, create it manually through Supabase
  Auth and rerun only the owner bootstrap procedure.

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

Any different value stops the workflow before Supabase is contacted.

## Conservative pre-reset row-count ceilings

The reset is allowed only if the target still looks like the known throwaway test
database. The workflow prints counts only, never row data.

| Table | Observed reference | Maximum allowed |
| --- | ---: | ---: |
| `auth.users` | 1 | 2 |
| `public.tenants` | 1 | 2 |
| `public.tenant_users` | 1 | 2 |
| `public.profiles` | 1 | 2 |
| `public.people` | 1 | 5 |
| `public.organizations` | 1 | 5 |
| `public.relationships` | 1 | 5 |
| `public.interactions` | 4 | 20 |
| `public.tasks` | 4 | 20 |
| `public.timeline_events` | 9 | 50 |
| `public.audit_log` | 29 | 100 |
| `public.action_plan_decisions` | 0 | 10 |

If any count exceeds the maximum, stop. Do not raise the limit in the same run.
Review the database identity and data ownership first.

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
- a required secret is missing;
- the checkout is not based on the validated main SHA;
- the migration set is not exactly `0001` through `0010`;
- the pre-reset table counts exceed conservative ceilings;
- no Auth user exists before reset.

After reset starts, the workflow uses `set -euo pipefail` and `ON_ERROR_STOP=1`.
It stops at the first error and prints only non-sensitive diagnostics.

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
