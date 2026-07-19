# Relationships Specification

## Purpose

Relationships are the business core of Atlas. A relationship links a person to an organization and carries context such as recruitment, management, partnership, customer, supplier, or referrer.

## Roadmap Position

Relationships are implemented during sprint `v0.4.0`, after the stable `v0.3.0` baseline containing Core, People, and Organizations.

## Functional Scope

| Function | Behavior |
| --- | --- |
| List | Search, filters, status, pipeline stage, type, pagination |
| Creation | Person, organization, type, stage, status, dates, score, confidence, notes, tags, metadata |
| Detail page | Identity, linked person, linked organization, pipeline context, dates, notes, metadata |
| Edition | Same fields as creation |
| Deletion | Reserved to owner and admin roles |
| Security | Tenant imposed server-side, RLS, role checks |
| Deduplication | Prevent identical active relationships for the same person, organization, and type |
| Tests | Unit tests, RLS integration placeholders, authenticated E2E placeholder |

## Recruitment Pipeline Phases

The canonical recruitment pipeline is stored in `relationships.pipeline_stage`.
No second phase field should be introduced for recruitment pipeline state.

- `detection`
- `qualification`
- `first_contact`
- `conversation`
- `appointment`
- `presentation`
- `reflection`
- `negotiation`
- `signature`
- `onboarding`
- `development`
- `ambassador`
- `rejected`

Legacy values are migrated as follows:

- `meeting` becomes `appointment`.
- `refusal` becomes `rejected`.
- `closed` becomes `rejected`.

The previous value is preserved in relationship metadata under the recruitment pipeline legacy stage key.

## Table Shape

- `id`
- `tenant_id`
- `person_id`
- `organization_id`
- `relationship_type`
- `pipeline_stage`
- `status`
- `owner_user_id`
- `score`
- `confidence`
- `started_at`
- `ended_at`
- `next_action_at`
- `last_interaction_at`
- `notes`
- `tags`
- `metadata`
- `created_at`
- `updated_at`

## Security Requirements

- The tenant is resolved server-side from the authenticated session.
- RLS protects relationship rows.
- A browser-provided `tenant_id` is never trusted.
- A relationship can only reference a person and an organization from the current tenant.
- Sensitive actions are protected by server-side role checks.
- Two active relationships with the same person, organization, and type are not allowed.

## Recruitment Pipeline Foundation

Sprint 10A adds the server-side recruitment pipeline foundation.

- Ordinary Relationship updates cannot modify `pipeline_stage` or `owner_user_id` directly.
- Pipeline transitions use a central service and Supabase RPC so the relationship update, history event, and timeline event are atomic.
- Transition history is stored in `recruitment_pipeline_events`.
- RLS restricts history visibility to the current tenant.
- Signature requires explicit confirmation and a signature date.
- Rejected requires an official reason; `other` requires a comment.
- Reopening a rejected relationship requires a reason and does not clear `people.do_not_contact`.
- Do-not-contact continues to use the existing person contact blocking field and is audited through the relationship pipeline action.
- Owner assignment requires an active user in the same tenant.
