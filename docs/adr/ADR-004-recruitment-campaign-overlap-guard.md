# ADR-004: Block overlapping recruitment email campaigns

An open targeted project reserves every project profile and the normalized email
addresses of those profiles, including profiles not yet eligible for an email.
Lyon uses `lyon_development.person_ids`; subsequent targeted campaigns can use
`recruitment_email_campaign.scope = targeted` and `person_ids` / `recipient_ids`.
Reservations end when the project is closed or archived. A targeted sequence
requires the project's ready state, launch flag and reviewed recipient subset.

The existing initial-send RPC passes through a `SECURITY INVOKER` trigger before
creating/retrying a pending sequence. A mailbox advisory lock serializes competing
aliases. Existing same-person sequences are excluded for stable-key replay, while
other-person pending sequences, historical sends and other email queue/history
entries block the send. Case and surrounding whitespace are ignored. Checks remain
tenant scoped; the internal reason function is callable only by the service role
or the existing privileged RPC owner, with no new user or anonymous permissions.

The existing due-step RPC checks the reservation and history before returning each
step to the provider worker. A conflict records `CAMPAIGN_OVERLAP_BLOCKED` on the
step/sequence, sets the step and lifecycle to `error`, and leaves unrelated steps
claimable in the same batch. The conflict must be resolved before manual retry.
Existing worker checks still verify pinned Lyon templates and stop conditions.

This rollout is database-only on Atlas QA Beta 1. It does not launch Lyon, authorize
contacts, create real sequences, queue emails, modify national templates, merge
main or require a frontend deployment. Direct Brevo sends/schedules outside Atlas
are not intercepted. They must be controlled and recorded separately before use.

Validation: `supabase/tests/recruitment_campaign_overlap_guard.sql` runs assertions
against the installed functions in a transaction, then rolls all fixtures back.
It covers all 30 reserved Lyon profiles, mailbox aliases with case/whitespace,
initial-claim rejection, same-person retry, queued national-follow-up rejection,
unrelated follow-ups in the same batch, historical sends, tenant isolation,
function privileges and an explicitly enabled targeted campaign. No provider
endpoint is called. 963 application tests, lint and typecheck also pass.

QA migrations were applied with MCP history versions `20261009062548` and
`20261009062847`; their canonical CLI-generated files use `20261009062247` and
`20261009062829`. Match by name/content when reconciling migration history rather
than reapplying the DDL. This mirrors the existing QA migration workflow.
