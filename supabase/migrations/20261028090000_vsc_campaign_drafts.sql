-- VendreSonCommerce draft-only campaign persistence.
-- No dispatch worker, provider credentials, or sending grants are introduced.
create table if not exists public.vsc_campaigns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  name text not null check (length(trim(name)) between 1 and 150),
  state text not null default 'draft' check (state in ('draft','approved','active','paused','completed','cancelled')),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  enabled_at timestamptz,
  created_at timestamptz not null default now(),
  constraint vsc_approval_consistency check ((approved_by is null) = (approved_at is null))
);

create table if not exists public.vsc_campaign_deliveries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  campaign_id uuid not null references public.vsc_campaigns(id),
  person_id uuid not null references public.people(id),
  channel text not null check (channel in ('email','sms')),
  step_key text not null,
  scheduled_at timestamptz not null,
  status text not null default 'draft' check (status in ('draft','scheduled','claimed','sent','failed','cancelled')),
  provider_message_id text,
  created_at timestamptz not null default now(),
  unique (tenant_id,campaign_id,person_id,step_key)
);
create unique index if not exists vsc_campaigns_tenant_id_id on public.vsc_campaigns(tenant_id,id);
create unique index if not exists vsc_people_tenant_id_id on public.people(tenant_id,id);
alter table public.vsc_campaign_deliveries
  add constraint vsc_delivery_campaign_tenant_fk foreign key (tenant_id,campaign_id)
  references public.vsc_campaigns(tenant_id,id);
alter table public.vsc_campaign_deliveries
  add constraint vsc_delivery_person_tenant_fk foreign key (tenant_id,person_id)
  references public.people(tenant_id,id);

alter table public.vsc_campaigns enable row level security;
alter table public.vsc_campaign_deliveries enable row level security;
revoke all on public.vsc_campaigns, public.vsc_campaign_deliveries from anon, authenticated;
grant select on public.vsc_campaigns, public.vsc_campaign_deliveries to authenticated;

create policy vsc_campaigns_tenant_read on public.vsc_campaigns
  for select to authenticated
  using (exists (select 1 from public.tenant_users tu
    where tu.tenant_id = vsc_campaigns.tenant_id and tu.user_id = auth.uid() and tu.status='active'));
create policy vsc_deliveries_tenant_read on public.vsc_campaign_deliveries
  for select to authenticated
  using (exists (select 1 from public.tenant_users tu
    where tu.tenant_id = vsc_campaign_deliveries.tenant_id and tu.user_id = auth.uid() and tu.status='active'));
