-- Server-only journal: a permanent claim prevents retries after uncertain SMTP results.
create table public.ionos_delivery_tests (
  tenant_id uuid not null references public.tenants(id),
  test_version text not null,
  requested_by uuid not null,
  status text not null default 'claimed' check (status in ('claimed', 'accepted', 'uncertain')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (tenant_id, test_version)
);
alter table public.ionos_delivery_tests enable row level security;
revoke all on public.ionos_delivery_tests from public, anon, authenticated;
grant select, insert, update on public.ionos_delivery_tests to service_role;
