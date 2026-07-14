# Architecture

## Fixed Architecture Rule

No new tool is added without demonstrated necessity and an ADR.

## Adopted Stack

| Layer | Technology | Role |
| --- | --- | --- |
| Frontend | Next.js + TypeScript | UI, pages, and server routes |
| Database | Supabase / PostgreSQL | Data, Auth, RLS, storage |
| Automation | n8n | Workflows and follow-ups |
| Email / SMS | Brevo | Campaigns, transactional emails, SMS |
| AI | OpenAI through an abstraction | Summaries, scoring, generation, recommendations |
| Hosting | Vercel | Application deployment |
| Versioning | GitHub | Code, PRs, ADRs, versions |
| Tests | Vitest + Playwright | Unit, integration, and E2E tests |

## Application Baseline

The stable `v0.3.0` application keeps these foundations:

- Next.js application with server-side route handlers.
- Supabase Auth for authentication.
- PostgreSQL as the durable source of truth.
- Multi-tenant access through tenant-scoped data.
- RLS policies on exposed business tables.
- Server-side tenant resolution.
- People and Organizations modules already merged.

## Module Status At v0.3.0

| Module | Status | Content |
| --- | --- | --- |
| Core Foundation | Done | Next.js, Supabase Auth, multi-tenant, RLS, roles, dashboard |
| People | Done | CRUD, search, pagination, filters, deduplication, Zod validation |
| Organizations | Done | CRUD, hierarchy, search, filters, deduplication, legal data |
| Relationships | To build | Link between people and organizations |
| Interactions | To build | Emails, calls, SMS, WhatsApp, meetings |
| Tasks | To build | Follow-ups, priorities, deadlines |
| Recruitment pipeline | To build | Recruitment stages |
| CSV import | To build | Controlled import and deduplication |
| Brevo / SMS | To build | Campaigns and sequences |
| AI | To build | Summaries, scoring, recommendations |
