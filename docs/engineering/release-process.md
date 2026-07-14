# Release Process

## Branches

Feature branches use `feat/<module>` or a similarly scoped branch name. Fix branches use `fix/<subject>`.

## Pull Requests

- One Pull Request contains one coherent feature.
- The PR must be reviewed before merge.
- The GitHub PR workflow is the source of truth for code review.
- Documentation, ADRs, and the Master Plan are updated when a decision changes.

## Required Checks

Before merge, the expected validation commands are:

- `npm run lint`;
- `npm run typecheck`;
- `npm run build`;
- relevant tests for the changed area.

## Migrations

Every schema evolution is versioned as a migration. Existing migrations must not be rewritten after they are part of a shared baseline.

## Tags

Every stable milestone receives a Git tag. The current stable baseline is:

- `v0.3.0 - Foundation + People + Organizations`.

## Language Rules

- Code is written in English.
- The V1 interface is written in French.
