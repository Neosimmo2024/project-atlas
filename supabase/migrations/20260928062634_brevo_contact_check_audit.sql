-- Observations only: this audit never closes an attempt or releases its lock.
create table public.brevo_contact_checks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  attempt_id uuid not null references public.brevo_contact_sync_attempts(id) on delete cascade,
  user_id uuid not null,
  attempt_status text not null check (attempt_status in ('pending', 'write_outcome_unknown')),
  outcome text not null check (outcome in (
    'outcome_unresolved', 'identity_or_state_unverified', 'source_changed',
    'suppression_required', 'suppression_observed_review_required',
    'email_change_requires_review', 'linked_contact_observed_review_required', 'verification_failed'
  )),
  recorded_at timestamptz not null default clock_timestamp()
);
create index brevo_contact_checks_history_idx
  on public.brevo_contact_checks (tenant_id, attempt_id, recorded_at desc, id desc);
alter table public.brevo_contact_checks enable row level security;
revoke all on public.brevo_contact_checks from public, anon, authenticated, service_role;
grant select on public.brevo_contact_checks to authenticated;
grant select, insert on public.brevo_contact_checks to service_role;
create policy brevo_contact_checks_select_admin on public.brevo_contact_checks
  for select to authenticated using (public.has_tenant_role(tenant_id, array['owner', 'admin']));

-- Only the trusted server may record an observation. Invoker: no elevation.
-- Actor is derived from getUser/tenant context, never a submitted form field.
create function public.record_brevo_contact_check(
  p_tenant_id uuid, p_user_id uuid, p_attempt_id uuid,
  p_attempt_status text, p_outcome text
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_attempt public.brevo_contact_sync_attempts%rowtype;
  v_id uuid;
begin
  -- A revocation/role change must serialize with the audit write.
  perform 1 from public.tenant_users tu join public.roles r on r.id = tu.role_id
    where tu.tenant_id = p_tenant_id and tu.user_id = p_user_id
      and tu.status = 'active' and r.slug in ('owner', 'admin')
    for share of tu, r;
  if not found then raise exception 'BREVO_CONTACT_CHECK_REJECTED'; end if;
  select * into v_attempt from public.brevo_contact_sync_attempts
    where id = p_attempt_id and tenant_id = p_tenant_id for share;
  if not found or v_attempt.status not in ('pending', 'write_outcome_unknown')
    or p_attempt_status is distinct from v_attempt.status then
    raise exception 'BREVO_CONTACT_CHECK_REJECTED';
  end if;
  insert into public.brevo_contact_checks(tenant_id, attempt_id, user_id, attempt_status, outcome)
    values (p_tenant_id, p_attempt_id, p_user_id, v_attempt.status, p_outcome)
    returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.record_brevo_contact_check(uuid,uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.record_brevo_contact_check(uuid,uuid,uuid,text,text) to service_role;
