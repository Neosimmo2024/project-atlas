-- Lot 6: structured, tenant-scoped talent qualification.

create table if not exists public.talent_qualifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  experience_level text,
  professional_status text,
  years_in_real_estate integer check (years_in_real_estate is null or years_in_real_estate between 0 and 80),
  vat_situation text,
  current_network text,
  geographic_area text,
  availability text,
  motivation text,
  primary_need text,
  project_maturity text,
  comments text,
  conclusion text check (conclusion is null or conclusion in ('continue', 'deepen', 'not_retained')),
  state text not null default 'draft' check (state in ('draft', 'completed')),
  completed_at timestamptz,
  completed_by uuid references auth.users(id) on delete set null,
  completed_by_label text,
  updated_by uuid not null references auth.users(id) on delete restrict,
  updated_by_label text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint talent_qualifications_tenant_person_unique unique (tenant_id, person_id),
  constraint talent_qualifications_completion_consistent check (
    (state = 'draft' and completed_at is null and completed_by is null and completed_by_label is null)
    or (state = 'completed' and completed_at is not null and completed_by is not null and completed_by_label is not null and conclusion is not null)
  )
);

create index if not exists talent_qualifications_tenant_state_idx
  on public.talent_qualifications (tenant_id, state);

drop trigger if exists set_talent_qualifications_updated_at on public.talent_qualifications;
create trigger set_talent_qualifications_updated_at
before update on public.talent_qualifications
for each row execute function public.set_updated_at();

drop trigger if exists audit_talent_qualifications_changes on public.talent_qualifications;
create trigger audit_talent_qualifications_changes
after insert or update or delete on public.talent_qualifications
for each row execute function public.audit_changes();

alter table public.talent_qualifications enable row level security;

drop policy if exists talent_qualifications_select_tenant on public.talent_qualifications;
create policy talent_qualifications_select_tenant on public.talent_qualifications
for select using (public.is_tenant_member(tenant_id));

drop policy if exists talent_qualifications_insert_tenant on public.talent_qualifications;
create policy talent_qualifications_insert_tenant on public.talent_qualifications
for insert with check (
  public.has_tenant_role(tenant_id, array['owner', 'admin', 'recruiter', 'manager'])
  and updated_by = auth.uid()
  and exists (
    select 1 from public.people p
    where p.id = person_id and p.tenant_id = talent_qualifications.tenant_id
  )
);

drop policy if exists talent_qualifications_update_tenant on public.talent_qualifications;
create policy talent_qualifications_update_tenant on public.talent_qualifications
for update using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'recruiter', 'manager']))
with check (
  public.has_tenant_role(tenant_id, array['owner', 'admin', 'recruiter', 'manager'])
  and updated_by = auth.uid()
  and exists (
    select 1 from public.people p
    where p.id = person_id and p.tenant_id = talent_qualifications.tenant_id
  )
);

drop policy if exists talent_qualifications_delete_tenant on public.talent_qualifications;
create policy talent_qualifications_delete_tenant on public.talent_qualifications
for delete using (public.has_tenant_role(tenant_id, array['owner', 'admin']));

revoke insert, update, delete on table public.talent_qualifications from authenticated;
grant select on table public.talent_qualifications to authenticated;
grant select, insert, update, delete on table public.talent_qualifications to service_role;

create or replace function public.save_talent_qualification(
  p_person_id uuid,
  p_payload jsonb,
  p_finalize boolean default false
)
returns public.talent_qualifications
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_tenant_id uuid;
  v_actor_label text;
  v_row public.talent_qualifications;
begin
  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  select p.tenant_id into v_tenant_id
  from public.people p
  where p.id = p_person_id and public.is_tenant_member(p.tenant_id);

  if v_tenant_id is null then
    raise exception 'PERSON_NOT_FOUND' using errcode = 'P0002';
  end if;

  if not public.has_tenant_role(v_tenant_id, array['owner', 'admin', 'recruiter', 'manager']) then
    raise exception 'QUALIFICATION_FORBIDDEN' using errcode = '42501';
  end if;

  select coalesce(nullif(trim(p.full_name), ''), nullif(trim(p.email), ''), v_user_id::text)
  into v_actor_label from public.profiles p where p.id = v_user_id;
  v_actor_label := coalesce(v_actor_label, v_user_id::text);

  if p_finalize and nullif(trim(p_payload->>'conclusion'), '') is null then
    raise exception 'QUALIFICATION_CONCLUSION_REQUIRED' using errcode = '22023';
  end if;

  insert into public.talent_qualifications (
    tenant_id, person_id, experience_level, professional_status, years_in_real_estate,
    vat_situation, current_network, geographic_area, availability, motivation,
    primary_need, project_maturity, comments, conclusion, state, completed_at,
    completed_by, completed_by_label, updated_by, updated_by_label
  ) values (
    v_tenant_id, p_person_id, nullif(trim(p_payload->>'experience_level'), ''),
    nullif(trim(p_payload->>'professional_status'), ''),
    nullif(p_payload->>'years_in_real_estate', '')::integer,
    nullif(trim(p_payload->>'vat_situation'), ''), nullif(trim(p_payload->>'current_network'), ''),
    nullif(trim(p_payload->>'geographic_area'), ''), nullif(trim(p_payload->>'availability'), ''),
    nullif(trim(p_payload->>'motivation'), ''), nullif(trim(p_payload->>'primary_need'), ''),
    nullif(trim(p_payload->>'project_maturity'), ''), nullif(trim(p_payload->>'comments'), ''),
    nullif(trim(p_payload->>'conclusion'), ''), case when p_finalize then 'completed' else 'draft' end,
    case when p_finalize then now() else null end, case when p_finalize then v_user_id else null end,
    case when p_finalize then v_actor_label else null end, v_user_id, v_actor_label
  )
  on conflict (tenant_id, person_id) do update set
    experience_level = excluded.experience_level, professional_status = excluded.professional_status,
    years_in_real_estate = excluded.years_in_real_estate, vat_situation = excluded.vat_situation,
    current_network = excluded.current_network, geographic_area = excluded.geographic_area,
    availability = excluded.availability, motivation = excluded.motivation,
    primary_need = excluded.primary_need, project_maturity = excluded.project_maturity,
    comments = excluded.comments, conclusion = excluded.conclusion, state = excluded.state,
    completed_at = excluded.completed_at, completed_by = excluded.completed_by,
    completed_by_label = excluded.completed_by_label, updated_by = excluded.updated_by,
    updated_by_label = excluded.updated_by_label
  returning * into v_row;

  if p_finalize then
    update public.people
    set status = case when v_row.conclusion = 'not_retained' then 'rejected' else 'qualified' end
    where id = p_person_id and tenant_id = v_tenant_id;
  elsif exists (
    select 1 from public.people where id = p_person_id and tenant_id = v_tenant_id and status in ('qualified', 'rejected')
  ) then
    update public.people set status = 'to_qualify'
    where id = p_person_id and tenant_id = v_tenant_id;
  end if;

  return v_row;
end;
$$;

revoke all on function public.save_talent_qualification(uuid, jsonb, boolean) from public, anon;
grant execute on function public.save_talent_qualification(uuid, jsonb, boolean) to authenticated, service_role;
