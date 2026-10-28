-- Dedicated VSC opt-outs; no change to shared people or NEOS campaign tables.
create table public.vsc_contact_suppressions (
  tenant_id uuid not null,
  person_id uuid not null,
  channel text not null check (channel in ('all','email','sms')),
  created_at timestamptz not null default now(),
  primary key (tenant_id, person_id, channel),
  foreign key (tenant_id, person_id) references public.people(tenant_id,id)
);
alter table public.vsc_contact_suppressions enable row level security;
revoke all on public.vsc_contact_suppressions from public, anon, authenticated, service_role;
grant select, insert on public.vsc_contact_suppressions to service_role;
grant select on public.vsc_contact_suppressions to authenticated;
create policy vsc_suppressions_tenant_read on public.vsc_contact_suppressions
  for select to authenticated using (exists (
    select 1 from public.tenant_users tu where tu.tenant_id=vsc_contact_suppressions.tenant_id
      and tu.user_id=(select auth.uid()) and tu.status='active'
  ));

create function public.vsc_unsubscribe_contact(p_tenant_id uuid, p_person_id uuid, p_channel text)
returns integer language plpgsql security invoker set search_path='' as $$
declare cancelled integer;
begin
  if p_channel is null or p_channel not in ('all','email','sms') then raise exception 'Invalid unsubscribe channel'; end if;
  insert into public.vsc_contact_suppressions(tenant_id,person_id,channel)
    values (p_tenant_id,p_person_id,p_channel) on conflict do nothing;
  -- Repeating an opt-out also stops any work queued since the original request.
  update public.vsc_campaign_deliveries set status='cancelled'
    where tenant_id=p_tenant_id and person_id=p_person_id and status in ('draft','scheduled')
      and (p_channel='all' or channel=p_channel);
  get diagnostics cancelled = row_count;
  return cancelled;
end $$;
revoke all on function public.vsc_unsubscribe_contact(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.vsc_unsubscribe_contact(uuid,uuid,text) to service_role;
