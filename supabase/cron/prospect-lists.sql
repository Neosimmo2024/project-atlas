-- QA first. Snapshots are candidates to review, never approved contacts.
create table public.prospect_lists (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  created_by uuid not null references auth.users(id),
  name text not null check (char_length(name) between 1 and 100),
  postal_code text not null check (postal_code ~ '^[0-9]{5}$'),
  source_page integer not null check (source_page between 1 and 100),
  candidates jsonb not null check (jsonb_typeof(candidates) = 'array' and jsonb_array_length(candidates) <= 2500),
  created_at timestamptz not null default now()
);
create index prospect_lists_tenant_created_idx on public.prospect_lists(tenant_id, created_at desc);
alter table public.prospect_lists enable row level security;
revoke all on public.prospect_lists from public, anon, authenticated;
grant select, insert on public.prospect_lists to authenticated;
create policy prospect_lists_read on public.prospect_lists for select to authenticated
  using (public.is_tenant_member(tenant_id));
create policy prospect_lists_create on public.prospect_lists for insert to authenticated
  with check (created_by = (select auth.uid()) and
    public.has_tenant_role(tenant_id, array['owner','admin','recruiter','manager']));
