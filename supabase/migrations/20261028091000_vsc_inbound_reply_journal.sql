-- VendreSonCommerce inbound email journal. No email fetching or sending is enabled.
create table if not exists public.vsc_inbound_replies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  campaign_id uuid not null,
  person_id uuid not null,
  provider_message_id text not null check (length(provider_message_id) between 1 and 512),
  received_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, provider_message_id),
  foreign key (tenant_id, campaign_id) references public.vsc_campaigns(tenant_id, id),
  foreign key (tenant_id, person_id) references public.people(tenant_id, id)
);

alter table public.vsc_inbound_replies enable row level security;
revoke all on public.vsc_inbound_replies from anon, authenticated;
grant select on public.vsc_inbound_replies to authenticated;
create policy vsc_inbound_replies_tenant_read on public.vsc_inbound_replies
  for select to authenticated using (
    exists (select 1 from public.tenant_users tu
      where tu.tenant_id = vsc_inbound_replies.tenant_id
        and tu.user_id = auth.uid() and tu.status = 'active')
  );

create index if not exists vsc_inbound_replies_campaign_person
  on public.vsc_inbound_replies(tenant_id,campaign_id,person_id,received_at desc);
