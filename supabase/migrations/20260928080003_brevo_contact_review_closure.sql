-- Close a review, never rewrite the historical provider outcome or release its lock.
create table public.brevo_contact_reviews (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  attempt_id uuid not null unique references public.brevo_contact_sync_attempts(id) on delete cascade,
  check_id uuid not null references public.brevo_contact_checks(id) on delete cascade,
  user_id uuid not null,
  decision text not null check (decision in ('linked_observed_keep_blocked', 'suppression_observed_keep_blocked')),
  closed_at timestamptz not null default clock_timestamp()
);
create index brevo_contact_reviews_history_idx on public.brevo_contact_reviews(tenant_id, closed_at desc, id desc);
alter table public.brevo_contact_reviews enable row level security;
revoke all on public.brevo_contact_reviews from public, anon, authenticated, service_role;
grant select on public.brevo_contact_reviews to authenticated;
grant select, insert on public.brevo_contact_reviews to service_role;
create policy brevo_contact_reviews_select_admin on public.brevo_contact_reviews
  for select to authenticated using (public.has_tenant_role(tenant_id, array['owner', 'admin']));

create function public.close_brevo_contact_review(
  p_tenant_id uuid, p_user_id uuid, p_attempt_id uuid, p_check_id uuid
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_attempt public.brevo_contact_sync_attempts%rowtype;
  v_check public.brevo_contact_checks%rowtype;
  v_review_id uuid;
  v_decision text;
begin
  perform 1 from public.tenant_users tu join public.roles r on r.id = tu.role_id
    where tu.tenant_id = p_tenant_id and tu.user_id = p_user_id
      and tu.status = 'active' and r.slug in ('owner', 'admin') for share of tu, r;
  if not found then raise exception 'BREVO_CONTACT_REVIEW_REJECTED'; end if;
  -- Serializes competing closures and check inserts (which take FOR SHARE).
  select * into v_attempt from public.brevo_contact_sync_attempts
    where id = p_attempt_id and tenant_id = p_tenant_id for update;
  -- A pending writer may still be active: never close its review.
  if not found or v_attempt.status <> 'write_outcome_unknown' then
    raise exception 'BREVO_CONTACT_REVIEW_REJECTED';
  end if;
  select id into v_review_id from public.brevo_contact_reviews
    where attempt_id = p_attempt_id and tenant_id = p_tenant_id;
  if found then return v_review_id; end if;
  -- Checks are append-only for both client and server roles.
  select * into v_check from public.brevo_contact_checks
    where id = p_check_id and tenant_id = p_tenant_id and attempt_id = p_attempt_id
      and user_id = p_user_id and attempt_status = 'write_outcome_unknown';
  if not found or v_check.recorded_at < clock_timestamp() - interval '5 minutes'
    or v_check.recorded_at > clock_timestamp()
    or v_check.outcome not in ('linked_contact_observed_review_required', 'suppression_observed_review_required')
    -- Equal timestamps cannot establish ordering; fail closed in that case too.
    or exists (select 1 from public.brevo_contact_checks c where c.attempt_id = p_attempt_id
      and c.id <> v_check.id and c.recorded_at >= v_check.recorded_at) then
    raise exception 'BREVO_CONTACT_REVIEW_REJECTED';
  end if;
  v_decision := case v_check.outcome when 'linked_contact_observed_review_required'
    then 'linked_observed_keep_blocked' else 'suppression_observed_keep_blocked' end;
  insert into public.brevo_contact_reviews(tenant_id, attempt_id, check_id, user_id, decision)
    values (p_tenant_id, p_attempt_id, p_check_id, p_user_id, v_decision) returning id into v_review_id;
  -- No UPDATE of attempts: uncertain result and uniqueness lock stay unchanged.
  return v_review_id;
end;
$$;
revoke all on function public.close_brevo_contact_review(uuid,uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.close_brevo_contact_review(uuid,uuid,uuid,uuid) to service_role;
