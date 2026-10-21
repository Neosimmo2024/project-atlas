# ADR-003: Dedicated Lyon email campaign

Lyon must retain its approved J0/J+17/J+32 templates without replacing the tenant’s national initial template or the national J+3/J+7 follow-ups.

Store the three immutable version IDs, a reviewed recipient subset and their verified Brevo template IDs in the Lyon project metadata. Preparation verifies Renato’s sender and template content, preserves project metadata, and never authorizes contacts, starts sequences or queues emails. Partial template creation is persisted for retries.

At explicit launch, pin the project, versions, template IDs and day offsets into a sequence snapshot before sending. Both preparation and execution remain tenant scoped. The worker checks the current project launch flag and recipient subset against this snapshot; missing or mismatched Lyon configuration fails closed. A sequence snapshot retains the campaign identity even if the person’s marker is later removed. National sequences with no Lyon marker or snapshot retain their existing behavior.

The campaign is prepared with launch_enabled=false; all current contact permissions remain unchanged. Preparation is restricted to tenant owners/admins. No launch is part of this change’s rollout.
