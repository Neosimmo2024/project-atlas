# Recruitment Pipeline Domain

## Scope

Sprint 10A delivers the server-side foundation for the Atlas recruitment pipeline. It does not add a Kanban board, drag and drop, a new pipeline page, AI scoring, communication sending, imports, sequences, or advanced reporting.

Relationships remain the source of truth. People keep identity and consent information, Interactions keep exchanges, Tasks keep next actions, and Projects remain independent business opportunities.

## Data Model

The canonical phase is `relationships.pipeline_stage`.

Official phase codes:

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

Migration `0010_recruitment_pipeline_domain.sql` maps legacy values:

- `meeting` to `appointment`
- `refusal` to `rejected`
- `closed` to `rejected`

The migration adds `recruitment_pipeline_events` for append-only business history through application and RLS permissions.

## Transition Rules

Allowed transition directions:

- forward;
- backward;
- jump;
- any active phase to `rejected`;
- `rejected` to an active phase with a reopening reason.

No-op transitions to the same phase return the current relationship and do not create useless history.

The server validates every transition. Browser supplied `tenant_id` is ignored by application routes and checked again inside Supabase RPC functions.

## Signature

Entering `signature` requires:

- explicit confirmation;
- a signature date;
- optional start date;
- optional note.

Future signatures are preserved in metadata as scheduled. Leaving `signature` requires owner or admin rights, confirmation, and a correction reason. Prior history remains untouched.

## Rejection

Official rejection reasons:

- `not_interested`
- `conditions`
- `current_network`
- `postponed`
- `profile_mismatch`
- `unresponsive`
- `duplicate`
- `other`

Reason `other` requires a comment. Rejection stores whether the relationship is recontactable, an optional follow-up date, and whether the existing do-not-contact mechanism should be activated.

Rejection never deletes the person, relationship, interactions, tasks, projects, or history.

## Do Not Contact

`do_not_contact` is not a pipeline phase. Atlas reuses the existing person contact blocking field. Reopening a rejected relationship never clears this flag automatically. Clearing it is a separate audited action with a mandatory justification.

## Owner

On creation, the authenticated user becomes owner by default when no owner is supplied. Assigning a different owner is a dedicated action and the target user must be active in the same tenant. Ownerless legacy relationships remain visible to tenant members and can be corrected by authorized users.

## API

Dedicated server actions:

- `PATCH /api/relationships/[id]/pipeline`
- `PATCH /api/relationships/[id]/owner`
- `PATCH /api/relationships/[id]/do-not-contact`

Ordinary `PUT /api/relationships/[id]` cannot change phase or owner.

## Security

RLS remains enabled on Relationships and the new history table. Supabase RPC functions enforce:

- authenticated user required;
- active tenant membership;
- allowed roles for transitions;
- owner/admin rights for owner reassignment and leaving signature;
- same-tenant person, organization, owner, and relationship references;
- optimistic concurrency through expected stage or expected updated timestamp.

## Timeline

Each meaningful pipeline action creates a Timeline event in the same database transaction as the relationship update and history insert. If the history or Timeline insert fails, the phase change fails.
