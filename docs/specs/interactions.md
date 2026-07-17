# Interactions Specification

## Purpose

Interactions record every exchange with a person, organization, or relationship. They cover calls, video meetings, in-person meetings, email, SMS, WhatsApp, coaching, training, meetings, and notes.

## Architecture

- Database migration: `supabase/migrations/0004_interactions_module.sql`.
- Repository: `apps/web/src/repositories/interactions.ts`.
- API routes:
  - `GET /api/interactions`
  - `POST /api/interactions`
  - `PUT /api/interactions/[id]`
  - `DELETE /api/interactions/[id]`
- Pages:
  - `/interactions`
  - `/interactions/new`
  - `/interactions/[id]`
- Components:
  - `InteractionForm`
  - `InteractionCard`
  - `InteractionTimelineItem`
  - `InteractionFilters`
  - `InteractionList`

## Data Model

### `interaction_types`

Stores system and tenant-specific interaction types. V1 seeds system types:

- Appel
- Visio
- Presentiel
- Mail
- SMS
- WhatsApp
- Coaching
- Formation
- Reunion
- Note

### `interactions`

Stores tenant-scoped exchanges with optional links to:

- `people`
- `organizations`
- `relationships`

Main fields:

- `title`
- `summary`
- `interaction_date`
- `duration_minutes`
- `location`
- `created_by`
- `metadata`
- `deleted_at`

Business discovery fields stored without computation in V1:

- `change_reason`
- `main_obstacle`
- `timing`
- `dna_compatibility`
- `work_with_person_desire`
- `comments`

## Security

- `tenant_id` is always imposed server-side.
- RLS protects `interaction_types` and `interactions`.
- Reads are allowed to active tenant members.
- Create/update are allowed to owner, admin, recruiter, and manager roles.
- Delete is implemented as repository-level soft delete and reserved to owner/admin.
- API and repository validate that linked people, organizations, relationships, and tenant-specific types belong to the current tenant.

## API

`GET /api/interactions` supports:

- `query`
- `typeId`
- `personId`
- `organizationId`
- `relationshipId`
- `page`
- `pageSize`

`POST /api/interactions` creates an interaction using the current tenant and authenticated user.

`PUT /api/interactions/[id]` updates an interaction in the current tenant.

`DELETE /api/interactions/[id]` soft deletes an interaction by setting `deleted_at`.

## Timeline

V1 exposes timelines on person and organization detail pages by listing recent interactions linked to the corresponding record.

The repository includes a dedicated `recordInteractionTimelineEvent` integration point for a future universal event engine. It is intentionally isolated so a real event writer can be added without refactoring create/update flows.

## Technical Choices

- Soft delete is used for business safety and future audit/reporting.
- Interaction types are normalized in a table instead of hard-coded in interactions.
- Search remains Supabase/PostgREST-based with pagination on the `interactions` query.
- Metadata is stored as `jsonb` for future integrations.
- V1 stores business discovery fields but performs no AI scoring or automation.

## Planned V2 Evolutions

- Universal event table with typed event producers.
- AI-assisted summaries and follow-up extraction.
- Attachment support.
- Email/SMS/WhatsApp synchronization.
- Calendar integration for meetings.
- Timeline aggregation across people, organizations, relationships, tasks, and campaigns.
