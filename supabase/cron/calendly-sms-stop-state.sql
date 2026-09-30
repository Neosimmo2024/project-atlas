-- Apply only to the authorized NEOS QA project. No cron is activated by this file.
create table public.calendly_sms_stop_state (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  lease_id uuid,
  lease_until timestamptz
);
insert into public.calendly_sms_stop_state(singleton) values (true);
create table public.calendly_sms_stop_runs (
  id uuid primary key,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null check (status in ('running','succeeded','failed','expired')),
  summary jsonb
);
alter table public.calendly_sms_stop_state enable row level security;
alter table public.calendly_sms_stop_runs enable row level security;
revoke all on public.calendly_sms_stop_state, public.calendly_sms_stop_runs from public, anon, authenticated, service_role;

create function public.claim_calendly_sms_stop_run() returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid := gen_random_uuid(); v_claimed boolean;
begin
  update public.calendly_sms_stop_state set lease_id=v_id, lease_until=now()+interval '2 minutes'
  where singleton and enabled and (lease_until is null or lease_until < now())
  returning true into v_claimed;
  if not coalesce(v_claimed,false) then return null; end if;
  update public.calendly_sms_stop_runs set status='expired',completed_at=now()
  where status='running' and started_at < now()-interval '2 minutes';
  insert into public.calendly_sms_stop_runs(id,status) values(v_id,'running');
  return v_id;
end;
$$;
create function public.finish_calendly_sms_stop_run(p_id uuid,p_success boolean,p_summary jsonb default null) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_owned boolean;
begin
  update public.calendly_sms_stop_state set lease_id=null,lease_until=null
  where singleton and lease_id=p_id returning true into v_owned;
  if not coalesce(v_owned,false) then return false; end if;
  update public.calendly_sms_stop_runs set completed_at=now(),
    status=case when p_success then 'succeeded' else 'failed' end,
    summary=case when p_success then jsonb_build_object(
      'bookings',(p_summary->>'bookings')::integer,
      'missingEmail',(p_summary->>'missingEmail')::integer,
      'unmatched',(p_summary->>'unmatched')::integer,
      'alreadyStopped',(p_summary->>'alreadyStopped')::integer,
      'planned',(p_summary->>'planned')::integer,
      'added',(p_summary->>'added')::integer) else null end
  where id=p_id and status='running';
  return found;
end;
$$;
revoke all on function public.claim_calendly_sms_stop_run() from public,anon,authenticated;
revoke all on function public.finish_calendly_sms_stop_run(uuid,boolean,jsonb) from public,anon,authenticated;
grant execute on function public.claim_calendly_sms_stop_run() to service_role;
grant execute on function public.finish_calendly_sms_stop_run(uuid,boolean,jsonb) to service_role;
