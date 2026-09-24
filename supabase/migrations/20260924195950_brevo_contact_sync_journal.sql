-- Local/CI preparation only. No provider activation or remote migration.
create table public.brevo_contact_sync_attempts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  -- Retain actor/person identifiers after deletion, without copying contact data.
  user_id uuid not null,
  person_id uuid not null,
  status text not null default 'pending'
    check (status in ('pending', 'created', 'suppressed', 'blocked', 'skipped', 'failed', 'write_outcome_unknown')),
  result_code text check (result_code in (
    'invalid_identity', 'tenant_mismatch', 'missing_configuration',
    'invalid_email', 'invalid_contact', 'identity_conflict', 'email_change_requires_review',
    'contact_not_allowed', 'already_linked', 'already_blocklisted', 'email_collision',
    'source_changed', 'source_or_lookup_failed', 'provider_rejected', 'reconcile_before_retry', 'unclassified'
  )),
  provider_contact_id bigint check (provider_contact_id between 1 and 9007199254740991),
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  check ((status = 'pending' and finished_at is null and result_code is null and provider_contact_id is null)
    or (status in ('created', 'suppressed') and finished_at is not null and result_code is null and provider_contact_id is not null)
    or (status in ('blocked', 'skipped', 'failed', 'write_outcome_unknown') and finished_at is not null and result_code is not null and provider_contact_id is null))
);

-- Serializes attempts and keeps uncertain/crashed attempts locked for reconciliation.
create unique index brevo_contact_sync_unresolved_unique
  on public.brevo_contact_sync_attempts (tenant_id, person_id)
  where status in ('pending', 'write_outcome_unknown');
create index brevo_contact_sync_history_idx
  on public.brevo_contact_sync_attempts (tenant_id, created_at desc);

alter table public.brevo_contact_sync_attempts enable row level security;
revoke all on public.brevo_contact_sync_attempts from public, anon, authenticated;
grant select on public.brevo_contact_sync_attempts to authenticated;
grant insert (tenant_id, user_id, person_id) on public.brevo_contact_sync_attempts to authenticated;
grant update (status, result_code, provider_contact_id) on public.brevo_contact_sync_attempts to authenticated;

create policy brevo_contact_sync_select_admin on public.brevo_contact_sync_attempts
  for select to authenticated
  using (public.has_tenant_role(tenant_id, array['owner', 'admin']));
create policy brevo_contact_sync_insert_admin on public.brevo_contact_sync_attempts
  for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'pending'
    and public.has_tenant_role(tenant_id, array['owner', 'admin'])
    and exists (select 1 from public.people p where p.id = person_id and p.tenant_id = brevo_contact_sync_attempts.tenant_id));
create policy brevo_contact_sync_finish_actor on public.brevo_contact_sync_attempts
  for update to authenticated
  using (user_id = (select auth.uid()) and status = 'pending'
    and public.has_tenant_role(tenant_id, array['owner', 'admin']))
  with check (user_id = (select auth.uid()) and status <> 'pending'
    and public.has_tenant_role(tenant_id, array['owner', 'admin']));

create function public.guard_brevo_contact_sync_attempt()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if old.status <> 'pending' or new.status = 'pending'
    or (new.id, new.tenant_id, new.user_id, new.person_id, new.created_at)
       is distinct from (old.id, old.tenant_id, old.user_id, old.person_id, old.created_at) then
    raise exception 'BREVO_CONTACT_JOURNAL_TRANSITION_REJECTED';
  end if;
  new.finished_at := clock_timestamp();
  return new;
end;
$$;
revoke all on function public.guard_brevo_contact_sync_attempt() from public, anon, authenticated;
create trigger guard_brevo_contact_sync_attempt
  before update on public.brevo_contact_sync_attempts
  for each row execute function public.guard_brevo_contact_sync_attempt();
