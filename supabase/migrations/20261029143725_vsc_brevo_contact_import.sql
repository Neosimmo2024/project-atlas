-- Import existing VSC contacts only. No campaign or delivery creation, no provider writes.
create table public.vsc_brevo_contact_links (
  tenant_id uuid not null references public.tenants(id),
  provider_id bigint not null check(provider_id>0),
  person_id uuid,
  source_email text,
  source_phone text,
  email_blocked boolean not null,
  sms_blocked boolean not null,
  do_not_contact boolean not null,
  source_list_ids bigint[] not null default '{}',
  identity_snapshot jsonb not null,
  source_status_snapshot jsonb not null,
  source_modified_at timestamptz,
  last_outcome text not null check(last_outcome in ('created','matched','conflict','no_coordinates')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_imported_by uuid not null references auth.users(id),
  primary key(tenant_id,provider_id),
  foreign key(tenant_id,person_id) references public.people(tenant_id,id)
);
create index vsc_brevo_contact_links_person on public.vsc_brevo_contact_links(tenant_id,person_id);
alter table public.vsc_brevo_contact_links enable row level security;
revoke all on public.vsc_brevo_contact_links from public,anon,authenticated,service_role;
grant select on public.vsc_brevo_contact_links to authenticated;
grant select,insert,update on public.vsc_brevo_contact_links to service_role;
create policy vsc_brevo_contact_links_admin_read on public.vsc_brevo_contact_links for select to authenticated
  using(exists(select 1 from public.tenant_users tu join public.roles r on r.id=tu.role_id
    where tu.tenant_id=vsc_brevo_contact_links.tenant_id and tu.user_id=auth.uid()
      and tu.status='active' and r.slug in ('owner','admin')));

create function public.vsc_import_normalize_phone(p_phone text) returns text
language sql immutable security invoker set search_path='' as $$
  select case
    when cleaned ~ '^0[1-9][0-9]{8}$' then '+33'||substr(cleaned,2)
    when cleaned ~ '^33[1-9][0-9]{8}$' then '+'||cleaned
    when cleaned ~ '^\+[1-9][0-9]{7,14}$' and (cleaned !~ '^\+33' or cleaned ~ '^\+33[1-9][0-9]{8}$') then cleaned
    when cleaned ~ '^00[1-9][0-9]{7,14}$' and (cleaned !~ '^0033' or cleaned ~ '^0033[1-9][0-9]{8}$') then '+'||substr(cleaned,3)
    else null end
  from(select case when p_phone ~ '^[+0-9 .()\-]+$' then regexp_replace(p_phone,'[ .()\-]','','g') end as cleaned) p;
$$;
revoke all on function public.vsc_import_normalize_phone(text) from public,anon,authenticated;
grant execute on function public.vsc_import_normalize_phone(text) to service_role;

create function public.vsc_import_brevo_contacts(p_tenant_id uuid,p_actor_id uuid,p_groups jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  g jsonb; source_ids bigint[]; candidates uuid[]; linked_person uuid; p public.people%rowtype;
  group_email text; group_phone text; outcome text; source_id bigint; source_snapshot jsonb;
  created_count integer:=0; matched_count integer:=0; conflict_count integer:=0; empty_count integer:=0;
  linked_sources integer:=0; created_ids jsonb:='[]'::jsonb; cancelled_count integer:=0; candidate uuid;
begin
  if p_tenant_id is null or p_actor_id is null or jsonb_typeof(p_groups) is distinct from 'array'
    or jsonb_array_length(p_groups) not between 1 and 100 or pg_column_size(p_groups)>2000000
  then raise exception 'Invalid VSC import request'; end if;
  if not exists(select 1 from public.tenant_users tu join public.roles r on r.id=tu.role_id
    where tu.tenant_id=p_tenant_id and tu.user_id=p_actor_id and tu.status='active' and r.slug in ('owner','admin'))
  then raise exception 'VSC import administrator required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text,1077));
  for g in select value from jsonb_array_elements(p_groups) loop
    if jsonb_typeof(g) is distinct from 'object' or jsonb_typeof(g->'source_ids') is distinct from 'array'
      or jsonb_typeof(g->'source_lists') is distinct from 'array' or jsonb_typeof(g->'identity_snapshot') is distinct from 'object'
      or jsonb_typeof(g->'source_records') is distinct from 'array'
      or jsonb_typeof(g->'display_name') is distinct from 'string' or length(trim(g->>'display_name')) not between 1 and 200
      or jsonb_typeof(g->'email_blocked') is distinct from 'boolean' or jsonb_typeof(g->'sms_blocked') is distinct from 'boolean'
      or jsonb_typeof(g->'do_not_contact') is distinct from 'boolean' or jsonb_typeof(g->'conflict') is distinct from 'boolean'
    then raise exception 'Invalid VSC import group'; end if;
    select array_agg(value::bigint order by value::bigint) into source_ids from jsonb_array_elements_text(g->'source_ids');
    if coalesce(cardinality(source_ids),0) not between 1 and 5000 or exists(select 1 from unnest(source_ids) n where n is null or n<=0)
      or cardinality(source_ids)<>(select count(distinct n) from unnest(source_ids) n)
    then raise exception 'Invalid VSC source identities'; end if;
    group_email:=nullif(lower(trim(g->>'email')),''); group_phone:=nullif(g->>'phone','');
    if group_email is not null and (length(group_email)>320 or group_email !~ '^[^[:space:]@<>;,"\\]+@[^[:space:]@<>;,"\\]+[.][^[:space:]@<>;,"\\]+$' or group_email like '%@mailin-sms.com')
    then raise exception 'Invalid VSC source email'; end if;
    if group_phone is not null and public.vsc_import_normalize_phone(group_phone) is distinct from group_phone
    then raise exception 'Invalid VSC source phone'; end if;
    select array_agg(distinct candidate_id) into candidates from (
      select l.person_id as candidate_id from public.vsc_brevo_contact_links l
        where l.tenant_id=p_tenant_id and l.provider_id=any(source_ids) and l.person_id is not null
      union select pe.id from public.people pe where pe.tenant_id=p_tenant_id and (
        lower(trim(pe.primary_email)) in(select value from jsonb_array_elements_text(g->'identity_snapshot'->'emails'))
        or public.vsc_import_normalize_phone(pe.primary_phone) in(select value from jsonb_array_elements_text(g->'identity_snapshot'->'phones')))
    ) matches;
    linked_person:=null; outcome:=null;
    if (g->>'conflict')::boolean or coalesce(cardinality(candidates),0)>1 then outcome:='conflict';
    elsif cardinality(candidates)=1 then
      linked_person:=candidates[1];
      select * into p from public.people where tenant_id=p_tenant_id and id=linked_person for update;
      if (group_email is not null and nullif(trim(p.primary_email),'') is not null and lower(trim(p.primary_email))<>group_email)
        or (group_phone is not null and nullif(trim(p.primary_phone),'') is not null and public.vsc_import_normalize_phone(p.primary_phone) is distinct from group_phone)
      then outcome:='conflict'; linked_person:=null;
      else
        outcome:='matched';
        -- Fill missing coordinates only; never replace an existing value or contact permission.
        update public.people set
          primary_email=coalesce(nullif(trim(primary_email),''),group_email),
          primary_phone=coalesce(nullif(trim(primary_phone),''),group_phone),
          first_name=coalesce(nullif(trim(first_name),''),g->>'first_name'),
          last_name=coalesce(nullif(trim(last_name),''),g->>'last_name'),
          city=coalesce(nullif(trim(city),''),g->>'city'),
          postal_code=coalesce(nullif(trim(postal_code),''),g->>'postal_code'),
          department=coalesce(nullif(trim(department),''),g->>'department'),
          comments=coalesce(nullif(trim(comments),''),g->>'comments')
        where tenant_id=p_tenant_id and id=linked_person and (
          (nullif(trim(primary_email),'') is null and group_email is not null)
          or (nullif(trim(primary_phone),'') is null and group_phone is not null)
          or (nullif(trim(first_name),'') is null and g->>'first_name' is not null)
          or (nullif(trim(last_name),'') is null and g->>'last_name' is not null)
          or (nullif(trim(city),'') is null and g->>'city' is not null)
          or (nullif(trim(postal_code),'') is null and g->>'postal_code' is not null)
          or (nullif(trim(department),'') is null and g->>'department' is not null)
          or (nullif(trim(comments),'') is null and g->>'comments' is not null));
      end if;
    elsif group_email is null and group_phone is null then outcome:='no_coordinates';
    else
      linked_person:=(g->>'person_id')::uuid;
      insert into public.people(id,tenant_id,display_name,first_name,last_name,primary_email,primary_phone,city,postal_code,department,comments,source,contact_allowed,do_not_contact)
      values(linked_person,p_tenant_id,trim(g->>'display_name'),g->>'first_name',g->>'last_name',group_email,group_phone,
        g->>'city',g->>'postal_code',g->>'department',g->>'comments','Brevo VSC — contacts existants',
        not (g->>'do_not_contact')::boolean and (
          (group_email is not null and not (g->>'email_blocked')::boolean)
          or (coalesce(group_phone ~ '^\+33[67][0-9]{8}$',false) and not (g->>'sms_blocked')::boolean)),
        (g->>'do_not_contact')::boolean);
      outcome:='created'; created_ids:=created_ids||jsonb_build_array(linked_person);
    end if;
    foreach source_id in array source_ids loop
      if (select count(*) from jsonb_array_elements(g->'source_records') r where (r->>'source_id')::bigint=source_id)<>1
      then raise exception 'VSC source snapshot mismatch'; end if;
      select r into source_snapshot from jsonb_array_elements(g->'source_records') r where (r->>'source_id')::bigint=source_id;
      insert into public.vsc_brevo_contact_links(tenant_id,provider_id,person_id,source_email,source_phone,email_blocked,sms_blocked,do_not_contact,
        source_list_ids,identity_snapshot,source_status_snapshot,source_modified_at,last_outcome,last_imported_by)
      values(p_tenant_id,source_id,linked_person,group_email,group_phone,(g->>'email_blocked')::boolean,(g->>'sms_blocked')::boolean,(g->>'do_not_contact')::boolean,
        array(select value::bigint from jsonb_array_elements_text(g->'source_lists')),g->'identity_snapshot',source_snapshot,nullif(g->>'modified_at','')::timestamptz,outcome,p_actor_id)
      on conflict(tenant_id,provider_id) do update set
        person_id=coalesce(public.vsc_brevo_contact_links.person_id,excluded.person_id),
        source_email=excluded.source_email,source_phone=excluded.source_phone,
        email_blocked=public.vsc_brevo_contact_links.email_blocked or excluded.email_blocked,
        sms_blocked=public.vsc_brevo_contact_links.sms_blocked or excluded.sms_blocked,
        do_not_contact=public.vsc_brevo_contact_links.do_not_contact or excluded.do_not_contact,
        source_list_ids=excluded.source_list_ids,identity_snapshot=excluded.identity_snapshot,source_status_snapshot=excluded.source_status_snapshot,
        source_modified_at=excluded.source_modified_at,last_outcome=excluded.last_outcome,last_seen_at=now(),last_imported_by=p_actor_id;
    end loop;
    -- Known exclusions are never removed, including when a source record loses its coordinates.
    for candidate in select l.person_id from public.vsc_brevo_contact_links l
      where l.tenant_id=p_tenant_id and l.provider_id=any(source_ids) and l.person_id is not null
      union select unnest(candidates) loop
      if (g->>'email_blocked')::boolean then cancelled_count:=cancelled_count+public.vsc_unsubscribe_contact(p_tenant_id,candidate,'email'); end if;
      if (g->>'sms_blocked')::boolean then cancelled_count:=cancelled_count+public.vsc_unsubscribe_contact(p_tenant_id,candidate,'sms'); end if;
      if (g->>'do_not_contact')::boolean then
        cancelled_count:=cancelled_count+public.vsc_unsubscribe_contact(p_tenant_id,candidate,'all');
        update public.people set do_not_contact=true where tenant_id=p_tenant_id and id=candidate and not do_not_contact;
      end if;
      if exists(select 1 from public.vsc_brevo_contact_links l where l.tenant_id=p_tenant_id and l.person_id=candidate and l.email_blocked)
      then cancelled_count:=cancelled_count+public.vsc_unsubscribe_contact(p_tenant_id,candidate,'email'); end if;
      if exists(select 1 from public.vsc_brevo_contact_links l where l.tenant_id=p_tenant_id and l.person_id=candidate and l.sms_blocked)
      then cancelled_count:=cancelled_count+public.vsc_unsubscribe_contact(p_tenant_id,candidate,'sms'); end if;
      if exists(select 1 from public.vsc_brevo_contact_links l where l.tenant_id=p_tenant_id and l.person_id=candidate and l.do_not_contact)
      then
        cancelled_count:=cancelled_count+public.vsc_unsubscribe_contact(p_tenant_id,candidate,'all');
        update public.people set do_not_contact=true where tenant_id=p_tenant_id and id=candidate and not do_not_contact;
      end if;
    end loop;
    case outcome when 'created' then created_count:=created_count+1;
      when 'matched' then matched_count:=matched_count+1;
      when 'conflict' then conflict_count:=conflict_count+1;
      else empty_count:=empty_count+1; end case;
    linked_sources:=linked_sources+cardinality(source_ids);
  end loop;
  return jsonb_build_object('created',created_count,'matched',matched_count,'conflicts',conflict_count,'withoutCoordinates',empty_count,
    'sourceContacts',linked_sources,'cancelled',cancelled_count);
end;
$$;
revoke all on function public.vsc_import_brevo_contacts(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.vsc_import_brevo_contacts(uuid,uuid,jsonb) to service_role;
