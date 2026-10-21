-- One personal pilot attempt per tenant, retained permanently by the application.
-- No phone number, message content, API response or key is stored.
create table public.sms_personal_pilot_attempts (
  tenant_id uuid primary key references public.tenants(id) on delete restrict,
  id uuid not null unique default gen_random_uuid(),
  user_id uuid not null,
  recipient_last4 text not null check (recipient_last4 ~ '^[0-9]{4}$'),
  message_sha256 text not null check (message_sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'pending' check (status in ('pending','accepted','rejected','unknown','cancelled')),
  provider_message_id text check (provider_message_id ~ '^[1-9][0-9]{0,31}$'),
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  check ((status = 'pending' and finished_at is null and provider_message_id is null)
    or (status = 'accepted' and finished_at is not null and provider_message_id is not null)
    or (status in ('rejected','unknown','cancelled') and finished_at is not null and provider_message_id is null))
);
alter table public.sms_personal_pilot_attempts enable row level security;
revoke all on public.sms_personal_pilot_attempts from public, anon, authenticated, service_role;
grant select on public.sms_personal_pilot_attempts to authenticated, service_role;
grant insert (tenant_id,user_id,recipient_last4,message_sha256) on public.sms_personal_pilot_attempts to service_role;
grant update (status,provider_message_id) on public.sms_personal_pilot_attempts to service_role;
create policy sms_personal_pilot_owner_read on public.sms_personal_pilot_attempts
for select to authenticated using (user_id = (select auth.uid()) and public.has_tenant_role(tenant_id, array['owner']));
create function public.guard_sms_personal_pilot_attempt()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if old.status <> 'pending' or new.status = 'pending'
    or (new.tenant_id,new.id,new.user_id,new.recipient_last4,new.message_sha256,new.created_at)
      is distinct from (old.tenant_id,old.id,old.user_id,old.recipient_last4,old.message_sha256,old.created_at) then
    raise exception 'SMS_PILOT_TRANSITION_REJECTED';
  end if;
  new.finished_at := clock_timestamp();
  return new;
end;
$$;
revoke all on function public.guard_sms_personal_pilot_attempt() from public, anon, authenticated;
create trigger guard_sms_personal_pilot_attempt before update on public.sms_personal_pilot_attempts
for each row execute function public.guard_sms_personal_pilot_attempt();
