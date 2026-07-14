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

## Initial Recruitment Phases

- Detection.
- Qualification.
- First contact.
- Conversation.
- Meeting.
- Presentation.
- Reflection.
- Negotiation.
- Signature.
- Onboarding.
- Development.
- Ambassador.
- Refusal.
- Closed.

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
