# Relationships Specification

## Purpose

Relationships are the business core of Atlas. A relationship links a person to an organization and carries context such as recruitment, management, partnership, customer, supplier, or referrer.

## Roadmap Position

Relationships are planned for `v0.4.0`, after the stable `v0.3.0` baseline containing Core, People, and Organizations.

## Expected Functional Scope

| Function | Expected Behavior |
| --- | --- |
| List | Search, filters, status, phase, owner |
| Creation | Person, organization, type, phase, dates, next action |
| Detail page | History, notes, future interactions |
| Pipeline | Kanban view by phase |
| Security | Tenant imposed, RLS, roles |
| Deduplication | Avoid identical active relationships |
| Tests | Unit, RLS, E2E, manual test |

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

## Security Requirements

- The tenant must be resolved server-side from the authenticated session.
- RLS must protect relationship data.
- Role checks must protect sensitive actions.
- A browser-provided `tenant_id` must never be trusted.

## Explicit Non-Scope For This Documentation Change

This document does not add or modify any application code, route, migration, or database table. It only records the Master Plan expectations for the future Relationships module.
