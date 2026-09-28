-- SECURITY INVOKER audit RPCs need SELECT and UPDATE on at least one column
-- of each locked table (FOR SHARE / FOR UPDATE). Hosted QA does not inherit
-- local Supabase's broad default service_role table grants.
grant select on public.roles, public.tenant_users, public.brevo_contact_sync_attempts to service_role;
-- Timestamp-only permission cannot change a role's slug or a membership's role.
grant update (updated_at) on public.roles, public.tenant_users to service_role;
-- Any attempted UPDATE of this column is still rejected by the journal guard:
-- pending -> pending and every change to a terminal attempt are forbidden.
-- This permission allows row locking without permission to revise outcomes.
grant update (id) on public.brevo_contact_sync_attempts to service_role;
