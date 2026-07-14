# Testing

## Required Validation

Each feature must pass:

- unit tests relevant to the feature;
- `npm run lint`;
- `npm run typecheck`;
- `npm run build`;
- manual business validation before merge.

When the feature changes tenant-sensitive behavior, it must also include integration tests validating RLS and tenant isolation.

## Definition Of Done

- The feature satisfies its acceptance criteria.
- Errors are understandable in the UI.
- Data is really persisted in Supabase.
- Multi-tenancy is respected.
- No secret is committed.
- Unit tests pass.
- Lint, typecheck, and build pass.
- The feature is manually tested.
- The Pull Request is reviewed and merged.
- The branch is deleted after merge.

## RLS And E2E Expectations

Before commercialization:

- RLS tests must be executed with two tenants.
- Authenticated E2E tests must be executed.
- Cross-tenant reads, updates, and deletes must be rejected.
- Browser-provided `tenant_id` values must be ignored.

## Test Data

Test data must be isolated and cleanable. No password, real API key, service role key, or private customer data belongs in the repository.
