-- Atomic inbound reply recording and cancellation of pending VSC deliveries.
-- The caller must first authenticate the OVH mailbox, verify reply threading,
-- match the original outbound message and sender to this tenant/person.
-- Only the server service_role may invoke this function.
create or replace function public.vsc_record_verified_reply(
  p_tenant_id uuid,
  p_campaign_id uuid,
  p_person_id uuid,
  p_message_id text,
  p_received_at timestamptz
) returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  inserted_count integer;
begin
  if p_message_id is null or length(trim(p_message_id)) not between 1 and 512
     or p_received_at is null then
    raise exception 'Invalid reply metadata';
  end if;

  -- Composite foreign keys prevent attributing a reply to another tenant.
  insert into public.vsc_inbound_replies
    (tenant_id, campaign_id, person_id, provider_message_id, received_at)
  values
    (p_tenant_id, p_campaign_id, p_person_id, trim(p_message_id), p_received_at)
  on conflict (tenant_id, provider_message_id) do nothing;
  get diagnostics inserted_count = row_count;

  if inserted_count = 0 then
    return false;
  end if;

  -- Stop only queued work; claimed work requires a fresh stop check
  -- immediately before provider dispatch.
  update public.vsc_campaign_deliveries
  set status = 'cancelled'
  where tenant_id = p_tenant_id
    and person_id = p_person_id
    and status in ('draft', 'scheduled');

  return true;
end;
$$;

revoke all on function public.vsc_record_verified_reply(uuid,uuid,uuid,text,timestamptz)
  from public, anon, authenticated;
grant execute on function public.vsc_record_verified_reply(uuid,uuid,uuid,text,timestamptz)
  to service_role;
