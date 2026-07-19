# Recruitment Pipeline UI

## Scope

Sprint 10B adds the operational interface for the recruitment pipeline. Relationships remain the source of truth. The UI does not update `relationships.pipeline_stage`, `owner_user_id`, or contact restrictions directly; every mutation goes through the Sprint 10A server endpoints.

## Pages

- `/pipeline`: authenticated tenant-scoped pipeline view.
- Kanban mode: thirteen columns in the official recruitment order.
- List mode: compact tabular view for scanning, search and filtered review.

## Columns

1. Détection
2. Qualification
3. Premier contact
4. Conversation engagée
5. Rendez-vous obtenu
6. Présentation réalisée
7. Réflexion
8. Négociation
9. Signature
10. Intégration
11. Développement
12. Ambassadeur
13. Refus

## Filters

- Search across relationship fields, people and organizations.
- Pipeline phase.
- Responsible user.
- No responsible user.
- Next action: overdue, today, no next action.
- Contact allowed or blocked.
- Refusal recontactable status.
- Pagination with deterministic ordering.

## Mutations

The UI calls only these endpoints:

- `PATCH /api/relationships/[id]/pipeline`
- `PATCH /api/relationships/[id]/owner`
- `PATCH /api/relationships/[id]/do-not-contact`

The browser never supplies `tenant_id`. Tenant isolation, role checks, allowed transitions and optimistic concurrency remain enforced on the server.

## Special Flows

- Signature requires explicit confirmation and a signature date.
- Refusal requires a refusal reason and can optionally mark the person or organization as do-not-contact.
- Reopening a refused relationship requires a reason and does not clear do-not-contact automatically.
- Owner assignment is available to owner and admin roles only.

## Security

The listing and all actions resolve the tenant from the authenticated session. UUID owner values are used only as form values; the UI never displays raw UUIDs to users.

## Future Evolution

Sprint 10B intentionally does not include forecasting, automation, scoring, notifications, drag-and-drop persistence beyond server transitions, or Sprint 10C features.
