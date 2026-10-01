-- QA first. Qualification never grants permission to send a campaign.
alter table public.prospect_lists add constraint prospect_lists_id_tenant_unique unique (id, tenant_id);
create table public.prospect_reviews (
  list_id uuid not null,
  tenant_id uuid not null,
  siret text not null check (siret ~ '^[0-9]{14}$'),
  status text not null check (status in ('pending','qualified','rejected')),
  kind text not null check (kind in ('unknown','mandataire','agence')),
  email text not null default '' check (length(email) <= 254),
  phone text not null default '' check (phone = '' or phone ~ '^(\+[1-9][0-9]{7,14}|0[0-9]{9})$'),
  source_url text not null default '' check (length(source_url) <= 2000 and (source_url = '' or source_url ~ '^https?://')),
  notes text not null default '' check (length(notes) <= 2000),
  reviewed_by uuid not null references auth.users(id),
  reviewed_at timestamptz not null default now(),
  primary key (list_id, siret),
  foreign key (list_id, tenant_id) references public.prospect_lists(id, tenant_id),
  check ((email = '' and phone = '' and status <> 'qualified') or source_url <> ''),
  check (status <> 'qualified' or (kind <> 'unknown' and (email <> '' or phone <> '')))
);
create index prospect_reviews_tenant_idx on public.prospect_reviews(tenant_id);
create index prospect_reviews_reviewer_idx on public.prospect_reviews(reviewed_by);
alter table public.prospect_reviews enable row level security;
revoke all on public.prospect_reviews from public, anon, authenticated;
grant select, insert on public.prospect_reviews to authenticated;
grant update(status, kind, email, phone, source_url, notes, reviewed_by, list_id, siret, tenant_id) on public.prospect_reviews to authenticated;
create policy prospect_reviews_read on public.prospect_reviews for select to authenticated
  using (public.is_tenant_member(tenant_id));
create policy prospect_reviews_insert on public.prospect_reviews for insert to authenticated
  with check (reviewed_by = (select auth.uid()) and public.has_tenant_role(tenant_id, array['owner','admin','recruiter','manager'])
    and exists (select 1 from public.prospect_lists l where l.id = list_id and l.tenant_id = prospect_reviews.tenant_id and l.candidates @> jsonb_build_array(jsonb_build_object('siret', prospect_reviews.siret))));
create policy prospect_reviews_update on public.prospect_reviews for update to authenticated
  using (public.has_tenant_role(tenant_id, array['owner','admin','recruiter','manager']))
  with check (reviewed_by = (select auth.uid()) and public.has_tenant_role(tenant_id, array['owner','admin','recruiter','manager'])
    and exists (select 1 from public.prospect_lists l where l.id = list_id and l.tenant_id = prospect_reviews.tenant_id and l.candidates @> jsonb_build_array(jsonb_build_object('siret', prospect_reviews.siret))));
create function public.prospect_review_stamp() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if TG_OP = 'UPDATE' and (new.list_id, new.siret, new.tenant_id) is distinct from (old.list_id, old.siret, old.tenant_id) then
    raise exception 'Review identity cannot change';
  end if;
  new.reviewed_at := now();
  return new;
end;
$$;
revoke all on function public.prospect_review_stamp() from public, anon, authenticated;
create trigger prospect_review_stamp before insert or update on public.prospect_reviews for each row execute function public.prospect_review_stamp();
