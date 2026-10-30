-- Server-only mailbox checkpoint. Never grants sending or browser write access.
create table public.vsc_imap_cursors (
  tenant_id uuid primary key references public.tenants(id),
  uid_validity text check (uid_validity ~ '^[1-9][0-9]*$'),
  last_uid bigint not null default 0 check (last_uid between 0 and 4294967295),
  version integer not null default 0 check (version >= 0),
  updated_at timestamptz not null default now(),
  check (uid_validity is not null or last_uid = 0)
);
alter table public.vsc_imap_cursors enable row level security;
revoke all on public.vsc_imap_cursors from public, anon, authenticated;
grant select, insert, update on public.vsc_imap_cursors to service_role;
