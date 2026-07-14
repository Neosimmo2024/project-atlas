# Project Atlas Documentation

Project Atlas is a multi-tenant SaaS product for recruiting and relationship management in the real estate sector. The stable baseline is `v0.3.0 - Foundation + People + Organizations`.

This documentation converts `docs/Atlas_Master_Plan_v1.0.docx` into maintainable Markdown while preserving the decisions already adopted in the product and codebase.

## Current Stable Scope

- Supabase authentication.
- Multi-tenant foundation.
- Dashboard.
- People module.
- Organizations module.
- Duplicate detection.
- Secured APIs.
- RLS-compatible data access.
- Stable tag: `v0.3.0`.

## Canonical Decisions

- Frontend and server routes: Next.js with TypeScript.
- Database and authentication: Supabase / PostgreSQL.
- Data model: multi-tenant, relational, and protected by RLS.
- Secrets: no real `.env` files, service role key, password, or private key in Git.
- Delivery workflow: GitHub branches, Pull Requests, reviews, and stable tags.
- Validation workflow: `npm run lint`, `npm run typecheck`, `npm run build`, and relevant tests.
- Completed modules at `v0.3.0`: Core Foundation, People, Organizations.

## Documentation Map

- [Atlas vision](vision/atlas-vision.md)
- [Product principles](product/product-principles.md)
- [Roadmap](product/roadmap.md)
- [Architecture](engineering/architecture.md)
- [Security](engineering/security.md)
- [Testing](engineering/testing.md)
- [Release process](engineering/release-process.md)
- [Core data model](data/core-model.md)
- [Relationships specification](specs/relationships.md)

## Source Document

The source of this documentation set is `docs/Atlas_Master_Plan_v1.0.docx`, dated 2026-07-14.

## Contradictions To Track

- `docs/product/SPRINT-001.md` describes Relationships, CSV import, and some future modules as Sprint 001 deliverables, while the Master Plan states that `v0.3.0` contains Core, People, and Organizations only, and that Relationships starts at `v0.4.0`.
- `docs/product/BACKLOG.md` still marks "Creer Supabase" as incomplete, while the Master Plan and the stable product baseline rely on Supabase Auth, PostgreSQL, multi-tenancy, and RLS as adopted and delivered foundations.
