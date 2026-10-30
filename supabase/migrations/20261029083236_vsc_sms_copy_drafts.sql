-- Immutable review copies only: no recipients, deliveries, approvals or provider calls.
create table public.vsc_sms_copy_drafts (
  tenant_id uuid not null references public.tenants(id),
  id uuid not null,
  name text not null check (length(trim(name)) between 1 and 150),
  start_date date not null check (start_date <= date '2026-11-30'),
  has_email boolean not null,
  messages jsonb not null check (jsonb_typeof(messages) = 'array' and jsonb_array_length(messages) = 5 and pg_column_size(messages) <= 60000),
  created_at timestamptz not null default now(),
  primary key (tenant_id,id)
);
create index vsc_sms_copy_drafts_recent on public.vsc_sms_copy_drafts(tenant_id,created_at desc,id);
alter table public.vsc_sms_copy_drafts enable row level security;
revoke all on public.vsc_sms_copy_drafts from public,anon,authenticated,service_role;
grant select on public.vsc_sms_copy_drafts to authenticated;
grant select,insert on public.vsc_sms_copy_drafts to service_role;
create policy vsc_sms_copy_drafts_admin_read on public.vsc_sms_copy_drafts for select to authenticated
  using (exists(select 1 from public.tenant_users tu join public.roles r on r.id=tu.role_id
    where tu.tenant_id=vsc_sms_copy_drafts.tenant_id and tu.user_id=auth.uid()
    and tu.status='active' and r.slug in ('owner','admin')));
